/**
 * Place Optimized Rects — constraint-aware, drift-budgeted `placeRects`.
 *
 * `placeRects` places rects at EXACT pixels; when their edges are coprime with
 * the canvas the m0's precision floor blows up to 100% (the layout "needs its
 * exact canvas"). This builder trades a small, per-rect drift budget to snap
 * every edge onto the coarsest common grid it can — collapsing the precision
 * floor (and the m0 length) — while letting the caller LOCK the rects that must
 * stay pixel-exact (e.g. a segment of an animated arc/pie chain).
 *
 * The model (per axis, independent):
 *   - The grid pitch `g` must divide `gcd(all locked edges, axisLen)`. Locked
 *     rects can't move, so their edges are the hard ceiling — a locked edge
 *     coprime with the axis forces `g = 1` (100%, unavoidable).
 *   - Flexible edges then snap to the nearest multiple of `g` within their
 *     budget. The search takes the LARGEST `g` where every flexible edge snaps
 *     in-budget AND no rect collapses to zero size or leaves the canvas — so
 *     the conflict guard is baked in (nearest-multiple rounding is monotonic,
 *     so originally-disjoint rects stay disjoint).
 *
 * With `driftPercent`/`driftPx` = 0 (the default) every rect is locked and the
 * output is byte-identical to `placeRects` — optimization is strictly opt-in.
 *
 * The budget is PER EDGE: a rect's position may shift up to the budget, its
 * size up to 2× (both edges move). Deterministic; no randomness.
 *
 * @example
 * // Hero chrome that would be 100% precision at exact pixels, but the arc must stay exact.
 * placeOptimizedRects({
 *   rootW: 1920, rootH: 1080, driftPercent: 0.5,
 *   rects: [
 *     { x: 140, y: 150, w: 980, h: 92, claimant: "F" },          // chrome — rides the budget
 *     { x: 387, y: 387, w: 590, h: 590, claimant: "F", driftPx: 0 }, // animated arc — LOCKED
 *   ],
 * });
 */

import type { M0String } from "@m0saic/dsl";
import { placeRects } from "./placeRects";
import type { PlaceRectsRect, PlaceRectsLayer } from "./placeRects";
import { gcdOfArray } from "./_internal/barSplit";

// ── Types ─────────────────────────────────────────────────

export type PlaceOptimizedRectsRect = PlaceRectsRect & {
  /**
   * Max pixels EACH EDGE of this rect may move to reach a coarser grid. `0`
   * (or omit with a 0 default budget) locks it EXACT — for animation-critical
   * geometry. When omitted, the global `driftPx` / `driftPercent` applies.
   */
  driftPx?: number;
};

export type PlaceOptimizedRectsOptions = {
  /** Root canvas width. Positive integer. */
  rootW: number;
  /** Root canvas height. Positive integer. */
  rootH: number;
  /** Rectangles to place (non-empty). */
  rects: PlaceOptimizedRectsRect[];
  /** Token used for empty cells. Default `"-"`. */
  emptyToken?: string;
  /**
   * Default per-edge drift budget as a percent of `min(rootW, rootH)`, for
   * rects without an explicit `driftPx`. Default 0 → everything locked →
   * byte-identical to `placeRects`. A 1px nudge on 1080 is ~0.09%.
   */
  driftPercent?: number;
  /** Absolute-px default budget. Takes precedence over `driftPercent` when set. */
  driftPx?: number;
};

export type PlaceOptimizedRectsResult = {
  /** Composed m0 — same shape as `placeRects` (layers chained as overlays). */
  m0: M0String;
  /** Per-layer breakdown (as `placeRects`). */
  layers: PlaceRectsLayer[];
  /** The snapped rects actually placed (post-drift). Index-aligned with input. */
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  /** Grid pitch chosen per axis (`1` = full precision on that axis). */
  pitch: { x: number; y: number };
  /** Achieved split basis per axis = `axisLen ÷ pitch` — the precision floor. */
  basis: { x: number; y: number };
  /** Largest single-edge drift applied (px). */
  driftMaxPx: number;
  /** Sum of all edge drift (px). */
  driftTotalPx: number;
};

// ── Internal: per-axis constrained snap ───────────────────

type AxisItem = { start: number; size: number; budget: number };
type AxisSnap = { pitch: number; out: Array<{ start: number; size: number; drift: number }> };

function divisorsDesc(n: number): number[] {
  const s = new Set<number>();
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      s.add(i);
      s.add(n / i);
    }
  }
  return [...s].sort((a, b) => b - a);
}

const snapMult = (v: number, g: number): number => Math.round(v / g) * g;

/**
 * Largest pitch `g` dividing `gcd(locked edges, axisLen)` such that every
 * flexible edge snaps within its budget and no item collapses / leaves the
 * axis. Returns the exact input (pitch 1) when nothing coarser is feasible.
 */
