/**
 * Snap Rect Precision — best-effort exact placement under a precision ceiling.
 *
 * `placeRect` places a rect at EXACT pixels, but the m0's precision floor is a
 * pure number-theory fact: `basis = axisLength ÷ gcd(before, size, after)`. When
 * those three share no common factor (coprime), the only exact grid is 1px —
 * `basis = the whole axis`, i.e. 100% precision (the layout "needs its exact
 * canvas"). You often can't tell that a requested rect is coprime until you try.
 *
 * This helper does the GCD search FOR you: given a requested rect it returns the
 * exact placement AND a Pareto frontier of nearby rects (nudged by a few px)
 * whose `gcd` is larger, so their precision floor is far lower — each tagged with
 * the pixel delta it costs. The caller decides which to keep: "can't place that
 * at under 100% — but here's `h=976`, Δ1px, 25% — good enough?"
 *
 * The two axes are independent (X depends on `[x, w, rootW−x−w]`, Y on
 * `[y, h, rootH−y−h]`), so the search is a small per-axis integer sweep that
 * maximizes the GCD, combined into a 2-D frontier. Every candidate carries a
 * ready-to-use `m0` (from `placeRect`). Deterministic; no randomness.
 *
 * @example
 * // A 1740×975 rect centered in 1920×1080 is coprime on Y (100% precision).
 * const { exact, best } = snapRectPrecision({
 *   rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975, maxPrecisionPct: 25,
 * });
 * exact.precisionPct;      // 100  (basis 1080 on Y)
 * best?.rect.h;            // 976  (Δ1px → gcd 4 → 25% precision)
 * best?.totalDeltaPx;      // 1
 */

import type { M0String } from "@m0saic/dsl";
import { placeRect } from "./placeRect";
import type { PlaceRectHAlign, PlaceRectVAlign } from "./placeRect";
import { gcdOfArray } from "./_internal/barSplit";

// ── Types ─────────────────────────────────────────────────

/** Which fields the search may move. Omitted fields default to movable. */
export type SnapRectNudge = {
  /** Allow the left edge (x) to move. Default true. */
  x?: boolean;
  /** Allow the top edge (y) to move. Default true. */
  y?: boolean;
  /** Allow the width to change. Default true. */
  w?: boolean;
  /** Allow the height to change. Default true. */
  h?: boolean;
};

export type SnapRectOptions = {
  /** Root canvas width in pixels. Positive integer. */
  rootW: number;
  /** Root canvas height in pixels. Positive integer. */
  rootH: number;
  /** Requested rect width in pixels. Positive integer, ≤ rootW. */
  rectW: number;
  /** Requested rect height in pixels. Positive integer, ≤ rootH. */
  rectH: number;
  /** Requested top-left x. When absent, derived from `hAlign`. */
  x?: number;
  /** Requested top-left y. When absent, derived from `vAlign`. */
  y?: number;
  /** Horizontal alignment when `x` is absent. Default `"center"`. */
  hAlign?: PlaceRectHAlign;
  /** Vertical alignment when `y` is absent. Default `"center"`. */
  vAlign?: PlaceRectVAlign;
  /** Search radius in pixels per movable field. Default 8. Cost is O(radius²). */
  maxDeltaPx?: number;
  /**
   * Precision ceiling (percent, `basis ÷ axis × 100`). When set, `best` is the
   * minimum-delta candidate whose precision is at or under it (null if none
   * within `maxDeltaPx`). When absent, `best` is null and the caller reads the
   * `frontier` directly.
   */
  maxPrecisionPct?: number;
  /** Which fields the search may move. Default: all. */
  nudge?: SnapRectNudge;
};

