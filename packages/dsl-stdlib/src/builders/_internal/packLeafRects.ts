/**
 * Pack Leaf Rects — the shared rebuild engine.
 *
 * Given a set of integer rects already collected in PAINT ORDER (base →
 * top), pack them onto as few m0 overlay layers as possible and return the
 * rebuilt document plus, for each input rect, the stableKey + logicalIndex
 * it acquired in the rebuilt m0. This is the identity-preserving core that
 * both {@link compactDocument} and {@link rebuildRects} share:
 *
 *   collect (caller) → **minLayer z-preserving first-fit** → per-layer
 *   `placeRects` → compose nested overlays → validate → optional lossless
 *   `reduceSplitCounts` tidy → `(overlayDepth|x|y|w|h)` identity lookup.
 *
 * ## The minLayer constraint (z-order preservation)
 *
 * When `preserveZOrder` is true a rect can only land ABOVE every
 * earlier-painted rect it geometrically OVERLAPS. Plain first-fit (lowest
 * non-conflicting layer) preserves stacking for a directly-overlapping PAIR
 * but inverts a transitive chain — A over B over C where A and C don't
 * touch: C (no conflict with A) drops onto A's layer and sinks beneath B.
 * Constraining each rect to `1 + max(layer of earlier overlappers)` keeps
 * the input paint order exactly wherever it is observable (i.e. on overlap).
 *
 * The caller owns rect COLLECTION (render-walk order, rounding, any snap or
 * override) and owns the OLD-key knowledge needed to build rekey /
 * sourceOrder maps — this module only rebuilds and re-identifies. It is the
 * behavior-preserving extraction of compactDocument's pack block: that
 * builder's byte-identical test suite locks this code.
 *
 * Pure and deterministic. No I/O. Internal to `@m0saic/dsl-stdlib`.
 */

import type { M0String } from "@m0saic/dsl";
import { placeRects, rectsConflict, rectsOverlap } from "../placeRects";
import type { PlaceRectsRect } from "../placeRects";
import { queryFrames } from "../../queries/queryFrames";
import { getLayerCount } from "../../queries/getLayerCount";
import { reduceSplitCounts } from "../../transforms/primitives/split/reduceSplitCounts";
import { validateInputOrThrow } from "../../transforms/_internal/output";

/**
 * A rendered leaf is usually kind "frame", but a layer whose whole canvas
 * is one tile (m0 `1` — a full-canvas base under overlay layers, or a
 * repacked layer holding a single full-canvas rect) parses as kind "root"
 * with `nullFrame` false. Container roots (splits) are `nullFrame` true, so
 * the flag keeps them excluded.
 */
export function isRenderedLeaf(f: {
  kind: string;
  nullFrame?: boolean;
  passthroughFrame?: boolean;
}): boolean {
  return (
    (f.kind === "frame" || f.kind === "root") &&
    !f.nullFrame &&
    !f.passthroughFrame
  );
}

export type PackLeafRectsOptions = {
  /**
   * Rects to pack, in PAINT ORDER (base → top). Integer doc px, in-bounds
   * of `width`/`height`. The caller is responsible for rounding /
   * clamping / override application before this call.
   */
  rects: PlaceRectsRect[];
  /** Canvas width in px. Positive integer. */
  width: number;
  /** Canvas height in px. Positive integer. */
  height: number;
  /**
   * Preserve the input stacking via the minLayer constraint. Default true.
   * When false, packs by geometry alone (fewer layers, but overlap paint
   * order may change).
   */
  preserveZOrder?: boolean;
  /**
   * Run the lossless {@link reduceSplitCounts} tidy after packing. Default
   * false. Preserves geometry + overlay depth, so the identity lookup still
   * resolves against the reduced m0.
   */
  reduceSplits?: boolean;
};

/** The identity a single input rect acquired in the rebuilt document. */
export type PackedLeaf = {
  /** New stableKey of this rect's rendered leaf. */
  stableKey: string;
  /** New logicalIndex (positional source binding) of this rect. */
  logicalIndex: number;
  /** The overlay layer this rect landed on (0 = base). */
  layer: number;
};

export type PackLeafRectsResult = {
  /** The rebuilt, validated document. */
  m0: M0String;
  /**
   * `placed[i]` is the identity input rect `i` acquired in the rebuilt m0
   * (same order as `opts.rects`). Callers zip this against their old-key
   * knowledge to build rekey / liveKeys / sourceOrder.
   */
  placed: PackedLeaf[];
  /** Overlay layer count of the rebuilt document. */
  layersAfter: number;
  /** Number of splits the lossless `reduceSplits` tidy collapsed (0 if off). */
  reducedSplits: number;
};

