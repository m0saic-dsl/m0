/**
 * Aspect Safe Grid builder.
 *
 * Finds a coordinated PAIR of grids — one for the landscape canvas, one
 * for the portrait canvas — such that:
 *
 *   1. Both render **quantization-free** at their respective canvases.
 *   2. Both have the **same total cell count**.
 *   3. The cells in both orientations have **similar aspect ratio** —
 *      i.e., if landscape cells are landscape-oriented rectangles, the
 *      portrait cells are also landscape-oriented rectangles (and vice
 *      versa). This is what "the same layout in both orientations"
 *      really means for video / mobile design: the cell shape stays
 *      perceptually consistent so each cell holds the same kind of
 *      content (e.g. a wide film frame) regardless of device rotation.
 *
 * The portrait grid is **NOT** a simple transpose of the landscape grid.
 * For the canonical `1920×1080 ↔ 1080×1920` case with a `4 cols × 3 rows`
 * landscape (cell AR 1.33), the best portrait match is `2 cols × 6 rows`
 * (cell AR 1.69) — both landscape-oriented cells. A naive transpose to
 * `3 cols × 4 rows` would flip cells to AR 0.75 (portrait-oriented),
 * defeating the goal.
 *
 * ## Search algorithm
 *
 *   1. Enumerate every landscape `(R_l, C_l)` in the requested range.
 *      Reject any combination that can't render quantization-free at
 *      `landscapeW × landscapeH`.
 *   2. For each surviving landscape candidate, compute
 *      `cellAR_l = cellWPx / cellHPx`.
 *   3. Search the portrait range for `(R_p, C_p)` where
 *      `R_p × C_p === R_l × C_l` (same cell count) and the grid renders
 *      quantization-free at `portraitW × portraitH`. Pick the
 *      `(R_p, C_p)` that minimizes `|log(cellAR_l) − log(cellAR_p)|`
 *      (log-distance — symmetric across the AR=1 boundary, so 1.5 vs
 *      0.667 are correctly treated as equally far apart).
 *   4. Score the resulting `(landscape, portrait)` pair by a combination
 *      of AR similarity (primary), cell pixel size, and cell count
 *      (priority-dependent). Best score wins.
 */

import type { M0String } from "@m0saic/dsl";
import { strip } from "./strip";
import { snapGridFit } from "./snapGrid";

// ── Types ─────────────────────────────────────────────────

/** Priority mode for candidate ranking. */
export type AspectSafeGridPriority =
  | "balanced"
  | "cleanPixels"
  | "moreCells"
  | "largerCells";

/** Options for {@link aspectSafeGrid}. */
export type AspectSafeGridOptions = {
  /** Landscape canvas width. Default: 1920. */
  landscapeW?: number;
  /** Landscape canvas height. Default: 1080. */
  landscapeH?: number;
  /** Portrait canvas width. Default: 1080. */
  portraitW?: number;
  /** Portrait canvas height. Default: 1920. */
  portraitH?: number;

  /**
   * Default search range — applies to BOTH orientations when no
   * per-orientation override is set. Use these for the simple flow
   * "find any AR-matched pair within these bounds."
   */
  minCols?: number;  // default 2
  maxCols?: number;  // default 8
  minRows?: number;  // default 2
  maxRows?: number;  // default 8

  /**
   * Per-orientation range overrides. When set, override the default range
   * (above) for that specific orientation. Use these for the precise
   * flow "I want this exact landscape grid; pick any portrait that
   * matches its cell count and aspect."
   *
   * Setting `landscapeMinRows === landscapeMaxRows` (and same for cols)
   * effectively pins the landscape grid to one configuration; the portrait
   * range can then independently search for the AR-matched portrait.
   *
   * Independently optional per axis — e.g. you can pin landscape rows
   * but leave landscape cols on the default range.
   */
  landscapeMinRows?: number;
  landscapeMaxRows?: number;
  landscapeMinCols?: number;
  landscapeMaxCols?: number;
  portraitMinRows?: number;
  portraitMaxRows?: number;
  portraitMinCols?: number;
  portraitMaxCols?: number;

  /**
   * Target cell aspect ratio (`cellWPx / cellHPx`). When set, biases the
   * scoring toward pairs whose LANDSCAPE cell AR is close to this target.
   * Use values >1 for wider-than-tall cells (typical for video frames),
   * values <1 for taller-than-wide cells, and `1.0` for square cells.
   *
   * The portrait orientation is biased indirectly by the same constraint
   * (since the portrait is always picked to match landscape's AR).
   *
   * When unset (or 0), the search picks whichever pair has the closest
   * AR match between landscape and portrait, regardless of absolute AR.
   */
  targetCellAspectRatio?: number;

  /**
   * Target total cell count. When set, the search filters out (R, C)
   * candidates whose cell count differs from this target by more than
   * `cellCountTolerance` (default 4). Useful when the user knows roughly
   * how many items they need to display ("about 10 frames") and wants
   * the algorithm to handle the row/column trade-off.
   *
   * Note that the cell count is identical between the landscape and
   * portrait grids by construction, so this constraint applies to both.
   */
  targetCellCount?: number;
  /** Allowed deviation from `targetCellCount` (inclusive). Default: 4. */
  cellCountTolerance?: number;

  /**
   * When true, each orientation's grid is wrapped in a `placeRect` so it
   * can be letterboxed inside its canvas instead of required to tile the
   * canvas exactly. This dramatically widens the candidate set — every
   * `(R, C)` pair becomes valid since `snapGridFit` always finds the
   * largest inner rect that fits — at the cost of black bars when the
   * grid's natural aspect doesn't match the canvas aspect.
   *
   * Use this when the grid quality (cell aspect, cell size, AR match
   * across orientations) matters more than filling every pixel of the
   * canvas. The default `false` preserves the legacy "must tile exactly"
   * behavior.
   */
  letterbox?: boolean;

  /** Horizontal alignment of the inner grid when `letterbox: true`. Default: "center". */
  hAlign?: "left" | "center" | "right";
  /** Vertical alignment of the inner grid when `letterbox: true`. Default: "center". */
  vAlign?: "top" | "center" | "bottom";

  /** Target gutter ratio (0–0.2). Default: 0 (no gutter). */
  gutter?: number;
  /** Include outer gutters. Default: false. */
  outerGutters?: boolean;
  /** Scoring priority. Default: "balanced". */
  priority?: AspectSafeGridPriority;
};

