/**
 * Compact Document builder.
 *
 * Exports a "heavy" exploration document to its compact form. Layout
 * exploration is layer-additive by design (draw commits, edit-mode
 * re-lands, provenance leftovers) — this builder is the closing step
 * that reduces the result without losing anything that paints:
 *
 *   - **Null-layer removal** — root-chain overlay layers with no
 *     rendered tile are dropped ({@link removePureNullLayers}).
 *   - **Rectangle packing** — every rendered rect (across ALL layers,
 *     including inner-cell overlay content) is collected in paint
 *     order and repacked onto as few layers as possible. Packing is
 *     IDENTITY-PRESERVING: a rect is never fragmented across grid
 *     bands, so the conflict test is overlap OR y-subdivision (a
 *     rect's horizontal edge falling strictly inside another's y-range
 *     would force the band builder to split it). Overlapping rects
 *     keep their relative paint order (greedy first-fit spills later
 *     rects to later layers). Mis-aligned edges limit how far packing
 *     can collapse — which is exactly what the GCD pass fixes: snapped
 *     edges coincide, subdivision disappears, layers merge.
 *     **Growth-guarded:** flat band decomposition can BALLOON an
 *     already-tight hand-authored nested m0, so a pack/snap is accepted
 *     only when it shrinks the DSL below the lossless "just simplify"
 *     baseline (null-removal + split-count reduction). When it would
 *     grow, that baseline is returned instead — never heavier, and the
 *     free split-count win is never lost.
 *   - **GCD reduction** (opt-in) — accepts a bounded per-edge drift if
 *     snapping all rect edges to a coarser common grid achieves GCD
 *     collapse (the same directed divisor search the SVG → m0 pipeline
 *     uses — see `inferGrid`). The achieved pitch and the actual max
 *     drift are reported so the caller can surface "minor geometry
 *     change" for review.
 *
 * Identity is never silently lost: the result carries a `rekey` list
 * (old stableKey → new stableKey for every rendered leaf) so hosts can
 * migrate sidecar metadata (labels / masks / fills / ranks), plus the
 * complete `liveKeys` set for pruning entries that no longer have a
 * home (e.g. provenance stamps on dropped null tiles).
 *
 * Pure and deterministic. No I/O.
 */

import type { M0String } from "@m0saic/dsl";
import type { PlaceRectsRect } from "./placeRects";
import { packLeafRects, isRenderedLeaf } from "./_internal/packLeafRects";
import { queryFrames } from "../queries/queryFrames";
import { getLayerCount } from "../queries/getLayerCount";
import { inferGrid } from "../libraries/svg/inferGrid";
import type { ExtractedShape } from "../libraries/svg/types";
import { removePureNullLayers } from "../transforms/primitives/overlay/removePureNullLayers";
import { reduceSplitCounts } from "../transforms/primitives/split/reduceSplitCounts";
import { validateInputOrThrow } from "../transforms/_internal/output";

// ── Types ─────────────────────────────────────────────────

export type CompactDocumentOptions = {
  /** The document to compact. */
  m0: string;
  /** Canvas width in px (geometry + placement space). Positive integer. */
  width: number;
  /** Canvas height in px. Positive integer. */
  height: number;
  /** Drop root-chain overlay layers that paint nothing. Default true. */
  removeNullLayers?: boolean;
  /**
   * Rebuild the document by repacking every rendered rect onto as few
   * layers as possible. Subsumes null-layer removal (the rebuild only
   * keeps what paints). Default true. **Growth-guarded:** the pack is
   * applied only when it shrinks the DSL below the lossless baseline
   * (null-removal + `reduceSplits`); otherwise that baseline is returned,
   * so packing an already-tight nested m0 never makes it heavier.
   */
  pack?: boolean;
  /**
   * Keep the original stacking when packing. Default true.
   *
   * When true, a rect can only land ABOVE every earlier-painted rect it
   * OVERLAPS, so the rendered pixels are unchanged (only non-overlapping
   * rects — whose order is invisible — get reordered). When false, packing
   * ignores paint order entirely and packs by geometry alone, which can fit
   * the rects onto FEWER layers but may change which rect paints on top where
   * they overlap (a deliberate, mildly-lossy trade — strictly less disruptive
   * than `gcdDriftPercent`, which moves edges). Only meaningful with `pack`.
   */
  preserveZOrder?: boolean;
  /**
   * Reduce split COUNTS to their minimum representation by per-cell-weight
   * GCD ({@link reduceSplitCounts}) — a strictly pixel-lossless, structural
   * pass that shrinks an already-well-nested document WITHOUT flattening it.
   * Default false.
   *
   * This is a DIFFERENT strategy from `pack`: packing collects every rect and
   * rebuilds flat band-decomposed layers, which is a big win for layer-additive
   * exploration docs but can BALLOON a doc that was already authored as tight
   * nested splits. Split-count reduction never grows the document. The two can
   * be combined (reduction runs last, as a tidy), or `reduceSplits` used alone
   * (pack off) as the lossless-only path.
   */
  reduceSplits?: boolean;
  /**
   * Drift tolerance as % of the smaller canvas dimension. When > 0,
   * rect edges may move by up to this budget if snapping to a coarser
   * common grid achieves GCD collapse (directed divisor search —
   * largest pitch first, so the falloff is steep and the win obvious).
   * Implies a rebuild. 0 disables. Default 0.
   */
  gcdDriftPercent?: number;
};