export function packLeafRects(opts: PackLeafRectsOptions): PackLeafRectsResult {
  const { width, height } = opts;
  if (!Number.isInteger(width) || width < 1)
    throw new Error(`packLeafRects: width must be a positive integer, got ${width}`);
  if (!Number.isInteger(height) || height < 1)
    throw new Error(`packLeafRects: height must be a positive integer, got ${height}`);
  const placed = opts.rects;
  if (placed.length === 0)
    throw new Error("packLeafRects: rects must be non-empty");
  const preserveZOrder = opts.preserveZOrder ?? true;
  const doReduceSplits = opts.reduceSplits ?? false;
  const dims = { width, height };

  // ── Identity-preserving, z-order-preserving first-fit ──
  // Conflict = geometric overlap OR y-subdivision in either direction.
  // Without the subdivision rule placeRects' band decomposition would split
  // a rect into multiple frames, and per-frame sidecar metadata (masks
  // especially) would no longer describe a single rect.
  const assignments: number[][] = [];
  const layerOf: number[] = new Array(placed.length).fill(0);
  for (let i = 0; i < placed.length; i++) {
    let minLayer = 0;
    if (preserveZOrder) {
      for (let j = 0; j < i; j++) {
        if (rectsOverlap(placed[i], placed[j])) minLayer = Math.max(minLayer, layerOf[j] + 1);
      }
    }
    let target = -1;
    for (let li = minLayer; li < assignments.length; li++) {
      if (assignments[li].every((j) => !rectsConflict(placed[i], placed[j]))) {
        target = li;
        break;
      }
    }
    if (target < 0) {
      // No reusable layer at/above minLayer → new top layer. minLayer is
      // always ≤ assignments.length (it derives from existing layer indices),
      // so this never leaves an empty gap below it.
      assignments.push([]);
      target = assignments.length - 1;
    }
    assignments[target].push(i);
    layerOf[i] = target;
  }

  const layerExprs = assignments.map((indices) => {
    const res = placeRects({
      rootW: width,
      rootH: height,
      rects: indices.map((j) => placed[j]),
    });
    if (res.layers.length !== 1) {
      throw new Error(
        "packLeafRects: internal invariant — conflict-free layer still spilled in placeRects",
      );
    }
    return String(res.layers[0].m0);
  });

  let composed = layerExprs[layerExprs.length - 1];
  for (let li = layerExprs.length - 2; li >= 0; li--) {
    composed = `${layerExprs[li]}{${composed}}`;
  }
  let outM0 = validateInputOrThrow("packLeafRects (output)", composed);

  // Lossless tidy after packing — reduces any reducible split counts the
  // band decomposition left behind. Preserves geometry + overlay depth, so
  // the (layer, geometry) lookup below still resolves against it.
  let reducedSplits = 0;
  if (doReduceSplits) {
    const rr = reduceSplitCounts(outM0, { width, height });
    outM0 = rr.m0;
    reducedSplits = rr.reduced.length;
  }

  // New identity lookup: (layer, geometry) is unique — rects on one layer
  // never overlap, and identical rects conflict onto distinct layers in
  // input (= paint) order. Carry the new leaf's stableKey AND its new
  // logicalIndex (positional source binding).
  const newFrames = queryFrames(outM0, dims).editor().filter(isRenderedLeaf);
  const lookup = new Map<string, { key: string; li: number }>();
  for (const f of newFrames) {
    const k = `${f.overlayDepth}|${Math.round(f.x)}|${Math.round(f.y)}|${Math.round(f.width)}|${Math.round(f.height)}`;
    lookup.set(k, { key: String(f.meta.stableKey), li: f.logicalIndex ?? 0 });
  }

  const placedOut: PackedLeaf[] = new Array(placed.length);
  for (let i = 0; i < placed.length; i++) {
    const r = placed[i];
    const hit = lookup.get(`${layerOf[i]}|${r.x}|${r.y}|${r.w}|${r.h}`);
    if (!hit) {
      throw new Error(
        `packLeafRects: internal invariant — repacked rect ${i} not found in rebuilt document`,
      );
    }
    placedOut[i] = { stableKey: hit.key, logicalIndex: hit.li, layer: layerOf[i] };
  }

  return {
    m0: outM0 as M0String,
    placed: placedOut,
    layersAfter: getLayerCount(outM0) ?? 1,
    reducedSplits,
  };
}