/** A single oriented grid in the pair. */
export type AspectSafeGridOriented = {
  /** Quantization-free DSL for this orientation. */
  m0: M0String;
  /** Number of rows in this orientation. */
  rows: number;
  /** Number of columns in this orientation. */
  cols: number;
  /** Canvas dimensions this DSL is designed for. */
  canvasW: number;
  /** Canvas dimensions this DSL is designed for. */
  canvasH: number;
  /** Cell width in pixels at the design canvas. */
  cellWPx: number;
  /** Cell height in pixels at the design canvas. */
  cellHPx: number;
  /** Cell aspect ratio (`cellWPx / cellHPx`). */
  cellAspectRatio: number;
  /** X-axis gutter width in pixels (0 when no gutter). */
  gutterPxX: number;
  /** Y-axis gutter width in pixels (0 when no gutter). */
  gutterPxY: number;
};

/** Result from {@link aspectSafeGrid}. */
export type AspectSafeGridResult = {
  /**
   * Total cells — IDENTICAL in both orientations, by construction. The
   * search refuses to pair a landscape and portrait grid with different
   * cell counts because mismatched counts would mean the two layouts
   * can't represent the same content.
   */
  cellCount: number;
  /**
   * Cell aspect-ratio similarity between the two orientations, expressed
   * as a log-distance (`|log(landscape.cellAspectRatio) - log(portrait.cellAspectRatio)|`).
   * Smaller is better; `0` means identical cell aspect across the flip.
   */
  cellAspectLogDelta: number;
  /** Landscape orientation grid. */
  landscape: AspectSafeGridOriented;
  /** Portrait orientation grid (NOT a transpose — see file docblock). */
  portrait: AspectSafeGridOriented;
};

// ── Helpers ───────────────────────────────────────────────

/**
 * For a single axis, find the best `(cellW, gutterW)` weight pair such that
 * `N*cellW + gutterCount*gutterW` evenly divides the target canvas dim AND
 * the gutter ratio is as close as possible to `targetGutter`. Mirrors the
 * legacy `aspectSafeGrid` `findWeights` logic but parameterized to one axis
 * at a time so each orientation can search independently.
 *
 * Returns `null` when no clean weight pair exists for the requested
 * `(N, targetCanvasDim)` constraint.
 */