export type SnapRectCandidate = {
  /** The placed rect. `deltaPx` from the request. */
  rect: { x: number; y: number; w: number; h: number };
  /** Precision % on the binding axis: `max(precisionPctX, precisionPctY)`. Lower is better. */
  precisionPct: number;
  /** Precision % on the X axis (`basisX ÷ rootW × 100`). */
  precisionPctX: number;
  /** Precision % on the Y axis (`basisY ÷ rootH × 100`). */
  precisionPctY: number;
  /** X split basis = `rootW ÷ gcd(x, w, rootW−x−w)`. */
  basisX: number;
  /** Y split basis = `rootH ÷ gcd(y, h, rootH−y−h)`. */
  basisY: number;
  /** Signed pixel deltas from the requested rect. */
  deltaPx: { x: number; y: number; w: number; h: number };
  /** Sum of absolute deltas. */
  totalDeltaPx: number;
  /** Ready-to-use m0 for this rect (from `placeRect`). */
  m0: M0String;
};

export type SnapRectResult = {
  /** The requested rect placed as-is (Δ0). May be 100% precision. */
  exact: SnapRectCandidate;
  /**
   * Pareto frontier, `frontier[0]` = `exact`. Strictly-increasing delta ⇒
   * strictly-decreasing precision: the min-delta rect at each better precision.
   */
  frontier: SnapRectCandidate[];
  /**
   * The recommended pick: the minimum-delta candidate at/under `maxPrecisionPct`.
   * Null when `maxPrecisionPct` is unset, or nothing clears it within `maxDeltaPx`.
   */
  best: SnapRectCandidate | null;
};

// ── Internal ──────────────────────────────────────────────

type AxisPoint = { pos: number; size: number; basis: number; delta: number };

/** Per-axis Pareto frontier: nudge position/size, keep the min-delta point at
 *  each strictly-smaller basis (= precision). Point 0 is always the request. */
function axisFrontier(
  axisLen: number,
  pos0: number,
  size0: number,
  maxD: number,
  movePos: boolean,
  moveSize: boolean,
): AxisPoint[] {
  const pts: AxisPoint[] = [];
  const dpLo = movePos ? -maxD : 0;
  const dpHi = movePos ? maxD : 0;
  const dsLo = moveSize ? -maxD : 0;
  const dsHi = moveSize ? maxD : 0;
  for (let dp = dpLo; dp <= dpHi; dp++) {
    for (let ds = dsLo; ds <= dsHi; ds++) {
      const pos = pos0 + dp;
      const size = size0 + ds;
      const after = axisLen - pos - size;
      if (pos < 0 || size < 1 || after < 0) continue;
      // gcd of the three segments; size ≥ 1 so the gcd is ≥ 1 and divides axisLen.
      const g = gcdOfArray([pos, size, after]);
      pts.push({ pos, size, basis: axisLen / g, delta: Math.abs(dp) + Math.abs(ds) });
    }
  }
  pts.sort((a, b) => a.delta - b.delta || a.basis - b.basis);
  const front: AxisPoint[] = [];
  let bestBasis = Infinity;
  for (const p of pts) {
    if (p.basis < bestBasis) {
      front.push(p);
      bestBasis = p.basis;
    }
  }
  return front;
}

