/**
 * Bake m0c insets — fold a `.m0c` file's per-frame inset sidecar into its m0
 * geometry, and lower a `.m0c` to a plain `.m0` without losing what the
 * insets painted.
 *
 * A `.m0c` carries `insets`: per-frame edge fractions keyed by stableKey that
 * the engine applies at render time (each source paints into its cell minus
 * those edges). The m0 string on its own does NOT show that geometry — which
 * is fine while the file travels as `.m0c`, and wrong the moment it is lowered
 * to `.m0`: `downgradeM0cToM0` in `@m0saic/dsl-file-formats` is a pure struct
 * transform that DROPS the insets, so the plain file renders bigger cells than
 * the author saw. This module closes that gap:
 *
 * - {@link bakeM0cInsets} — rewrites the file's `m0` so every rendered leaf's
 *   cell already IS its inset box (the exact engine math: `Math.floor(f · cell)`
 *   per edge, then `Math.max(1, …)` on size — the same rects `bakeInsets` and
 *   `bakeDocumentInsets` produce), sets `insets` to `null`, and carries every
 *   other stableKey-keyed sidecar (labels, masks, fill, rank sets) across the
 *   rebuild by the rekey map, pruned to the leaves that still exist. Once
 *   baked, a file with no masks or labels is plain m0 in a `.m0c` wrapper.
 * - {@link lowerM0cToM0} — the geometry-preserving downgrade: bake, then the
 *   structural `downgradeM0cToM0`. What it still drops (labels, masks, fill,
 *   rank sets, the reference image) is exactly what plain `.m0` cannot carry.
 *
 * Resolution-baked: insets are fractions of a canvas, so the file must carry
 * `size`; the rebuilt m0 is exact at that size and — like every absolute
 * rebuild — longer than the input. Pure and deterministic. No I/O.
 *
 * @example
 * const baked = bakeM0cInsets(file);        // file.insets → null, m0 rebuilt
 * const plain = lowerM0cToM0(file).file;   // an M0File whose m0 shows the gutters
 */

import type { M0String } from "@m0saic/dsl";
import type { M0cFile, M0File, M0cInset, M0cRankSet } from "@m0saic/dsl-file-formats";
import { downgradeM0cToM0 } from "@m0saic/dsl-file-formats";
import { rebuildRects } from "./rebuildRects";
import type { CompactRekeyPair } from "./compactDocument";
import { isRenderedLeaf } from "./_internal/packLeafRects";
import { queryFrames } from "../queries/queryFrames";
import { validateInputOrThrow } from "../transforms/_internal/output";

// ── Types ─────────────────────────────────────────────────

export type BakeM0cInsetsOptions = {
  /**
   * Lossless split-count tidy after packing (collapses reducible split counts
   * the band decomposition left behind; preserves geometry). Default true.
   */
  reduceSplits?: boolean;
};

export type BakeM0cInsetsMeta = {
  /** True when the m0 was rebuilt. False when there was nothing to fold —
   *  no inset entries, only identity insets, only orphaned keys. */
  changed: boolean;
  /** Rendered-leaf count of the input (0 when no parse was needed). */
  frameCount: number;
  /** Leaves whose cell actually shrank (a non-identity inset at this size). */
  insetCount: number;
  /**
   * Inset keys that address no rendered leaf of the m0 (a container, a frame
   * from an earlier edit, a typo). Dropped — they never rendered anything.
   */
  orphanInsetKeys: string[];
  dslLengthBefore: number;
  dslLengthAfter: number;
};

export type BakeM0cInsetsResult = {
  /** The file with `insets: null`, its m0 rebuilt (when `meta.changed`) and
   *  every other stableKey-keyed sidecar carried across the rebuild. */
  file: M0cFile;
  /** Old → new stableKey for every rendered leaf whose key changed. Empty
   *  when nothing was rebuilt. */
  rekey: CompactRekeyPair[];
  /** Every rendered-leaf stableKey of the output m0. Empty when nothing was
   *  rebuilt (the input's keys are unchanged then). */
  liveKeys: string[];
  meta: BakeM0cInsetsMeta;
};

export type LowerM0cToM0Result = {
  /** The plain file. Its `m0` shows the inset geometry; nothing else survives
   *  that `.m0` cannot carry (see `downgradeM0cToM0`). */
  file: M0File;
  /** What the bake did on the way. */
  baked: BakeM0cInsetsMeta;
};

// ── Internals ─────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number };

const INSET_EDGES = ["top", "right", "bottom", "left"] as const;

function isMeaningfulInset(v: unknown): v is M0cInset {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (INSET_EDGES.some((e) => typeof o[e] !== "number" || !Number.isFinite(o[e] as number))) return false;
  return INSET_EDGES.some((e) => (o[e] as number) > 0);
}