function findAxisWeights(
  count: number,
  targetCanvasDim: number,
  targetGutter: number,
  outer: boolean,
): { cellW: number; gutterW: number; totalW: number } | null {
  const gutterCount = outer ? count + 1 : count - 1;

  if (targetGutter <= 0 || gutterCount === 0) {
    // No-gutter path: targetCanvasDim must be divisible by count.
    if (targetCanvasDim % count !== 0) return null;
    const cellW = targetCanvasDim / count;
    return cellW >= 1 ? { cellW, gutterW: 0, totalW: targetCanvasDim } : null;
  }

  // With gutter: try integer gutterW values from 1 upward, picking the
  // pair whose gutter ratio is closest to the target.
  let best: { cellW: number; gutterW: number; totalW: number } | null = null;
  let bestErr = Infinity;
  // Cap the gutter search at the largest value that still leaves cellW >= 1.
  const maxGW = Math.floor(targetCanvasDim / (gutterCount + count));
  for (let gw = 1; gw <= maxGW; gw++) {
    const remainder = targetCanvasDim - gutterCount * gw;
    if (remainder <= 0 || remainder % count !== 0) continue;
    const cw = remainder / count;
    if (cw < 1) continue;
    const err = Math.abs(gw / cw - targetGutter);
    if (err < bestErr) {
      bestErr = err;
      best = { cellW: cw, gutterW: gw, totalW: targetCanvasDim };
    }
  }
  return best;
}

/**
 * Build an oriented grid result for one canvas. Returns `null` if no
 * quantization-free configuration exists for this `(R, C)` × `(W, H)`
 * combination. Emits the DSL via `strip` directly so each axis can use
 * its own `(cellWeight, gutterWeight)` — required because the per-axis
 * weight search produces different `cellW` values when the canvas isn't
 * square.
 */
function buildOrientedGrid(
  rows: number,
  cols: number,
  canvasW: number,
  canvasH: number,
  targetGutter: number,
  outerGutters: boolean,
): AspectSafeGridOriented | null {
  const xWeights = findAxisWeights(cols, canvasW, targetGutter, outerGutters);
  if (!xWeights) return null;
  const yWeights = findAxisWeights(rows, canvasH, targetGutter, outerGutters);
  if (!yWeights) return null;

  // Inner row-DSL: a horizontal split of `cols` cells with the X-axis weights.
  const rowDsl = strip(cols, "col", {
    cellWeight: xWeights.cellW,
    gutterWeight: xWeights.gutterW,
    outerGutters,
  });

  // Outer grid: a vertical split of `rows` rows, each row containing the
  // inner row-DSL as its claimant. Y-axis weights determine the row heights.
  const m0 = strip(rows, "row", {
    cellWeight: yWeights.cellW,
    gutterWeight: yWeights.gutterW,
    outerGutters,
    claimant: rowDsl,
  });

  return {
    m0,
    rows,
    cols,
    canvasW,
    canvasH,
    cellWPx: xWeights.cellW,
    cellHPx: yWeights.cellW,
    cellAspectRatio: xWeights.cellW / yWeights.cellW,
    gutterPxX: xWeights.gutterW,
    gutterPxY: yWeights.gutterW,
  };
}

/**
 * Letterbox-mode oriented grid. Always succeeds — `snapGridFit` finds the
 * largest quantization-free inner rect for `(rows, cols, gutter)` and
 * wraps it in a `placeRect` so the outer canvas keeps the requested
 * dimensions. Cell aspect ratio is determined by the inner rect, which
 * for square-ish canvases tends toward more balanced cells than the
 * exact-fit path.
 */
function buildLetterboxedOrientedGrid(
  rows: number,
  cols: number,
  canvasW: number,
  canvasH: number,
  targetGutter: number,
  outerGutters: boolean,
  hAlign: "left" | "center" | "right",
  vAlign: "top" | "center" | "bottom",
): AspectSafeGridOriented | null {
  try {
    const r = snapGridFit({
      rootW: canvasW,
      rootH: canvasH,
      rows,
      cols,
      gutter: targetGutter,
      outerGutters,
      hAlign,
      vAlign,
    });
    return {
      m0: r.m0,
      rows,
      cols,
      canvasW,
      canvasH,
      cellWPx: r.cellW,
      cellHPx: r.cellH,
      cellAspectRatio: r.cellW / r.cellH,
      gutterPxX: r.gutterPxX,
      gutterPxY: r.gutterPxY,
    };
  } catch {
    // snapGridFit can throw for degenerate (R, C) where even a 1px cell
    // doesn't fit. Treat as unfit so the search skips this candidate.
    return null;
  }
}

// ── Scoring ───────────────────────────────────────────────

interface Candidate {
  landscape: AspectSafeGridOriented;
  portrait: AspectSafeGridOriented;
  cellCount: number;
  /** Smallest cell pixel dimension across both orientations. */
  minCellPx: number;
  /** Log-distance between landscape and portrait cell aspect ratios. */
  cellAspectLogDelta: number;
}

