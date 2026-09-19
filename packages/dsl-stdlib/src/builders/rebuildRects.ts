/**
 * Rebuild Rects builder — full-graph geometry rebuild for post-render editing.
 *
 * Throws the entire m0 string away and regenerates it from its rendered
 * leaves: collect every rendered rect in paint order, apply per-leaf rect
 * OVERRIDES and/or a full paint-ORDER permutation, then repack via the shared
 * {@link packLeafRects} engine (minLayer z-preserving first-fit → per-layer
 * `placeRects` → compose → identity lookup). The result carries the
 * `rekey` / `liveKeys` / `sourceOrder` maps a host needs to keep sidecar
 * metadata and the positional `sources` array bound after the rebuild.
 *
 * This is the engine behind Make's V2 "Rebuild" edit mode: a human resizes /
 * reorders / moves a node on the LOCKED output canvas, and the whole document
 * regenerates at exact pixels (resolution-baked — the deliberate trade for
 * zero quantization spread on a canvas that is already fixed post-render).
 *
 * ## Relationship to `compactDocument`
 *
 * `compactDocument` is the closing/minimizing pass — it is **growth-guarded**
 * (a pack that would grow a tight nested m0 is discarded for the lossless
 * baseline). `rebuildRects` is the opposite intent: it **always rebuilds**,
 * because the user's edit MUST take effect even when the resulting DSL is
 * longer. Both share the same `packLeafRects` core, so a no-override,
 * no-order `rebuildRects` is geometry-identical to `compactDocument`'s rebuild
 * candidate (exact rect round-trip; paint order preserved).
 *
 * ## Z is a paint-order permutation, not `importance`
 *
 * Z-order is expressed as `order` — a permutation of rendered-leaf stableKeys
 * consumed by the minLayer pack. This preserves the given order EXACTLY
 * wherever rects overlap (the only place stacking is observable), a stronger
 * guarantee than `placeRects.importance` buckets (which leave equal-importance
 * order unspecified).
 *
 * Leaf-level only: group → descendant-leaf expansion is host policy (see
 * `rebuildDocumentGeometry` in `@m0saic/platform`), keeping this surface minimal.
 *
 * Pure and deterministic. No I/O.
 */

import type { M0String } from "@m0saic/dsl";
import type { PlaceRectsRect } from "./placeRects";
import type { CompactRekeyPair } from "./compactDocument";
import { packLeafRects, isRenderedLeaf } from "./_internal/packLeafRects";
import { queryFrames } from "../queries/queryFrames";
import { getLayerCount } from "../queries/getLayerCount";
import { validateInputOrThrow } from "../transforms/_internal/output";

// ── Types ─────────────────────────────────────────────────

/** A replacement rect in integer document px. */
export type RebuildRectsRect = { x: number; y: number; w: number; h: number };

export type RebuildRectsOptions = {
  /** The document to rebuild. */
  m0: string;
  /** Canvas width in px. Positive integer. */
  width: number;
  /** Canvas height in px. Positive integer. */
  height: number;
  /**
   * Rendered-LEAF stableKey → replacement rect (integer doc px). Keys must
   * address rendered leaves of the input; rects must be in-bounds. Omitted
   * leaves keep their current (rounded) rect.
   */
  overrides?: Record<string, RebuildRectsRect>;
  /**
   * Full paint-order permutation of the rendered-leaf stableKeys, base → top.
   * Omit to keep the current paint order. Must be an exact permutation (every
   * rendered-leaf key exactly once) or the call throws.
   */
  order?: string[];
  /**
   * Lossless split-count tidy after packing. Default true. Preserves geometry
   * — only collapses reducible split counts the band decomposition left behind.
   */
  reduceSplits?: boolean;
};

export type RebuildRectsResult = {
  /** The rebuilt document. */
  m0: M0String;
  /** Old → new stableKey for every rendered leaf whose key changed. */
  rekey: CompactRekeyPair[];
  /** Every rendered-leaf stableKey in the rebuilt document (prune set). */
  liveKeys: string[];
  /** GATHER permutation: `newSources[k] = oldSources[sourceOrder[k]]`. */
  sourceOrder: number[];
  meta: {
    layersBefore: number;
    layersAfter: number;
    /** Rendered-leaf count (invariant before/after). */
    frameCount: number;
    dslLengthBefore: number;
    dslLengthAfter: number;
  };
};

// ── Main ──────────────────────────────────────────────────