export type CompactRekeyPair = {
  /** Rendered leaf's stableKey in the input document. */
  from: string;
  /** The same rect's stableKey in the compacted document. */
  to: string;
};

export type CompactDocumentResult = {
  /** The compacted document. */
  m0: M0String;
  /**
   * Old → new stableKey for every rendered leaf whose key changed.
   * Hosts migrate per-frame sidecar metadata along these pairs.
   */
  rekey: CompactRekeyPair[];
  /**
   * Every rendered-leaf stableKey in the compacted document. Hosts
   * prune sidecar entries whose key is not in this set.
   */
  liveKeys: string[];
  /**
   * Source-array migration permutation, in GATHER form: a host rebuilds its
   * positional sidecars as `newSources[k] = oldSources[sourceOrder[k]]` for
   * each new logical index `k`. The rebuild paths (`pack` / `gcdDriftPercent`)
   * reorder rendered leaves, so this is how a host keeps `sources` (and the
   * masks / effects / visual riding on each) bound. Identity (`[0,1,2,…]`) for
   * the order-preserving paths (null-removal / `reduceSplits`) and the no-op.
   */
  sourceOrder: number[];
  meta: {
    layersBefore: number;
    layersAfter: number;
    /** Rendered-leaf count (identical before and after — invariant). */
    frameCount: number;
    dslLengthBefore: number;
    dslLengthAfter: number;
    /** Achieved snap pitch per axis; null when GCD reduction was off
     *  or infeasible at the requested drift budget. */
    gcd: { col: number; row: number } | null;
    /** Max grid-snap edge displacement in px reported by the GCD search
     *  (0 without snapping). See `driftMaxPx` for the full per-rect figure. */
    maxDriftPx: number;
    /**
     * Largest per-rect edge displacement from the ORIGINAL geometry, in px —
     * each rect's max |edge move| between its input position and its final
     * (rounded + snapped) position. ≥ `maxDriftPx` (it also counts rounding).
     */
    driftMaxPx: number;
    /**
     * SUM of every rect's per-rect edge displacement (the figure above,
     * totalled across all rendered leaves). The "total drift over the whole
     * layout" — a host gates a lossy preview on this staying under a cap.
     */
    driftTotalPx: number;
    /** Number of splits the lossless `reduceSplits` pass collapsed (0 if off
     *  or already minimal). */
    reducedSplits: number;
  };
};

// ── Main ──────────────────────────────────────────────────