/**
 * AR_PENALTY_WEIGHT — multiplier on the log-distance between landscape
 * and portrait cell aspect ratios. The whole point of this builder is to
 * keep cell aspect consistent across orientations, so this weight
 * dominates other terms by a large margin (a tiny AR mismatch is far
 * worse than a slightly-smaller cell, even on `largerCells` priority).
 */
const AR_PENALTY_WEIGHT = 1000;

/**
 * TARGET_AR_PENALTY_WEIGHT — multiplier on the log-distance between
 * landscape's cell AR and the user's `targetCellAspectRatio` (when set).
 * Slightly less aggressive than `AR_PENALTY_WEIGHT` because the cross-
 * orientation match is the harder constraint; the absolute target is a
 * preference, not a requirement.
 */
const TARGET_AR_PENALTY_WEIGHT = 500;

function scoreCandidate(
  c: Candidate,
  priority: AspectSafeGridPriority,
  targetAR: number | null,
): number {
  // AR similarity between L and P dominates — that's the primary intent.
  let score = c.cellAspectLogDelta * AR_PENALTY_WEIGHT;

  // Optional bias toward an absolute target cell aspect (when the user
  // knows the cell shape they want, regardless of which grid produces it).
  if (targetAR != null && targetAR > 0) {
    const targetDelta = Math.abs(
      Math.log(targetAR) - Math.log(c.landscape.cellAspectRatio),
    );
    score += targetDelta * TARGET_AR_PENALTY_WEIGHT;
  }

  // Penalize tiny cells regardless of priority — sub-30px cells look bad.
  if (c.minCellPx < 30) score += (30 - c.minCellPx) * 10;
  else if (c.minCellPx < 80) score += (80 - c.minCellPx) * 2;

  switch (priority) {
    case "cleanPixels":
      score -= Math.min(c.minCellPx, 300);
      break;
    case "moreCells":
      score -= c.cellCount * 5;
      break;
    case "largerCells":
      score -= Math.min(c.minCellPx, 500) * 2;
      break;
    case "balanced":
    default:
      score -= c.cellCount * 2;
      score -= Math.min(c.minCellPx, 200);
      break;
  }

  return score;
}

// ── Main ──────────────────────────────────────────────────

/**
 * Find a coordinated transpose pair of grids — one for landscape, one for
 * portrait — that both render quantization-free at their respective
 * canvases. The portrait grid is the row/column transpose of the landscape
 * grid, so flipping the canvas reorients the layout exactly the way users
 * expect when rotating a device.
 *
 * @example
 * // Default 1920×1080 ↔ 1080×1920 search
 * const r = aspectSafeGrid({ minCols: 2, maxCols: 6, minRows: 2, maxRows: 6 });
 * r.landscape.m0   // DSL for 4×3 grid at 1920×1080  (e.g. "4[3(F,F,F),...]")
 * r.portrait.m0    // DSL for 3×4 grid at 1080×1920  (e.g. "3[4(F,F,F,F),...]")
 *
 * @example
 * // 4K landscape ↔ 1080p portrait, with gutter
 * const r = aspectSafeGrid({
 *   landscapeW: 3840, landscapeH: 2160,
 *   portraitW: 1080, portraitH: 1920,
 *   gutter: 0.04,
 * });
 *
 * @throws when no `(R, C)` pair in the search range satisfies the
 *   four-way quantization-free constraint for the given canvas pair.
 */
