import {
  areM0StringsFrameEqual,
  computeFeasibility,
  getComplexityMetricsFast,
  validateM0String,
  type M0Feasibility,
  type M0Precision,
} from "@m0saic/dsl";
import { quantizationSpread } from "./quantizationSpread";

/**
 * evaluateM0 / compareM0 — a layout-quality toolkit
 * ------------------------------------------------------------------
 * Bundle the deterministic stats that describe "how good is this m0 layout" into
 * one place, so a caller that generates an m0 several different ways can MEASURE
 * each and pick the best for its task — instead of guessing.
 *
 * TWO DIFFERENT FLOORS — don't conflate them (they can CROSS):
 * - `feasibility` = "won't ERROR". The smallest canvas with no 0-size *frame*.
 *   `feasible` = does THIS canvas clear it.
 * - `precision` = "will LOOK RIGHT". The smallest canvas where every split cell
 *   (incl. passthrough/donation cells) is ≥1px, so nothing is squashed/unbalanced.
 *   `meetsPrecision` = does THIS canvas clear it on BOTH axes (W≥maxSplitX, H≥maxSplitY).
 *   Below it the appearance isn't guaranteed.
 *   Neither implies the other: `weightedSplit([3,5,2])` is FEASIBLE at 7px (3 frames,
 *   none zero) but only LOOKS RIGHT at ≥10px (its 10-slot basis). In practice you
 *   want both → `recommendedMin` = per-axis `max(feasibility, precision)`.
 *
 * The stats, and the usual direction of "better":
 * - `dslLength`        chars in the string. Lower is generally better (cheaper to
 *                      store/parse) — but irrelevant for runtime-regenerated m0.
 * - `feasibility`      `{minWidthPx,minHeightPx}` — smallest canvas that RENDERS
 *                      (no error). LOWER is better: works on more canvases.
 * - `feasible`         does THIS canvas clear the feasibility floor (won't error)?
 * - `precision`        `maxSplitX/Y/Any` — the LOOKS-RIGHT floor. LOWER is better.
 * - `meetsPrecision`   does THIS canvas clear precision on both axes (looks right)?
 * - `recommendedMin`   smallest canvas that BOTH renders and looks right.
 * - `frameCount`       rendered leaves. CONTEXT-dependent: when comparing two ways
 *                      to express the SAME layout you usually want them equal, else
 *                      you're comparing apples to oranges (see `comparable`).
 * - `passthroughCount` `0`/`>` leaves. LOWER is better (less editor/brain noise).
 * - `nullCount`        `-` leaves. LOWER is generally better.
 * - `maxSpreadPx`      quantization drift at this canvas (see `quantizationSpread`).
 *                      CONTEXT-dependent: sometimes you trade it for portability.
 *
 * Canvas-INDEPENDENT stats (dslLength, feasibility, precision, recommendedMin, the
 * counts) are the same at any size; only `feasible`, `meetsPrecision` + `maxSpreadPx`
 * depend on the canvas.
 */

export type M0Canvas = { width: number; height: number };

export type M0Evaluation = {
  canvas: M0Canvas;
  dslLength: number;
  /** "Won't error" floor: smallest canvas with no 0-size frame. */
  feasibility: M0Feasibility;
  /** Does THIS canvas clear feasibility (won't error)? */
  feasible: boolean;
  /** "Looks right" floor: `maxSplitX/Y/Any`. */
  precision: M0Precision;
  /** Does THIS canvas clear precision on BOTH axes (W≥maxSplitX, H≥maxSplitY)? */
  meetsPrecision: boolean;
  /** Smallest canvas that BOTH renders and looks right: per-axis max(feasibility, precision). */
  recommendedMin: { width: number; height: number };
  frameCount: number;
  passthroughCount: number;
  nullCount: number;
  groupCount: number;
  nodeCount: number;
  /** Worst quantization drift (px) at this canvas; Infinity if infeasible here. */
  maxSpreadPx: number;
};

/**
 * Compute the full stat bundle for `m0` at one `canvas`. **Throws on anything that
 * isn't valid m0** — evaluate/compare only operate on real m0 strings.
 */