export function rebuildRects(opts: RebuildRectsOptions): RebuildRectsResult {
  const { width, height } = opts;
  if (!Number.isInteger(width) || width < 1)
    throw new Error(`rebuildRects: width must be a positive integer, got ${width}`);
  if (!Number.isInteger(height) || height < 1)
    throw new Error(`rebuildRects: height must be a positive integer, got ${height}`);

  const canonical = validateInputOrThrow("rebuildRects", opts.m0);
  const reduceSplits = opts.reduceSplits ?? true;
  const dims = { width, height };

  // Paint-order geometry from the render walk; durable identity (stableKeys
  // sidecar metadata is keyed by) from the editor walk, joined on logicalIndex.
  const q = queryFrames(canonical, dims);
  const oldLeaves = q.render();
  if (oldLeaves.length === 0)
    throw new Error("rebuildRects: document has no rendered frames");

  const keyByLogical = new Map<number, string>();
  for (const f of q.editor().filter(isRenderedLeaf)) {
    if (f.logicalIndex != null) keyByLogical.set(f.logicalIndex, String(f.meta.stableKey));
  }
  const oldEditorKeyOf = (renderIdx: number): string =>
    keyByLogical.get(oldLeaves[renderIdx].logicalIndex) ??
    String(oldLeaves[renderIdx].meta.stableKey);

  const n = oldLeaves.length;
  // Current paint order = render walk. `currentKey[i]` is the durable
  // stableKey of the i-th rendered leaf; `keyToPos` is the inverse.
  const currentKey: string[] = new Array(n);
  const keyToPos = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = oldEditorKeyOf(i);
    if (keyToPos.has(key)) {
      throw new Error(
        `rebuildRects: duplicate rendered-leaf stableKey "${key}" — cannot address rects unambiguously`,
      );
    }
    currentKey[i] = key;
    keyToPos.set(key, i);
  }

  // Rounded current rects (render-walk order) — the exactness basis.
  const currentRect: PlaceRectsRect[] = oldLeaves.map((f) => ({
    x: Math.max(0, Math.round(f.x)),
    y: Math.max(0, Math.round(f.y)),
    w: Math.max(1, Math.round(f.width)),
    h: Math.max(1, Math.round(f.height)),
  }));

  // ── Validate overrides (unknown key / non-integer / out-of-bounds throw) ──
  const overrides = opts.overrides ?? {};
  for (const [key, r] of Object.entries(overrides)) {
    if (!keyToPos.has(key))
      throw new Error(`rebuildRects: override references unknown rendered-leaf stableKey "${key}"`);
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger))
      throw new Error(`rebuildRects: override for "${key}" must be integer px`);
    if (r.w < 1 || r.h < 1)
      throw new Error(`rebuildRects: override for "${key}" must have w/h ≥ 1 (got ${r.w}x${r.h})`);
    if (r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height)
      throw new Error(
        `rebuildRects: override for "${key}" (${r.x},${r.y},${r.w},${r.h}) is out of bounds for ${width}x${height}`,
      );
  }

  // ── Resolve the final paint order as a permutation of render positions ──
  let finalPositions: number[];
  if (opts.order) {
    if (opts.order.length !== n)
      throw new Error(
        `rebuildRects: order must be a full permutation of the ${n} rendered-leaf keys (got ${opts.order.length})`,
      );
    const seen = new Set<string>();
    finalPositions = new Array(n);
    for (let t = 0; t < n; t++) {
      const key = opts.order[t];
      const pos = keyToPos.get(key);
      if (pos === undefined)
        throw new Error(`rebuildRects: order references unknown rendered-leaf stableKey "${key}"`);
      if (seen.has(key))
        throw new Error(`rebuildRects: order repeats stableKey "${key}" — must be a permutation`);
      seen.add(key);
      finalPositions[t] = pos;
    }
  } else {
    finalPositions = Array.from({ length: n }, (_, i) => i);
  }

  // ── Build placed rects in final paint order (override wins) ──
  const placed: PlaceRectsRect[] = finalPositions.map((pos) => {
    const ov = overrides[currentKey[pos]];
    return ov ? { x: ov.x, y: ov.y, w: ov.w, h: ov.h } : currentRect[pos];
  });

  // ── Pack (always rebuilds — no growth guard) ──
  const pk = packLeafRects({ rects: placed, width, height, preserveZOrder: true, reduceSplits });

  // ── Map back to rekey / liveKeys / sourceOrder ──
  // `pk.placed[t]` is the new identity of the rect painted at slot t (which is
  // old render position `finalPositions[t]`). The n new logicalIndex values are
  // a permutation of 0..n-1, so `sourceOrder` is fully populated.
  const rekey: CompactRekeyPair[] = [];
  const liveKeys: string[] = new Array(n);
  const sourceOrder: number[] = new Array(n);
  for (let t = 0; t < n; t++) {
    const pos = finalPositions[t];
    const hit = pk.placed[t];
    liveKeys[t] = hit.stableKey;
    sourceOrder[hit.logicalIndex] = pos;
    const from = currentKey[pos];
    if (from !== hit.stableKey) rekey.push({ from, to: hit.stableKey });
  }

  return {
    m0: pk.m0,
    rekey,
    liveKeys,
    sourceOrder,
    meta: {
      layersBefore: getLayerCount(canonical) ?? 1,
      layersAfter: pk.layersAfter,
      frameCount: n,
      dslLengthBefore: canonical.length,
      dslLengthAfter: pk.m0.length,
    },
  };
}
