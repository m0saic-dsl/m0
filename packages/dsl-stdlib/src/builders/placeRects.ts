/**
 * Place Rects builder.
 *
 * Places N axis-aligned rectangles inside a root canvas, packing them onto
 * as few m0 overlay layers as possible:
 *   - All non-overlapping rects fit on a single layer (one compact m0
 *     expression with N frames).
 *   - Overlapping rects spill onto additional nested layers via greedy
 *     first-fit assignment.
 *
 * Each rect becomes one rendered frame (default token "F"). Empty space
 * within a layer is filled with the empty token (default "-").
 *
 * Layers compose as nested overlays: `L0 { L1 { L2 { ... } } }`. Callers
 * that want a different composition (e.g. on top of a base) can grab the
 * per-layer expressions from `layers[i].m0` and compose themselves.
 *
 * Useful for any caller that has a set of rect placements and doesn't want
 * to figure out the band decomposition by hand — QR channel emission and
 * SVG → m0 conversion both benefit from this.
 */

import type { M0String } from "@m0saic/dsl";
import { container } from "./container";
import { toM0String } from "../constructors/toM0String";
import { weightedTokens } from "./weightedTokens";
import { gcdOfArray } from "./_internal/barSplit";

// ── Types ─────────────────────────────────────────────────

export type PlaceRectsRect = {
  /** Top-left x in root canvas units (pixels or cells). Non-negative integer. */
  x: number;
  /** Top-left y in root canvas units. Non-negative integer. */
  y: number;
  /** Width in root canvas units. Positive integer. */
  w: number;
  /** Height in root canvas units. Positive integer. */
  h: number;
  /** Claimant token rendered at this rect. Default `"F"`. */
  claimant?: string;
  /**
   * Relative paint priority. Default `0`. A rect with higher `importance` ALWAYS
   * paints above one with lower `importance` — the most important rects are
   * guaranteed on top.
   *
   * This is NOT a fixed layer index: rects of EQUAL importance have no defined
   * order relative to each other (two equal-importance rects that can't share a
   * layer are auto-split across layers, but both still sit below any
   * higher-importance rect). So use it to say "these are equally important" vs
   * "this one is more important" — not to pin an exact overlay layer.
   *
   * Mechanics: rects are bucketed by `importance` ascending; the greedy
   * first-fit packing runs WITHIN each bucket (so same-importance rects still
   * collapse onto as few layers as possible), and the buckets are emitted
   * base→top. Reach for it when overlap order is load-bearing — chart labels
   * over their data tiles, a logo over the QR it overlays — instead of relying
   * on the greedy packer's incidental layer assignment (which can drop a label
   * under a tile when few rects share layers). Omitting `importance` everywhere
   * is byte-identical to the un-prioritized behavior.
   */
  importance?: number;
};

export type PlaceRectsOptions = {
  /** Root canvas width. Positive integer. */
  rootW: number;
  /** Root canvas height. Positive integer. */
  rootH: number;
  /** Rectangles to place. */
  rects: PlaceRectsRect[];
  /** Token used for empty cells. Default `"-"`. */
  emptyToken?: string;
};

export type PlaceRectsLayer = {
  /** Rect indices (from `opts.rects`) placed on this layer. */
  rectIndices: number[];
  /** Full-canvas m0 expression placing these rects with empties elsewhere. */
  m0: M0String;
};

export type PlaceRectsResult = {
  /** Composed m0 — all layers chained as nested overlays. */
  m0: M0String;
  /** Per-layer breakdown for callers that want to compose differently. */
  layers: PlaceRectsLayer[];
};

// ── Main ──────────────────────────────────────────────────