export function evaluateM0(m0: string, canvas: M0Canvas): M0Evaluation {
  const v = validateM0String(m0);
  if (!v.ok) {
    const detail = "error" in v && v.error ? `: ${v.error.message ?? v.error.code}` : "";
    throw new Error(`evaluateM0: not a valid m0 string${detail}`);
  }
  // Already validated above; getComplexityMetricsFast returns the full metrics
  // without re-validating (and never returns null).
  const metrics = getComplexityMetricsFast(m0);
  const feasibility = computeFeasibility(m0);
  const W = Math.max(1, Math.round(canvas.width));
  const H = Math.max(1, Math.round(canvas.height));
  const feasible = W >= feasibility.minWidthPx && H >= feasibility.minHeightPx;
  const meetsPrecision =
    W >= metrics.precision.maxSplitX && H >= metrics.precision.maxSplitY;
  const recommendedMin = {
    width: Math.max(feasibility.minWidthPx, metrics.precision.maxSplitX),
    height: Math.max(feasibility.minHeightPx, metrics.precision.maxSplitY),
  };

  return {
    canvas: { width: W, height: H },
    dslLength: m0.length,
    feasibility,
    feasible,
    precision: metrics.precision,
    meetsPrecision,
    recommendedMin,
    frameCount: metrics.frameCount,
    passthroughCount: metrics.passthroughCount,
    nullCount: metrics.nullCount,
    groupCount: metrics.groupCount,
    nodeCount: metrics.nodeCount,
    maxSpreadPx: feasible ? quantizationSpread(m0, W, H).maxSpreadPx : Infinity,
  };
}

export type M0MetricDirection = "lower" | "higher" | "context";

export type M0MetricComparison = {
  key: string;
  a: number;
  b: number;
  /** Which way is "better" for this metric, or "context" when it depends. */
  betterWhen: M0MetricDirection;
  /** Winner by `betterWhen` ("tie" when equal or context-dependent). */
  winner: "a" | "b" | "tie";
};

export type M0Side = {
  /** Per-canvas evaluations, in the order canvases were given. */
  perCanvas: M0Evaluation[];
  /** Worst (max) quantization drift across all canvases. */
  worstSpreadPx: number;
  /** True if the layout is infeasible (would error) at any of the canvases. */
  anyInfeasible: boolean;
  /** True if the layout is below its precision floor (may not look right) at any canvas. */
  anyBelowPrecision: boolean;
};

export type M0Comparison = {
  canvases: M0Canvas[];
  a: M0Side;
  b: M0Side;
  /** Same rendered frame count ⇒ apples-to-apples. */
  comparable: boolean;
  /**
   * True when `a` and `b` produce the IDENTICAL ordered render frames — i.e. they
   * are the same layout expressed two ways (canvas-independent; via
   * `areM0StringsFrameEqual`). When true the choice is unambiguous: keep the
   * shorter string (`recommendation`).
   */
  geometricallyEqual: boolean;
  /**
   * The string to keep. Only set (non-null) when `geometricallyEqual` — then it
   * is the shorter `dslLength` ("tie" if equal length). Null otherwise: the
   * layouts differ, so the caller weighs the metrics for its task.
   */
  recommendation: "a" | "b" | "tie" | null;
  /** Per-metric comparison (canvas-independent metrics + worst-case spread). */
  metrics: M0MetricComparison[];
  /** Count of directional metrics each side wins (a soft hint, not a verdict). */
  directionalWins: { a: number; b: number };
  notes: string[];
};

function side(m0: string, canvases: M0Canvas[]): M0Side {
  const perCanvas = canvases.map((c) => evaluateM0(m0, c));
  return {
    perCanvas,
    worstSpreadPx: perCanvas.reduce((m, e) => Math.max(m, e.maxSpreadPx), 0),
    anyInfeasible: perCanvas.some((e) => !e.feasible),
    anyBelowPrecision: perCanvas.some((e) => !e.meetsPrecision),
  };
}