export function compactDocument(
  opts: CompactDocumentOptions,
): CompactDocumentResult {
  const { width, height } = opts;
  if (!Number.isInteger(width) || width < 1)
    throw new Error(`compactDocument: width must be a positive integer, got ${width}`);
  if (!Number.isInteger(height) || height < 1)
    throw new Error(`compactDocument: height must be a positive integer, got ${height}`);
  const removeNulls = opts.removeNullLayers ?? true;
  const pack = opts.pack ?? true;
  const preserveZOrder = opts.preserveZOrder ?? true;
  const doReduceSplits = opts.reduceSplits ?? false;
  const drift = opts.gcdDriftPercent ?? 0;
  if (!Number.isFinite(drift) || drift < 0)
    throw new Error(`compactDocument: gcdDriftPercent must be a non-negative number, got ${drift}`);

  const canonical = validateInputOrThrow("compactDocument", opts.m0);

  const dims = { width, height };
  const q = queryFrames(canonical, dims);
  // Paint-order geometry comes from the render walk; durable identity
  // (the `r/...` stableKeys that sidecar metadata is keyed by) comes
  // from the editor walk. The two join on `logicalIndex`.
  const oldLeaves = q.render();
  if (oldLeaves.length === 0) {
    throw new Error("compactDocument: document has no rendered frames");
  }
  // `isRenderedLeaf` (imported from the pack extraction) treats a
  // full-canvas base tile parsing as kind "root" as a rendered leaf.
  const keyByLogical = new Map<number, string>();
  for (const f of q.editor().filter(isRenderedLeaf)) {
    if (f.logicalIndex != null) keyByLogical.set(f.logicalIndex, String(f.meta.stableKey));
  }
  const oldEditorKeyOf = (renderIdx: number): string =>
    keyByLogical.get(oldLeaves[renderIdx].logicalIndex) ??
    String(oldLeaves[renderIdx].meta.stableKey);

  const layersBefore = getLayerCount(canonical) ?? 1;

  let nextM0: string = canonical;
  let rekey: CompactRekeyPair[] = [];
  let liveKeys: string[] = oldLeaves.map((_, i) => oldEditorKeyOf(i));
  // Order-preserving by default; the rebuild path overwrites this with the
  // real leaf permutation. GATHER form: newSources[k] = oldSources[order[k]].
  let sourceOrder: number[] = oldLeaves.map((_, i) => i);
  let gcd: { col: number; row: number } | null = null;
  let maxDriftPx = 0;
  let driftMaxPx = 0;
  let driftTotalPx = 0;
  let reducedSplits = 0;

  // Identity for an order-preserving transform (null-removal, split-count
  // reduction): rendered leaves pair index-wise in logicalIndex order.
  const deriveByOrder = (m0: string): { rekey: CompactRekeyPair[]; liveKeys: string[] } => {
    const oldOrdered = q
      .editor()
      .filter(isRenderedLeaf)
      .sort((a, b) => (a.logicalIndex ?? 0) - (b.logicalIndex ?? 0));
    const newOrdered = queryFrames(m0, dims)
      .editor()
      .filter(isRenderedLeaf)
      .sort((a, b) => (a.logicalIndex ?? 0) - (b.logicalIndex ?? 0));
    if (newOrdered.length !== oldOrdered.length) {
      throw new Error(
        "compactDocument: internal invariant — a lossless step changed the rendered frame count",
      );
    }
    const rk: CompactRekeyPair[] = [];
    const lk: string[] = [];
    for (let i = 0; i < oldOrdered.length; i++) {
      const from = String(oldOrdered[i].meta.stableKey);
      const to = String(newOrdered[i].meta.stableKey);
      lk.push(to);
      if (from !== to) rk.push({ from, to });
    }
    return { rekey: rk, liveKeys: lk };
  };

  // The lossless "just simplify" baseline: drop pure-null layers + reduce split
  // counts on the input. Order-preserving, never grows, never reorders. The
  // rebuild (pack / GCD-snap) is accepted only when it actually beats this — so
  // packing an already-tight nested m0 (which flat band decomposition can
  // balloon) silently falls back to the split-count win instead of coming out
  // heavier, and the free simplify-splits win is never lost.
  const computeBaseline = (): {
    m0: string;
    rekey: CompactRekeyPair[];
    liveKeys: string[];
    reducedSplits: number;
  } => {
    let m = canonical;
    if (removeNulls) m = removePureNullLayers(m);
    let rs = 0;
    if (doReduceSplits) {
      const rr = reduceSplitCounts(m, { width, height });
      m = rr.m0;
      rs = rr.reduced.length;
    }
    if (m === canonical) {
      return { m0: m, rekey: [], liveKeys: oldLeaves.map((_, i) => oldEditorKeyOf(i)), reducedSplits: 0 };
    }
    const derived = deriveByOrder(m);
    return { m0: m, rekey: derived.rekey, liveKeys: derived.liveKeys, reducedSplits: rs };
  };

  if (pack || drift > 0) {
    // ── Rebuild candidate: collect → (snap) → repack ──
    const rounded: PlaceRectsRect[] = oldLeaves.map((f) => ({
      x: Math.max(0, Math.round(f.x)),
      y: Math.max(0, Math.round(f.y)),
      w: Math.max(1, Math.round(f.width)),
      h: Math.max(1, Math.round(f.height)),
    }));

    let placed = rounded;
    let rbGcd: { col: number; row: number } | null = null;
    let rbMaxDriftPx = 0;
    if (drift > 0) {
      const shapes: ExtractedShape[] = rounded.map((r, i) => ({
        id: String(i),
        index: i,
        type: "path",
        geometry: { d: "" },
        style: { fill: null, stroke: null, style: null },
        bounds: {
          x: r.x,
          y: r.y,
          width: r.w,
          height: r.h,
          left: r.x,
          top: r.y,
          right: r.x + r.w,
          bottom: r.y + r.h,
          cx: r.x + r.w / 2,
          cy: r.y + r.h / 2,
        },
      }));
      const grid = inferGrid(
        shapes,
        { x: 0, y: 0, width, height },
        { driftPercent: drift, driftMode: "gcd-snap" },
      );
      placed = grid.shapes.map((s) => {
        const x = Math.max(0, Math.min(width - 1, Math.round(s.snappedBounds.left)));
        const y = Math.max(0, Math.min(height - 1, Math.round(s.snappedBounds.top)));
        const w = Math.max(1, Math.min(width - x, Math.round(s.snappedBounds.right) - x));
        const h = Math.max(1, Math.min(height - y, Math.round(s.snappedBounds.bottom) - y));
        return { x, y, w, h };
      });
      rbGcd = grid.meta?.achievedGcd ?? null;
      rbMaxDriftPx = grid.meta?.maxActualDriftPx ?? 0;
    }

    // ── Pack: minLayer z-preserving first-fit → per-layer placeRects →
    //    compose → identity lookup (the shared `packLeafRects` engine) ──
    const pk = packLeafRects({
      rects: placed,
      width,
      height,
      preserveZOrder,
      reduceSplits: doReduceSplits,
    });
    const rebuildM0 = pk.m0;
    const rbReducedSplits = pk.reducedSplits;

    const rbRekey: CompactRekeyPair[] = [];
    const rbLiveKeys: string[] = [];
    // newLI → old index. GATHER permutation is then sourceOrder[newLI] = old i.
    const oldIndexByNewLI = new Array<number>(oldLeaves.length).fill(0);
    let rbDriftMax = 0;
    let rbDriftTotal = 0;
    for (let i = 0; i < oldLeaves.length; i++) {
      const r = placed[i];
      const hit = pk.placed[i];
      rbLiveKeys.push(hit.stableKey);
      oldIndexByNewLI[hit.logicalIndex] = i;
      const from = oldEditorKeyOf(i);
      if (from !== hit.stableKey) rbRekey.push({ from, to: hit.stableKey });
      // Per-rect displacement from the ORIGINAL (fractional) geometry to the
      // final placed rect.
      const o = oldLeaves[i];
      const d = Math.max(
        Math.abs(o.x - r.x),
        Math.abs(o.y - r.y),
        Math.abs(o.x + o.width - (r.x + r.w)),
        Math.abs(o.y + o.height - (r.y + r.h)),
      );
      rbDriftTotal += d;
      if (d > rbDriftMax) rbDriftMax = d;
    }

    // ── Growth guard ── Pack/snap is a WIN only when it shrinks the DSL below
    // the lossless baseline. A hand-authored tight nested m0 balloons under flat
    // band decomposition, so in that case keep the baseline (just simplify
    // splits) — never come out heavier, never skip the simplify win.
    const base = computeBaseline();
    if (rebuildM0.length < base.m0.length) {
      nextM0 = rebuildM0;
      rekey = rbRekey;
      liveKeys = rbLiveKeys;
      sourceOrder = oldIndexByNewLI;
      driftMaxPx = rbDriftMax;
      driftTotalPx = rbDriftTotal;
      gcd = rbGcd;
      maxDriftPx = rbMaxDriftPx;
      reducedSplits = rbReducedSplits;
    } else {
      nextM0 = base.m0;
      rekey = base.rekey;
      liveKeys = base.liveKeys;
      reducedSplits = base.reducedSplits;
      // sourceOrder stays identity, gcd null, drifts 0 — no rebuild applied.
    }
  } else if (removeNulls || doReduceSplits) {
    // ── String-level lossless path (no pack / snap requested) ──
    const base = computeBaseline();
    nextM0 = base.m0;
    rekey = base.rekey;
    liveKeys = base.liveKeys;
    reducedSplits = base.reducedSplits;
  }
  // No ops selected → identity result (callers usually gate the button,
  // but the library stays total).

  return {
    m0: nextM0 as M0String,
    rekey,
    liveKeys,
    sourceOrder,
    meta: {
      layersBefore,
      layersAfter: getLayerCount(nextM0) ?? 1,
      frameCount: oldLeaves.length,
      dslLengthBefore: canonical.length,
      dslLengthAfter: nextM0.length,
      gcd,
      maxDriftPx,
      driftMaxPx,
      driftTotalPx,
      reducedSplits,
    },
  };
}

// The pack engine (minLayer z-preserving first-fit → per-layer placeRects →
// compose → identity lookup) lives in `./_internal/packLeafRects`, shared with
// `rebuildRects`. Layer-conflict logic (overlap or y-subdivision either
// direction) is `rectsConflict` in placeRects — the single source of truth the
// pack uses (the invariant there: a conflict-free layer never spills).