export function placeRects(opts: PlaceRectsOptions): PlaceRectsResult {
  const { rootW, rootH, rects, emptyToken = "-" } = opts;

  // ── Input validation ──
  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error(`placeRects: rootW must be a positive integer, got ${rootW}`);
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error(`placeRects: rootH must be a positive integer, got ${rootH}`);
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!Number.isInteger(r.x) || r.x < 0)
      throw new Error(`placeRects: rects[${i}].x must be a non-negative integer, got ${r.x}`);
    if (!Number.isInteger(r.y) || r.y < 0)
      throw new Error(`placeRects: rects[${i}].y must be a non-negative integer, got ${r.y}`);
    if (!Number.isInteger(r.w) || r.w < 1)
      throw new Error(`placeRects: rects[${i}].w must be a positive integer, got ${r.w}`);
    if (!Number.isInteger(r.h) || r.h < 1)
      throw new Error(`placeRects: rects[${i}].h must be a positive integer, got ${r.h}`);
    if (r.x + r.w > rootW)
      throw new Error(`placeRects: rects[${i}] (x=${r.x}, w=${r.w}) overflows rootW=${rootW}`);
    if (r.y + r.h > rootH)
      throw new Error(`placeRects: rects[${i}] (y=${r.y}, h=${r.h}) overflows rootH=${rootH}`);
    if (r.importance !== undefined && !Number.isFinite(r.importance))
      throw new Error(`placeRects: rects[${i}].importance must be a finite number, got ${r.importance}`);
  }

  if (rects.length === 0) {
    throw new Error(
      "placeRects: rects must be non-empty. Callers should guard the empty case themselves (no overlay needed when there's nothing to place).",
    );
  }

  // ── 1. Pack rects into layers via greedy first-fit ──
  //
  // Two kinds of conflict force rects onto different layers:
  //   1. Geometric OVERLAP (the usual case).
  //   2. Y-SUBDIVISION (either direction) — when one rect has a horizontal
  //      edge strictly inside another rect's Y range. The band decomposition
  //      below cuts each layer into horizontal bands at EVERY rect edge, so a
  //      subdivided rect would be emitted once per band — fragmented into
  //      multiple frames (and a compound claimant would additionally squash
  //      to each band's height). placeRects' contract is to place ALL the
  //      rects as optimally as possible — one rect = exactly one frame — so
  //      any rect that another would slice spills to a fresh layer instead of
  //      fragmenting on a shared one.
  const layerAssignments = packIntoLayers(rects);

  // ── 2. Build each layer's m0 expression ──
  const layers: PlaceRectsLayer[] = layerAssignments.map((rectIndices) => {
    const layerRects = rectIndices.map((i) => rects[i]);
    const m0 = buildLayerExpression(layerRects, rootW, rootH, emptyToken);
    return { rectIndices, m0 };
  });

  // ── 3. Chain layers as nested overlays: L0 { L1 { L2 { ... } } } ──
  let inner = "";
  for (let i = layers.length - 1; i >= 0; i--) {
    inner = inner ? `${String(layers[i].m0)}{${inner}}` : String(layers[i].m0);
  }

  // Validate only when at least one input claimant carries paint. A
  // placeRects call where every claimant is pure-light (logical-owner
  // markers for the quiet zone, separators, etc.) is a useful pattern —
  // it produces structurally well-formed overlay m0 that the caller
  // composes with a paint-bearing base layer. Standalone, that overlay
  // would always trip NO_SOURCES; the caller takes on the responsibility
  // of ensuring the final composition has paint.
  //
  // Paint detection: `F` is unambiguous (a letter, never appears inside
  // a digit-count prefix). `1` must be matched as a standalone token —
  // surrounded by non-digit chars — so `41[...]` (a 41-cell split) isn't
  // mistaken for paint by the embedded `1`.
  const inputHasPaint = rects.some((r) => claimantHasPaint(r.claimant ?? "F"));
  const composed = inputHasPaint
    ? toM0String(inner, "placeRects")
    : (inner as M0String);

  return { m0: composed, layers };
}

// ── Layer packing (greedy first-fit) ────────────────────────

/**
 * Pure geometric overlap (shared edges don't count). Exported as the single
 * source of truth for callers that need overlap precedence separately from
 * {@link rectsConflict} — e.g. z-order-preserving packers, where only an actual
 * overlap (not a y-subdivision) constrains the stacking order.
 */
export function rectsOverlap(a: PlaceRectsRect, b: PlaceRectsRect): boolean {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  );
}

/**
 * Does `divider`'s top or bottom edge fall STRICTLY inside `divided`'s Y
 * range? If yes, `divider` subdivides `divided` into multiple bands.
 */
function yBoundarySubdivides(divider: PlaceRectsRect, divided: PlaceRectsRect): boolean {
  const top = divider.y;
  const bottom = divider.y + divider.h;
  const dTop = divided.y;
  const dBottom = divided.y + divided.h;
  return (top > dTop && top < dBottom) || (bottom > dTop && bottom < dBottom);
}

/**
 * Returns `true` when `a` and `b` cannot share a layer — either they overlap
 * geometrically, or one's horizontal edge falls strictly inside the other's Y
 * range (which the band decomposition would fragment into multiple frames).
 * Either direction counts, and it applies to every claimant: the contract is
 * one rect → one frame, so a rect that would be sliced spills to a new layer.
 */
export function rectsConflict(a: PlaceRectsRect, b: PlaceRectsRect): boolean {
  return (
    rectsOverlap(a, b) ||
    yBoundarySubdivides(a, b) ||
    yBoundarySubdivides(b, a)
  );
}