function resolvePos(
  axisLen: number,
  size: number,
  exact: number | undefined,
  align: "start" | "center" | "end",
): number {
  if (exact !== undefined) return exact;
  const gap = axisLen - size;
  if (align === "start") return 0;
  if (align === "end") return gap;
  return Math.floor(gap / 2);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ── Main ──────────────────────────────────────────────────

export function snapRectPrecision(opts: SnapRectOptions): SnapRectResult {
  const {
    rootW,
    rootH,
    rectW,
    rectH,
    x,
    y,
    hAlign = "center",
    vAlign = "center",
    maxDeltaPx = 8,
    maxPrecisionPct,
    nudge,
  } = opts;

  // ── Validation (mirrors placeRect) ──
  const posInt = (v: number, name: string) => {
    if (!Number.isInteger(v) || v < 1)
      throw new Error(`snapRectPrecision: ${name} must be a positive integer, got ${v}`);
  };
  posInt(rootW, "rootW");
  posInt(rootH, "rootH");
  posInt(rectW, "rectW");
  posInt(rectH, "rectH");
  if (rectW > rootW) throw new Error(`snapRectPrecision: rectW (${rectW}) must be <= rootW (${rootW})`);
  if (rectH > rootH) throw new Error(`snapRectPrecision: rectH (${rectH}) must be <= rootH (${rootH})`);
  if (!Number.isInteger(maxDeltaPx) || maxDeltaPx < 0)
    throw new Error(`snapRectPrecision: maxDeltaPx must be a non-negative integer, got ${maxDeltaPx}`);
  if (x !== undefined && (!Number.isInteger(x) || x < 0 || x + rectW > rootW))
    throw new Error(`snapRectPrecision: x (${x}) out of range for rectW ${rectW} in rootW ${rootW}`);
  if (y !== undefined && (!Number.isInteger(y) || y < 0 || y + rectH > rootH))
    throw new Error(`snapRectPrecision: y (${y}) out of range for rectH ${rectH} in rootH ${rootH}`);

  const hMap: Record<PlaceRectHAlign, "start" | "center" | "end"> = { left: "start", center: "center", right: "end" };
  const vMap: Record<PlaceRectVAlign, "start" | "center" | "end"> = { top: "start", center: "center", bottom: "end" };
  const x0 = resolvePos(rootW, rectW, x, hMap[hAlign]);
  const y0 = resolvePos(rootH, rectH, y, vMap[vAlign]);

  const fx = axisFrontier(rootW, x0, rectW, maxDeltaPx, nudge?.x !== false, nudge?.w !== false);
  const fy = axisFrontier(rootH, y0, rectH, maxDeltaPx, nudge?.y !== false, nudge?.h !== false);

  const make = (ax: AxisPoint, ay: AxisPoint): SnapRectCandidate => {
    const rectXW = ax.size;
    const rectYH = ay.size;
    const rawX = (ax.basis / rootW) * 100;
    const rawY = (ay.basis / rootH) * 100;
    return {
      rect: { x: ax.pos, y: ay.pos, w: rectXW, h: rectYH },
      precisionPct: round1(Math.max(rawX, rawY)),
      precisionPctX: round1(rawX),
      precisionPctY: round1(rawY),
      basisX: ax.basis,
      basisY: ay.basis,
      deltaPx: { x: ax.pos - x0, y: ay.pos - y0, w: rectXW - rectW, h: rectYH - rectH },
      totalDeltaPx: ax.delta + ay.delta,
      m0: placeRect({ rootW, rootH, rectW: rectXW, rectH: rectYH, x: ax.pos, y: ay.pos }).m0,
    };
  };

  // Cross the two axis frontiers, then Pareto-filter on (delta, precision).
  const cands: Array<{ c: SnapRectCandidate; rawPrec: number }> = [];
  for (const ax of fx) {
    for (const ay of fy) {
      const c = make(ax, ay);
      cands.push({ c, rawPrec: Math.max((ax.basis / rootW) * 100, (ay.basis / rootH) * 100) });
    }
  }
  cands.sort((a, b) => a.c.totalDeltaPx - b.c.totalDeltaPx || a.rawPrec - b.rawPrec);

  const exact = make(fx[0], fy[0]); // both frontiers start at Δ0 (the request)

  const frontier: SnapRectCandidate[] = [];
  let bestPrec = Infinity;
  for (const { c, rawPrec } of cands) {
    if (rawPrec < bestPrec - 1e-9) {
      frontier.push(c);
      bestPrec = rawPrec;
    }
  }

  let best: SnapRectCandidate | null = null;
  if (maxPrecisionPct !== undefined) {
    for (const { c, rawPrec } of cands) {
      if (rawPrec <= maxPrecisionPct + 1e-9) {
        best = c; // cands are delta-sorted → first match is min-delta
        break;
      }
    }
  }

  return { exact, frontier, best };
}
