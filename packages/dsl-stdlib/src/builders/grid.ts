import type { M0String } from "@m0saic/dsl";
import { equalSplit } from "./equalSplit";
import { strip } from "./strip";

export type GridOptions = {
  rows: number;
  cols: number;
  gutter?: number;
  outerGutters?: boolean;
  /**
   * Explicit cell weight. When omitted AND outputWidth/outputHeight are given,
   * the weight is auto-computed to keep ≥4 px per weight unit (prevents
   * splitEven quantization artefacts at high grid counts).
   */
  cellWeightBase?: number;
  /** Output pixel width.  Enables auto cell-weight scaling and equal-gap correction. */
  outputWidth?: number;
  /** Output pixel height. Enables auto cell-weight scaling and equal-gap correction. */
  outputHeight?: number;
};

export type GridResult = {
  m0: M0String;
  order: number[];
  totalX: number;
  totalY: number;
  /** X-axis cell weight. */
  cellW: number;
  /** Y-axis cell weight (equals cellW when no output dimensions are provided). */
  cellH: number;
  gutterW: number;
};

/**
 * Grid weight configuration defaults.
 *
 * MIN_PX_PER_WEIGHT
 * -----------------
 * Ensures weight resolution does not exceed pixel resolution. When
 * pixels-per-weight ≥ 4, the splitEven() remainder is at most 25% of
 * the base allocation, which keeps per-cell size variation visually
 * negligible even under large grid counts.
 *
 * DEFAULT_CELL_WEIGHT
 * -------------------
 * Maximum precision baseline for cell weights when auto-scaling is
 * not required. A value of 50 provides 2% relative gutter precision
 * (1/50) while keeping total weight counts low enough to avoid
 * px-per-weight collapse on common video resolutions.
 *
 * Higher values (e.g., 100) increase theoretical ratio precision but
 * significantly raise quantization risk by reducing pixels-per-weight.
 * Lower values reduce gutter control granularity.
 */
const MIN_PX_PER_WEIGHT = 4;
const DEFAULT_CELL_WEIGHT = 50;

export function grid(
  opts: GridOptions
): GridResult {
  const { rows, cols, gutter, outerGutters = false } = opts;

  const hasGutter = gutter != null && gutter > 0;

  // ── Simple path: no gutters, no output-dimension correction, no explicit
  //    weight override → emit minimal nested equal splits.
  //    2×3 → 3[2(F,F),2(F,F),2(F,F)]  (compact, precision = max(rows, cols))
  if (
    !hasGutter &&
    !outerGutters &&
    opts.cellWeightBase == null &&
    opts.outputWidth == null &&
    opts.outputHeight == null
  ) {
    const rowExpr = equalSplit(cols, "col");
    const m0 = rows === 1 ? rowExpr : equalSplit(rows, "row", rowExpr);

    const order: number[] = [];
    for (let i = 0; i < rows * cols; i++) order.push(i);

    return { m0, order, totalX: cols, totalY: rows, cellW: 1, cellH: 1, gutterW: 0 };
  }

  // ── Weighted path: gutters, output dimensions, or explicit weight override.
  const gutterCountX = !hasGutter ? 0 : outerGutters ? cols + 1 : cols - 1;
  const gutterCountY = !hasGutter ? 0 : outerGutters ? rows + 1 : rows - 1;

  // --- Cell weight (X axis) ---
  // When output dimensions are given and no explicit override, auto-scale so
  // that totalX ≤ outputWidth / MIN_PX_PER_WEIGHT (prevents splitEven
  // quantization artefacts at high grid counts).
  let cellW: number;
  if (opts.cellWeightBase != null) {
    cellW = opts.cellWeightBase;
  } else if (opts.outputWidth != null && opts.outputWidth > 0) {
    const maxTotalX = Math.floor(opts.outputWidth / MIN_PX_PER_WEIGHT);
    // Approximate gutterW=1 for the budget calculation (actual gutterW computed after cellW).
    const approxGutterSlots = hasGutter ? gutterCountX : 0;
    cellW = Math.max(
      2,
      Math.min(
        DEFAULT_CELL_WEIGHT,
        Math.floor((maxTotalX - approxGutterSlots) / cols),
      ),
    );
  } else {
    cellW = DEFAULT_CELL_WEIGHT;
  }

  const gutterW = hasGutter ? Math.max(1, Math.round(cellW * gutter!)) : 0;

  // --- Cell weight (Y axis) ---
  // When output dimensions are provided, scale cellH so that one gutterW
  // weight maps to the same number of pixels on both axes.
  // Goal: outputWidth / totalX = outputHeight / totalY
  //     → totalY = totalX * outputHeight / outputWidth
  let cellH = cellW;
  if (
    opts.outputWidth != null &&
    opts.outputHeight != null &&
    opts.outputWidth > 0 &&
    opts.outputHeight > 0
  ) {
    const totalX = cols * cellW + gutterCountX * gutterW;
    const targetTotalY = (totalX * opts.outputHeight) / opts.outputWidth;
    cellH = Math.max(
      1,
      Math.round((targetTotalY - gutterCountY * gutterW) / rows),
    );
  }

  const totalX = cols * cellW + gutterCountX * gutterW;
  const totalY = rows * cellH + gutterCountY * gutterW;

  // Build row expression via strip, then stack rows via strip
  const rowExpr = strip(cols, "col", {
    cellWeight: cellW,
    gutterWeight: gutterW,
    outerGutters,
  });

  const m0 = strip(rows, "row", {
    cellWeight: cellH,
    gutterWeight: gutterW,
    outerGutters,
    claimant: rowExpr,
  });

  const order: number[] = [];
  for (let i = 0; i < rows * cols; i++) {
    order.push(i);
  }

  return { m0, order, totalX, totalY, cellW, cellH, gutterW };
}