function packIntoLayers(rects: PlaceRectsRect[]): number[][] {
  // Bucket rect indices by importance (default 0), ascending — lower importance
  // = base layers. Greedy first-fit packs WITHIN each bucket; cross-bucket
  // overlaps are fine (a more-important bucket overlays everything below it), so
  // a higher-importance rect always paints above a lower one even when they
  // could have shared a layer.
  const byImportance = new Map<number, number[]>();
  for (let i = 0; i < rects.length; i++) {
    const imp = rects[i].importance ?? 0;
    const bucket = byImportance.get(imp);
    if (bucket) bucket.push(i);
    else byImportance.set(imp, [i]);
  }
  const tiers = [...byImportance.keys()].sort((a, b) => a - b);

  const layers: number[][] = [];
  for (const imp of tiers) {
    const bucketLayers: number[][] = [];
    for (const i of byImportance.get(imp)!) {
      let placed = false;
      for (const layer of bucketLayers) {
        if (layer.every((j) => !rectsConflict(rects[i], rects[j]))) {
          layer.push(i);
          placed = true;
          break;
        }
      }
      if (!placed) bucketLayers.push([i]);
    }
    layers.push(...bucketLayers); // this tier's layers stack above all lower importance
  }
  return layers;
}

// ── Single-layer band decomposition ─────────────────────────

function buildLayerExpression(
  rects: PlaceRectsRect[],
  rootW: number,
  rootH: number,
  emptyToken: string,
): M0String {
  // 1. Compute Y boundaries: 0, rootH, and each rect's top/bottom.
  const ySet = new Set<number>([0, rootH]);
  for (const r of rects) {
    ySet.add(r.y);
    ySet.add(r.y + r.h);
  }
  const ys = Array.from(ySet).sort((a, b) => a - b);

  // 2. For each band [ys[i], ys[i+1]), find rects that span the band and
  // build the band's row expression.
  type BandSeg = { height: number; content: string };
  const bandSegments: BandSeg[] = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const top = ys[i];
    const bottom = ys[i + 1];
    const height = bottom - top;
    if (height === 0) continue;

    const inBand = rects.filter((r) => r.y <= top && r.y + r.h >= bottom);
    if (inBand.length === 0) {
      bandSegments.push({ height, content: emptyToken });
    } else {
      const row = buildHorizontalRowExpression(inBand, rootW, emptyToken);
      bandSegments.push({ height, content: row });
    }
  }

  // 3. Combine bands into outer column container.
  return buildOuterColumn(bandSegments, "row");
}

function buildHorizontalRowExpression(
  rectsInBand: PlaceRectsRect[],
  rootW: number,
  emptyToken: string,
): string {
  // Sort by x.
  const sorted = [...rectsInBand].sort((a, b) => a.x - b.x);

  // Walk left to right, emitting empty segments for gaps and rect claimants.
  type HSeg = { width: number; claimant: string };
  const segs: HSeg[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.x > cursor) segs.push({ width: r.x - cursor, claimant: emptyToken });
    segs.push({ width: r.w, claimant: r.claimant ?? "F" });
    cursor = r.x + r.w;
  }
  if (cursor < rootW) segs.push({ width: rootW - cursor, claimant: emptyToken });

  // GCD-reduce widths for compact output.
  const widths = segs.map((s) => s.width);
  const g = gcdOfArray(widths);
  const reduced = widths.map((w) => w / g);

  const tokens: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    tokens.push(...weightedTokens(reduced[i], segs[i].claimant));
  }
  // Horizontal split: produces "N(...)". Raw assembly (no `container`
  // call) because a band may legitimately have only pure-light claimants
  // — perfectly fine inside the final composition, but a standalone
  // fragment with no root paint fails `toM0String`'s NO_SOURCES check.
  // Validation runs once at the end on the composed multi-layer m0.
  if (tokens.length === 1) return tokens[0];
  return `${tokens.length}(${tokens.join(",")})`;
}

function buildOuterColumn(
  bands: { height: number; content: string }[],
  axis: "row",
): M0String {
  // GCD-reduce heights for compact output.
  const heights = bands.map((b) => b.height);
  const g = gcdOfArray(heights);
  const reduced = heights.map((h) => h / g);

  const tokens: string[] = [];
  for (let i = 0; i < bands.length; i++) {
    tokens.push(...weightedTokens(reduced[i], bands[i].content));
  }
  // Vertical split: produces "N[...]". Raw assembly for the same reason
  // as `buildHorizontalRowExpression` above — a layer may not be a valid
  // standalone m0 when all its claimants are pure-light, but the composed
  // multi-layer result will be.
  const raw = tokens.length === 1 ? tokens[0] : `${tokens.length}[${tokens.join(",")}]`;
  return raw as M0String;
}

// ── Claimant shape detection ────────────────────────────────

/**
 * Does `claimant` paint anywhere? `F` matches as itself (never appears
 * inside a digit-count prefix). `1` only counts when it's a standalone
 * token — not part of a multi-digit number like `41[...]` or `14(...)`.
 */
function claimantHasPaint(claimant: string): boolean {
  if (claimant.indexOf("F") !== -1) return true;
  // `1` not preceded or followed by another digit.
  return /(?<![0-9])1(?![0-9])/.test(claimant);
}

