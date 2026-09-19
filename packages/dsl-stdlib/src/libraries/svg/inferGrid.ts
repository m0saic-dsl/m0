/**
 * Infer a grid from a set of shape bounds.
 *
 * Lifted from `packages/docs/svg-to-mosaic/tools/03-infer-grid.ts`.
 *
 * Two algorithms:
 *  - `"gcd-snap"` (default, production): directed divisor search — find the
 *    largest divisor of each canvas dim such that snapping every raw edge to
 *    a multiple of `d` stays inside the drift budget, with no shape collapsing.
 *    Delivers ~9× DSL reduction in production assets by making per-axis GCD
 *    reduction free downstream.
 *  - `"cluster"`: bounded-width clustering on sorted edge values. Used when
 *    `driftPercent === 0`, when no viewBox is available, or as a fallback if
 *    gcd-snap is infeasible at the requested drift budget.
 *
 * The fall-through from gcd-snap → cluster is silent — `meta.effectiveDriftMode`
 * surfaces it for downstream telemetry instead of writing to the console.
 *
 * Pure, deterministic, no I/O.
 */

import type {
  DriftMode,
  ExtractedShape,
  Grid,
  GridDriftMeta,
  GridShape,
  ViewBox,
} from "./types";

// Noise floor from float quantization of SVG path bounds. Preserved as the
// minimum cluster tolerance so driftPercent=0 reproduces legacy behavior
// byte-for-byte.
const NOISE_FLOOR_TOLERANCE = 0.25;

export type InferGridOptions = {
  /** Drift tolerance as % of min canvas dim. Default 0 (noise-floor only). */
  driftPercent?: number;
  /** Algorithm. Default "gcd-snap". */
  driftMode?: DriftMode;
};

// Bounded-width clustering: a new value joins the current cluster only if its
// distance from the cluster's MINIMUM (i.e. the first value, since sorted)
// stays within tolerance. Each cluster has span ≤ tolerance, so the cluster
// mean is at most `tolerance` away from any member in the worst case.
function cluster(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [];
  for (const v of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last || v - last[0] > tolerance) {
      clusters.push([v]);
      continue;
    }
    last.push(v);
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length);
}

// Divisors of n in descending order. O(sqrt(n)) via factor pairs.
function divisorsDesc(n: number): number[] {
  const divisors: number[] = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      divisors.push(i);
      if (i !== n / i) divisors.push(n / i);
    }
  }
  divisors.sort((a, b) => b - a);
  return divisors;
}

// Directed divisor search on a single axis.
//
// Returns null if no divisor satisfies (max drift ≤ budget) AND (≥ 2 distinct
// lines) AND (no shape collapses). Caller falls back to cluster.
function gcdSnapAxis(
  rawEdges: number[],
  shapeBoundPairs: Array<[number, number]>,
  canvasDim: number,
  driftBudget: number,
): { lines: number[]; d: number; maxDrift: number; meanDrift: number } | null {
  const divisors = divisorsDesc(canvasDim);
  for (const d of divisors) {
    const snapped = rawEdges.map((e) => d * Math.round(e / d));
    let maxDrift = 0;
    let sumDrift = 0;
    for (let i = 0; i < rawEdges.length; i++) {
      const drift = Math.abs(rawEdges[i] - snapped[i]);
      if (drift > maxDrift) maxDrift = drift;
      sumDrift += drift;
    }
    if (maxDrift > driftBudget) continue;

    const uniqueSet = new Set<number>(snapped);
    const lines = [...uniqueSet].sort((a, b) => a - b);
    if (lines.length < 2) continue;

    let allOk = true;
    for (const [a, b] of shapeBoundPairs) {
      const sa = d * Math.round(a / d);
      const sb = d * Math.round(b / d);
      if (sa === sb) {
        allOk = false;
        break;
      }
    }
    if (!allOk) continue;

    return {
      lines,
      d,
      maxDrift,
      meanDrift: rawEdges.length > 0 ? sumDrift / rawEdges.length : 0,
    };
  }
  return null;
}

function nearestIndex(value: number, lines: number[]): number {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < lines.length; i++) {
    const d = Math.abs(value - lines[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
    }
  }
  return bestIndex;
}

const DEFAULTS: Required<InferGridOptions> = {
  driftPercent: 0,
  driftMode: "gcd-snap",
};

/**
 * Infer a {@link Grid} from a set of extracted shapes.
 *
 * `shapes` must have valid `bounds.left/right/top/bottom`. `viewBox` is
 * required when `driftPercent > 0` (the drift budget is computed as a
 * fraction of the smaller canvas dimension). Pure and deterministic.
 *
 * @throws if shapes is empty, driftPercent is negative or non-finite,
 *         driftMode is unrecognised, or driftPercent > 0 with no viewBox.
 */