/** EXACT mirror of core `applyInsetToRect` (and stdlib `bakeInsets`). */
function insetRect(cell: Rect, inset: M0cInset): Rect {
  const l = Math.floor(inset.left * cell.w);
  const r = Math.floor(inset.right * cell.w);
  const t = Math.floor(inset.top * cell.h);
  const b = Math.floor(inset.bottom * cell.h);
  return {
    x: cell.x + l,
    y: cell.y + t,
    w: Math.max(1, cell.w - (l + r)),
    h: Math.max(1, cell.h - (t + b)),
  };
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Carry a stableKey-keyed map across a rebuild: rename moved keys, drop
 * entries whose key no longer addresses a rendered leaf. Reference-stable
 * when nothing changed.
 */
function carryMap<V>(
  map: Record<string, V> | null | undefined,
  rekey: Map<string, string>,
  live: Set<string>,
): Record<string, V> | null | undefined {
  if (!map) return map;
  const out: Record<string, V> = {};
  let changed = false;
  for (const [k, v] of Object.entries(map)) {
    const nk = rekey.get(k) ?? k;
    if (!live.has(nk)) {
      changed = true;
      continue;
    }
    if (nk !== k) changed = true;
    out[nk] = v;
  }
  return changed ? out : map;
}

// ── Main ──────────────────────────────────────────────────

export function bakeM0cInsets(file: M0cFile, opts: BakeM0cInsetsOptions = {}): BakeM0cInsetsResult {
  const entries = Object.entries(file.insets ?? {}).filter(([, v]) => isMeaningfulInset(v)) as Array<
    [string, M0cInset]
  >;
  const unchanged = (frameCount: number, orphanInsetKeys: string[]): BakeM0cInsetsResult => ({
    file: file.insets == null ? file : { ...file, insets: null },
    rekey: [],
    liveKeys: [],
    meta: {
      changed: false,
      frameCount,
      insetCount: 0,
      orphanInsetKeys,
      dslLengthBefore: file.m0.length,
      dslLengthAfter: file.m0.length,
    },
  });
  if (entries.length === 0) return unchanged(0, []);

  const size = file.size;
  if (!size || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1) {
    throw new Error(
      "bakeM0cInsets: the file carries insets but no canvas size — insets are fractions of a canvas, so `size` must be set before they can be baked",
    );
  }
  const { width, height } = size;

  const canonical = validateInputOrThrow("bakeM0cInsets", file.m0);
  const q = queryFrames(canonical, { width, height });
  const rendered = q.render();
  if (rendered.length === 0) throw new Error("bakeM0cInsets: document has no rendered frames");

  // Durable identity (stableKey) from the editor walk, exact integer geometry
  // from the render walk, joined on logicalIndex — the same join rebuildRects
  // makes, so the overrides address exactly the leaves it will move.
  const rectByLogical = new Map<number, Rect>();
  for (const f of rendered) {
    rectByLogical.set(f.logicalIndex, {
      x: Math.max(0, Math.round(f.x)),
      y: Math.max(0, Math.round(f.y)),
      w: Math.max(1, Math.round(f.width)),
      h: Math.max(1, Math.round(f.height)),
    });
  }
  const rectByKey = new Map<string, Rect>();
  for (const f of q.editor().filter(isRenderedLeaf)) {
    if (f.logicalIndex == null) continue;
    const r = rectByLogical.get(f.logicalIndex);
    if (r) rectByKey.set(String(f.meta.stableKey), r);
  }

  const overrides: Record<string, Rect> = {};
  const orphanInsetKeys: string[] = [];
  let insetCount = 0;
  for (const [key, inset] of entries) {
    const cell = rectByKey.get(key);
    if (!cell) {
      orphanInsetKeys.push(key);
      continue;
    }
    const next = insetRect(cell, inset);
    if (sameRect(next, cell)) continue; // rounds to identity at this size
    overrides[key] = next;
    insetCount++;
  }
  if (insetCount === 0) return unchanged(rendered.length, orphanInsetKeys);

  const rb = rebuildRects({
    m0: canonical,
    width,
    height,
    overrides,
    reduceSplits: opts.reduceSplits ?? true,
  });

  const rekey = new Map(rb.rekey.map((p) => [p.from, p.to]));
  const live = new Set(rb.liveKeys);

  let rankSets = file.rankSets;
  if (file.rankSets) {
    let changed = false;
    const next: Record<string, M0cRankSet | null> = {};
    for (const [name, set] of Object.entries(file.rankSets)) {
      if (set?.ranks) {
        const moved = carryMap(set.ranks, rekey, live);
        if (moved !== set.ranks) {
          next[name] = { ...set, ranks: moved ?? {} };
          changed = true;
          continue;
        }
      }
      next[name] = set;
    }
    if (changed) rankSets = next as M0cFile["rankSets"];
  }

  const baked: M0cFile = {
    ...file,
    m0: rb.m0 as M0String,
    labels: (carryMap(file.labels, rekey, live) ?? null) as M0cFile["labels"],
    ...(file.masks !== undefined ? { masks: carryMap(file.masks, rekey, live) as M0cFile["masks"] } : {}),
    ...(file.fill !== undefined ? { fill: carryMap(file.fill, rekey, live) as M0cFile["fill"] } : {}),
    insets: null,
    ...(file.rankSets !== undefined ? { rankSets } : {}),
  };

  return {
    file: baked,
    rekey: rb.rekey,
    liveKeys: rb.liveKeys,
    meta: {
      changed: true,
      frameCount: rendered.length,
      insetCount,
      orphanInsetKeys,
      dslLengthBefore: canonical.length,
      dslLengthAfter: rb.m0.length,
    },
  };
}

/**
 * Lower a `.m0c` to a plain `.m0` WITHOUT losing the geometry its insets
 * painted: {@link bakeM0cInsets}, then the structural `downgradeM0cToM0`.
 * Prefer this over calling `downgradeM0cToM0` directly whenever the file may
 * carry insets. Throws when insets are present but the file has no `size`.
 */
export function lowerM0cToM0(file: M0cFile, opts: BakeM0cInsetsOptions = {}): LowerM0cToM0Result {
  const b = bakeM0cInsets(file, opts);
  return { file: downgradeM0cToM0(b.file), baked: b.meta };
}