export function aspectSafeGrid(opts: AspectSafeGridOptions = {}): AspectSafeGridResult {
  const {
    landscapeW = 1920,
    landscapeH = 1080,
    portraitW = 1080,
    portraitH = 1920,
    minCols = 2,
    maxCols = 8,
    minRows = 2,
    maxRows = 8,
    gutter = 0,
    outerGutters = false,
    priority = "balanced",
    targetCellAspectRatio,
    targetCellCount,
    cellCountTolerance = 4,
  } = opts;

  // Resolve per-orientation ranges. Per-orientation overrides take
  // precedence; otherwise fall through to the shared default range.
  const lMinR = opts.landscapeMinRows ?? minRows;
  const lMaxR = opts.landscapeMaxRows ?? maxRows;
  const lMinC = opts.landscapeMinCols ?? minCols;
  const lMaxC = opts.landscapeMaxCols ?? maxCols;
  const pMinR = opts.portraitMinRows ?? minRows;
  const pMaxR = opts.portraitMaxRows ?? maxRows;
  const pMinC = opts.portraitMinCols ?? minCols;
  const pMaxC = opts.portraitMaxCols ?? maxCols;

  const targetAR = targetCellAspectRatio != null && targetCellAspectRatio > 0
    ? targetCellAspectRatio
    : null;

  const letterbox = opts.letterbox === true;
  const hAlign = opts.hAlign ?? "center";
  const vAlign = opts.vAlign ?? "center";

  // Pick the per-orientation grid builder based on mode. Exact-fit
  // requires the grid to tile the canvas perfectly; letterbox wraps in
  // placeRect to fit any (R, C) inside the canvas with letterbox padding.
  const buildGrid = letterbox
    ? (r: number, c: number, w: number, h: number) =>
        buildLetterboxedOrientedGrid(r, c, w, h, gutter, outerGutters, hAlign, vAlign)
    : (r: number, c: number, w: number, h: number) =>
        buildOrientedGrid(r, c, w, h, gutter, outerGutters);

  if (!Number.isInteger(landscapeW) || landscapeW < 1)
    throw new Error("aspectSafeGrid: landscapeW must be a positive integer");
  if (!Number.isInteger(landscapeH) || landscapeH < 1)
    throw new Error("aspectSafeGrid: landscapeH must be a positive integer");
  if (!Number.isInteger(portraitW) || portraitW < 1)
    throw new Error("aspectSafeGrid: portraitW must be a positive integer");
  if (!Number.isInteger(portraitH) || portraitH < 1)
    throw new Error("aspectSafeGrid: portraitH must be a positive integer");
  if (lMinC < 1 || lMaxC < lMinC || pMinC < 1 || pMaxC < pMinC)
    throw new Error("aspectSafeGrid: invalid column range");
  if (lMinR < 1 || lMaxR < lMinR || pMinR < 1 || pMaxR < pMinR)
    throw new Error("aspectSafeGrid: invalid row range");

  let bestScore = Infinity;
  let bestCandidate: Candidate | null = null;

  // Phase 1: enumerate landscape (R_l, C_l) candidates within the
  // landscape range (which may be tighter than the portrait range when
  // the user pins the landscape grid).
  for (let rL = lMinR; rL <= lMaxR; rL++) {
    for (let cL = lMinC; cL <= lMaxC; cL++) {
      // Cell-count filter — when the user specifies a target, skip pairs
      // whose count is outside the fuzzy window.
      if (targetCellCount != null && targetCellCount > 0) {
        const candCount = rL * cL;
        if (Math.abs(candCount - targetCellCount) > cellCountTolerance) continue;
      }
      const landscape = buildGrid(rL, cL, landscapeW, landscapeH);
      if (!landscape) continue;

      const cellCount = rL * cL;
      const logArL = Math.log(landscape.cellAspectRatio);

      // Phase 2: for THIS landscape, find the portrait (R_p, C_p) that
      // also fits cleanly AND has the same cellCount AND minimizes
      // cell-aspect-ratio distance. The portrait is NOT a transpose —
      // it's whichever (R_p, C_p) within the search range best preserves
      // cell aspect after orientation flip.
      let bestPortrait: AspectSafeGridOriented | null = null;
      let bestPortraitArDelta = Infinity;

      for (let rP = pMinR; rP <= pMaxR; rP++) {
        for (let cP = pMinC; cP <= pMaxC; cP++) {
          if (rP * cP !== cellCount) continue;
          const portrait = buildGrid(rP, cP, portraitW, portraitH);
          if (!portrait) continue;
          const arDelta = Math.abs(logArL - Math.log(portrait.cellAspectRatio));
          if (arDelta < bestPortraitArDelta) {
            bestPortraitArDelta = arDelta;
            bestPortrait = portrait;
          }
        }
      }

      if (!bestPortrait) continue;

      const minCellPx = Math.min(
        landscape.cellWPx, landscape.cellHPx,
        bestPortrait.cellWPx, bestPortrait.cellHPx,
      );
      const candidate: Candidate = {
        landscape,
        portrait: bestPortrait,
        cellCount,
        minCellPx,
        cellAspectLogDelta: bestPortraitArDelta,
      };
      const score = scoreCandidate(candidate, priority, targetAR);
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }
  }

  if (!bestCandidate) {
    throw new Error(
      "aspectSafeGrid: no aspect-matched grid pair found that's quantization-free " +
      "at both canvases for the given parameters.",
    );
  }

  return {
    cellCount: bestCandidate.cellCount,
    cellAspectLogDelta: bestCandidate.cellAspectLogDelta,
    landscape: bestCandidate.landscape,
    portrait: bestCandidate.portrait,
  };
}
