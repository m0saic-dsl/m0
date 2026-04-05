/**
 * Safe Canvas builder.
 *
 * Given a grid config (rows, cols, gutter, outerGutters) and a target
 * resolution, computes the largest canvas dimensions where the grid
 * renders with zero pixel distortion.
 *
 * The safe canvas is the largest multiple of each axis's total weight
 * that fits within the target dimensions.
 */

import { grid } from "./grid";
import type { GridResult } from "./grid";

// ── Types ─────────────────────────────────────────────────

/** Options for {@link safeCanvas}. */
export type SafeCanvasOptions = {
  /** Grid column count. */
  cols: number;
  /** Grid row count. */
  rows: number;
  /** Gutter ratio (0–0.2). Default: 0. */
  gutter?: number;
  /** Include outer gutters. Default: false. */
  outerGutters?: boolean;
  /** Maximum width to fit within. Default: 1920. */
  maxWidth?: number;
  /** Maximum height to fit within. Default: 1080. */
  maxHeight?: number;
};

/** Result from {@link safeCanvas}. */
export type SafeCanvasResult = {
  /** Safe canvas width. */
  width: number;
  /** Safe canvas height. */
  height: number;
  /** Total weight on X axis. */
  totalX: number;
  /** Total weight on Y axis. */
  totalY: number;
  /** Pixels per weight at safe width. */
  ppwX: number;
  /** Pixels per weight at safe height. */
  ppwY: number;
  /** The grid result at the safe canvas dimensions. */
  gridResult: GridResult;
};

// ── Main ──────────────────────────────────────────────────

/**
 * Compute the largest canvas where a guttered grid has zero distortion.
 *
 * @example
 * // 8×6 grid, 10% gutter, max 1920×1080
 * safeCanvas({ rows: 6, cols: 8, gutter: 0.1, maxWidth: 1920, maxHeight: 1080 })
 * // => { width: 1740, height: 975, ... }
 */
export function safeCanvas(opts: SafeCanvasOptions): SafeCanvasResult {
  const {
    cols,
    rows,
    gutter = 0,
    outerGutters = false,
    maxWidth = 1920,
    maxHeight = 1080,
  } = opts;

  if (!Number.isInteger(cols) || cols < 1)
    throw new Error("safeCanvas: cols must be a positive integer");
  if (!Number.isInteger(rows) || rows < 1)
    throw new Error("safeCanvas: rows must be a positive integer");

  // Generate the grid to get its total weights
  const gridResult = grid({
    rows,
    cols,
    gutter: gutter > 0 ? gutter : undefined,
    outerGutters,
  });

  const { totalX, totalY } = gridResult;

  // Largest multiples of totalX/totalY that fit within max dims
  const mx = Math.floor(maxWidth / totalX);
  const my = Math.floor(maxHeight / totalY);

  if (mx < 1 || my < 1) {
    throw new Error(
      `safeCanvas: grid total weight (${totalX}×${totalY}) exceeds max dimensions (${maxWidth}×${maxHeight})`,
    );
  }

  const width = mx * totalX;
  const height = my * totalY;

  return {
    width,
    height,
    totalX,
    totalY,
    ppwX: mx,
    ppwY: my,
    gridResult,
  };
}