function snapAxis(axisLen: number, items: AxisItem[]): AxisSnap {
  const lockedEdges = [0, axisLen];
  for (const it of items) {
    if (it.budget === 0) {
      lockedEdges.push(it.start, it.start + it.size);
    }
  }
  const g0 = gcdOfArray(lockedEdges);
  for (const g of divisorsDesc(g0)) {
    let ok = true;
    const out: AxisSnap["out"] = [];
    for (const it of items) {
      const s0 = it.start;
      const e0 = it.start + it.size;
      const s1 = it.budget === 0 ? s0 : snapMult(s0, g);
      const e1 = it.budget === 0 ? e0 : snapMult(e0, g);
      if (it.budget !== 0 && (Math.abs(s1 - s0) > it.budget || Math.abs(e1 - e0) > it.budget)) {
        ok = false;
        break;
      }
      if (e1 - s1 < 1 || s1 < 0 || e1 > axisLen) {
        ok = false;
        break;
      }
      out.push({ start: s1, size: e1 - s1, drift: Math.abs(s1 - s0) + Math.abs(e1 - e0) });
    }
    if (ok) return { pitch: g, out };
  }
  return {
    pitch: 1,
    out: items.map((it) => ({ start: it.start, size: it.size, drift: 0 })),
  };
}

// ── Main ──────────────────────────────────────────────────

export function placeOptimizedRects(opts: PlaceOptimizedRectsOptions): PlaceOptimizedRectsResult {
  const { rootW, rootH, rects, emptyToken, driftPercent = 0, driftPx } = opts;

  // ── Validation (mirrors placeRects) ──
  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error(`placeOptimizedRects: rootW must be a positive integer, got ${rootW}`);
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error(`placeOptimizedRects: rootH must be a positive integer, got ${rootH}`);
  if (rects.length === 0)
    throw new Error("placeOptimizedRects: rects must be non-empty.");
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!Number.isInteger(r.x) || r.x < 0)
      throw new Error(`placeOptimizedRects: rects[${i}].x must be a non-negative integer, got ${r.x}`);
    if (!Number.isInteger(r.y) || r.y < 0)
      throw new Error(`placeOptimizedRects: rects[${i}].y must be a non-negative integer, got ${r.y}`);
    if (!Number.isInteger(r.w) || r.w < 1)
      throw new Error(`placeOptimizedRects: rects[${i}].w must be a positive integer, got ${r.w}`);
    if (!Number.isInteger(r.h) || r.h < 1)
      throw new Error(`placeOptimizedRects: rects[${i}].h must be a positive integer, got ${r.h}`);
    if (r.x + r.w > rootW)
      throw new Error(`placeOptimizedRects: rects[${i}] (x=${r.x}, w=${r.w}) overflows rootW=${rootW}`);
    if (r.y + r.h > rootH)
      throw new Error(`placeOptimizedRects: rects[${i}] (y=${r.y}, h=${r.h}) overflows rootH=${rootH}`);
    if (r.driftPx !== undefined && (!Number.isInteger(r.driftPx) || r.driftPx < 0))
      throw new Error(`placeOptimizedRects: rects[${i}].driftPx must be a non-negative integer, got ${r.driftPx}`);
  }
  if (driftPercent < 0)
    throw new Error(`placeOptimizedRects: driftPercent must be non-negative, got ${driftPercent}`);
  if (driftPx !== undefined && (!Number.isInteger(driftPx) || driftPx < 0))
    throw new Error(`placeOptimizedRects: driftPx must be a non-negative integer, got ${driftPx}`);

  // Default per-edge budget: explicit px wins, else % of the smaller dimension.
  const defaultBudget =
    driftPx !== undefined ? driftPx : Math.round((driftPercent / 100) * Math.min(rootW, rootH));
  const budgetOf = (r: PlaceOptimizedRectsRect): number => (r.driftPx !== undefined ? r.driftPx : defaultBudget);

  const sx = snapAxis(rootW, rects.map((r) => ({ start: r.x, size: r.w, budget: budgetOf(r) })));
  const sy = snapAxis(rootH, rects.map((r) => ({ start: r.y, size: r.h, budget: budgetOf(r) })));

  const snapped: PlaceRectsRect[] = rects.map((r, i) => ({
    x: sx.out[i].start,
    y: sy.out[i].start,
    w: sx.out[i].size,
    h: sy.out[i].size,
    claimant: r.claimant,
    importance: r.importance,
  }));

  const placed = placeRects({ rootW, rootH, rects: snapped, emptyToken });

  let driftMaxPx = 0;
  let driftTotalPx = 0;
  const outRects = snapped.map((s, i) => {
    const dx = Math.abs(s.x - rects[i].x);
    const dy = Math.abs(s.y - rects[i].y);
    const dw = Math.abs(s.w - rects[i].w);
    const dh = Math.abs(s.h - rects[i].h);
    driftMaxPx = Math.max(driftMaxPx, dx, dy, dw, dh);
    driftTotalPx += dx + dy + dw + dh;
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  });

  return {
    m0: placed.m0,
    layers: placed.layers,
    rects: outRects,
    pitch: { x: sx.pitch, y: sy.pitch },
    basis: { x: rootW / sx.pitch, y: rootH / sy.pitch },
    driftMaxPx,
    driftTotalPx,
  };
}