/**
 * Compare two m0 strings across one or more canvases and return per-metric stats
 * so the caller can decide which is better for its task. Does NOT impose a single
 * winner — `betterWhen: "context"` metrics (spread, frameCount) are left to the
 * caller, and `directionalWins` is only a soft hint.
 */
export function compareM0(
  a: string,
  b: string,
  canvases: M0Canvas | M0Canvas[],
): M0Comparison {
  const list = Array.isArray(canvases) ? canvases : [canvases];
  if (list.length === 0) {
    throw new Error("compareM0: provide at least one canvas");
  }
  const A = side(a, list);
  const B = side(b, list);
  const ea = A.perCanvas[0];
  const eb = B.perCanvas[0];

  const rows: Array<[string, number, number, M0MetricDirection]> = [
    ["dslLength", ea.dslLength, eb.dslLength, "lower"],
    ["minWidthPx", ea.feasibility.minWidthPx, eb.feasibility.minWidthPx, "lower"],
    ["minHeightPx", ea.feasibility.minHeightPx, eb.feasibility.minHeightPx, "lower"],
    ["precisionMaxSplitAny", ea.precision.maxSplitAny, eb.precision.maxSplitAny, "lower"],
    ["passthroughCount", ea.passthroughCount, eb.passthroughCount, "lower"],
    ["nullCount", ea.nullCount, eb.nullCount, "lower"],
    ["worstSpreadPx", A.worstSpreadPx, B.worstSpreadPx, "context"],
    ["frameCount", ea.frameCount, eb.frameCount, "context"],
  ];

  let winsA = 0;
  let winsB = 0;
  const metrics: M0MetricComparison[] = rows.map(([key, av, bv, betterWhen]) => {
    let winner: "a" | "b" | "tie" = "tie";
    if (betterWhen === "lower") winner = av < bv ? "a" : bv < av ? "b" : "tie";
    else if (betterWhen === "higher") winner = av > bv ? "a" : bv > av ? "b" : "tie";
    if (winner === "a") winsA++;
    else if (winner === "b") winsB++;
    return { key, a: av, b: bv, betterWhen, winner };
  });

  const comparable = ea.frameCount === eb.frameCount;

  // Geometric equality: do both strings produce the identical ordered frames?
  // Canvas-independent (frame-equal ⇒ identical at any size), so a single check.
  const geometricallyEqual = areM0StringsFrameEqual(a, b);
  let recommendation: "a" | "b" | "tie" | null = null;
  if (geometricallyEqual) {
    recommendation = ea.dslLength < eb.dslLength ? "a" : eb.dslLength < ea.dslLength ? "b" : "tie";
  }

  const notes: string[] = [];
  if (geometricallyEqual) {
    notes.push(
      recommendation === "tie"
        ? `identical frames and equal length (${ea.dslLength} chars) — interchangeable.`
        : `identical frames — keep the shorter string "${recommendation}" (${Math.min(ea.dslLength, eb.dslLength)} vs ${Math.max(ea.dslLength, eb.dslLength)} chars).`,
    );
  } else if (!comparable) {
    notes.push(
      `frame counts differ (a=${ea.frameCount}, b=${eb.frameCount}) — not apples-to-apples; the two strings express different layouts.`,
    );
  }
  if (A.anyInfeasible || B.anyInfeasible) {
    notes.push(
      `infeasible at some canvas (a=${A.anyInfeasible}, b=${B.anyInfeasible}) — would error; spread for that side is Infinity there.`,
    );
  }
  if (A.anyBelowPrecision || B.anyBelowPrecision) {
    notes.push(
      `below the precision floor at some canvas (a=${A.anyBelowPrecision}, b=${B.anyBelowPrecision}) — renders but may not look right there; compare at ≥ recommendedMin.`,
    );
  }

  return {
    canvases: list.map((c) => ({ width: Math.max(1, Math.round(c.width)), height: Math.max(1, Math.round(c.height)) })),
    a: A,
    b: B,
    comparable,
    geometricallyEqual,
    recommendation,
    metrics,
    directionalWins: { a: winsA, b: winsB },
    notes,
  };
}