export function inferGrid(
  shapes: ExtractedShape[],
  viewBox: ViewBox | null,
  opts: InferGridOptions = {},
): Grid {
  if (!Array.isArray(shapes) || shapes.length === 0) {
    throw new Error("inferGrid: shapes must be non-empty");
  }
  // Coalesce per-key so that `undefined` passed through from callers (e.g.
  // svgToM0 forwarding an unset prop) doesn't shadow the default value.
  const merged: Required<InferGridOptions> = {
    driftPercent: opts.driftPercent ?? DEFAULTS.driftPercent,
    driftMode: opts.driftMode ?? DEFAULTS.driftMode,
  };
  if (!Number.isFinite(merged.driftPercent) || merged.driftPercent < 0) {
    throw new Error(
      `inferGrid: driftPercent must be a non-negative number, got ${merged.driftPercent}`,
    );
  }
  if (merged.driftMode !== "cluster" && merged.driftMode !== "gcd-snap") {
    throw new Error(
      `inferGrid: driftMode must be "cluster" or "gcd-snap", got "${String(merged.driftMode)}"`,
    );
  }
  if (merged.driftPercent > 0 && !viewBox) {
    throw new Error(
      "inferGrid: driftPercent > 0 requires a viewBox (canvas dimensions are needed to compute the drift budget)",
    );
  }

  const xEdges: number[] = [];
  const yEdges: number[] = [];
  for (const s of shapes) {
    xEdges.push(s.bounds.left, s.bounds.right);
    yEdges.push(s.bounds.top, s.bounds.bottom);
  }
  if (viewBox) {
    xEdges.push(viewBox.x, viewBox.x + viewBox.width);
    yEdges.push(viewBox.y, viewBox.y + viewBox.height);
  }

  let driftBudgetPx = NOISE_FLOOR_TOLERANCE;
  if (merged.driftPercent > 0 && viewBox) {
    const canvasMin = Math.min(viewBox.width, viewBox.height);
    driftBudgetPx = Math.max(
      NOISE_FLOOR_TOLERANCE,
      (merged.driftPercent / 100) * canvasMin,
    );
  }

  let xLines: number[];
  let yLines: number[];
  let achievedGcd: { col: number; row: number } | null = null;
  let effectiveDriftMode: DriftMode;

  if (merged.driftMode === "gcd-snap" && merged.driftPercent > 0 && viewBox) {
    const xShapePairs: Array<[number, number]> = shapes.map((s) => [
      s.bounds.left,
      s.bounds.right,
    ]);
    const yShapePairs: Array<[number, number]> = shapes.map((s) => [
      s.bounds.top,
      s.bounds.bottom,
    ]);
    const xResult = gcdSnapAxis(xEdges, xShapePairs, viewBox.width, driftBudgetPx);
    const yResult = gcdSnapAxis(yEdges, yShapePairs, viewBox.height, driftBudgetPx);
    if (xResult && yResult) {
      xLines = xResult.lines;
      yLines = yResult.lines;
      achievedGcd = { col: xResult.d, row: yResult.d };
      effectiveDriftMode = "gcd-snap";
    } else {
      // Silent fallback. Inspect meta.effectiveDriftMode to detect.
      xLines = cluster(xEdges, driftBudgetPx);
      yLines = cluster(yEdges, driftBudgetPx);
      effectiveDriftMode = "cluster";
    }
  } else {
    xLines = cluster(xEdges, driftBudgetPx);
    yLines = cluster(yEdges, driftBudgetPx);
    effectiveDriftMode = "cluster";
  }

  // Walk every shape edge and compute its displacement to the nearest line.
  // This is the actual observed drift after snapping.
  let maxActualDriftPx = 0;
  let sumActualDriftPx = 0;
  let edgesMeasured = 0;
  for (const s of shapes) {
    const samples: Array<{ value: number; lines: number[] }> = [
      { value: s.bounds.left, lines: xLines },
      { value: s.bounds.right, lines: xLines },
      { value: s.bounds.top, lines: yLines },
      { value: s.bounds.bottom, lines: yLines },
    ];
    for (const { value, lines } of samples) {
      let bestDist = Infinity;
      for (const line of lines) {
        const d = Math.abs(value - line);
        if (d < bestDist) bestDist = d;
      }
      if (bestDist > maxActualDriftPx) maxActualDriftPx = bestDist;
      sumActualDriftPx += bestDist;
      edgesMeasured++;
    }
  }

  const meta: GridDriftMeta = {
    requestedDriftPercent: merged.driftPercent,
    requestedDriftMode: merged.driftMode,
    effectiveDriftMode,
    toleranceUsedPx: driftBudgetPx,
    achievedGcd,
    maxActualDriftPx,
    meanActualDriftPx: edgesMeasured > 0 ? sumActualDriftPx / edgesMeasured : 0,
    edgesMeasured,
  };

  const gridShapes: GridShape[] = shapes.map((s) => {
    const xStart = nearestIndex(s.bounds.left, xLines);
    const xEnd = nearestIndex(s.bounds.right, xLines);
    const yStart = nearestIndex(s.bounds.top, yLines);
    const yEnd = nearestIndex(s.bounds.bottom, yLines);
    const left = xLines[xStart];
    const right = xLines[xEnd];
    const top = yLines[yStart];
    const bottom = yLines[yEnd];
    return {
      id: s.id,
      index: s.index,
      rawBounds: s.bounds,
      snappedBounds: {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
        left,
        top,
        right,
        bottom,
      },
      gridSpan: { xStart, xEnd, yStart, yEnd },
      // Carry the original SVG path data + style through so downstream
      // consumers (e.g. `generateMasks`) don't need a second pass over the
      // ExtractedShape array.
      geometry: { d: s.geometry.d },
      style: s.style,
    };
  });

  return {
    viewBox: viewBox ?? null,
    xLines,
    yLines,
    shapes: gridShapes,
    meta,
  };
}
