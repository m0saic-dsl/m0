/**
 * Snap Grid builder.
 *
 * Two flows for fitting a guttered grid into a canvas with zero pixel
 * distortion (quantization-free):
 *
 * - `snapGridFit`     — given a target grid (rows, cols, gutter), find the
 *                        largest distortion-free inner rect that fits inside
 *                        the canvas, and emit `placeRect{grid}` DSL.
 *
 * - `snapGridEnumerate` — given canvas dims and a (rows, cols) search range,
 *                          enumerate all grid configurations that produce a
 *                          quantization-free inner rect, ranked by `fitScore`
 *                          (`coverage × cellCount`).
 *
 * - `snapGridFind`    — convenience wrapper: runs `snapGridEnumerate` then
 *                        builds the top candidate via `snapGridFit`.
 *
 * Built on top of {@link safeCanvas} (for the math), {@link grid} (for the
 * inner DSL), {@link placeRect} (for the wrapper), and `replace` from the
 * transforms layer (for the composition).
 */

import type { M0String } from "@m0saic/dsl";
import { grid as stdlibGrid } from "./grid";
import { placeRect as stdlibPlaceRect } from "./placeRect";
import { safeCanvas as stdlibSafeCanvas } from "./safeCanvas";
import { replace } from "../transforms/unified/replace";

// ── Types ─────────────────────────────────────────────────

export type SnapGridAlignH = "left" | "center" | "right";
export type SnapGridAlignV = "top" | "center" | "bottom";

/** Options for {@link snapGridFit}. */
export type SnapGridFitOptions = {
  /** Outer canvas width in pixels. Positive integer. */
  rootW: number;
  /** Outer canvas height in pixels. Positive integer. */
  rootH: number;
  /** Target grid row count. */
  rows: number;
  /** Target grid column count. */
  cols: number;
  /** Gutter ratio (0..0.2). Default: 0. */
  gutter?: number;
  /** Include outer gutters. Default: false. */
  outerGutters?: boolean;
  /** Horizontal alignment of the inner rect inside the canvas. Default: "center". */
  hAlign?: SnapGridAlignH;
  /** Vertical alignment of the inner rect inside the canvas. Default: "center". */
  vAlign?: SnapGridAlignV;
};

/** Result from {@link snapGridFit}. */
export type SnapGridResult = {
  /** Composed canonical DSL: outer placeRect + inner grid (or just the grid if exact-fit). */
  m0: M0String;
  /** Final inner rect width in pixels (always quantization-free). */
  rectW: number;
  /** Final inner rect height in pixels (always quantization-free). */
  rectH: number;
  /** Per-cell pixel width inside the inner rect. */
  cellW: number;
  /** Per-cell pixel height inside the inner rect. */
  cellH: number;
  /** Per-gutter pixel width on the X axis (0 when gutter == 0). */
  gutterPxX: number;
  /** Per-gutter pixel height on the Y axis (0 when gutter == 0). */
  gutterPxY: number;
  /** Total tiles (rows × cols). */
  tileCount: number;
  /** Pixel coverage of the inner rect over the outer canvas (0..1). */
  coverage: number;
};

/** Options for {@link snapGridEnumerate} / {@link snapGridFind}. */
export type SnapGridFindOptions = {
  /** Outer canvas width in pixels. Positive integer. */
  rootW: number;
  /** Outer canvas height in pixels. Positive integer. */
  rootH: number;
  /** Minimum row count to try. Default: 1. */
  minRows?: number;
  /** Maximum row count to try. Default: 8. */
  maxRows?: number;
  /** Minimum column count to try. Default: 1. */
  minCols?: number;
  /** Maximum column count to try. Default: 8. */
  maxCols?: number;
  /** Gutter ratio (0..0.2). Default: 0. */
  gutter?: number;
  /** Include outer gutters. Default: false. */
  outerGutters?: boolean;
  /** Horizontal alignment of the inner rect. Default: "center". */
  hAlign?: SnapGridAlignH;
  /** Vertical alignment of the inner rect. Default: "center". */
  vAlign?: SnapGridAlignV;
};

/** A single candidate row from {@link snapGridEnumerate}. */
export type SnapGridCandidate = {
  rows: number;
  cols: number;
  rectW: number;
  rectH: number;
  cellW: number;
  cellH: number;
  gutterPxX: number;
  gutterPxY: number;
  /** rows × cols. */
  tileCount: number;
  /** Inner-rect / outer-canvas pixel coverage (0..1). */
  coverage: number;
  /** Combined ranking metric: `coverage × tileCount`. Higher = better. */
  fitScore: number;
};

// ── snapGridFit ───────────────────────────────────────────

/**
 * Snap a grid to the largest quantization-free inner rect inside the canvas
 * and emit the composed `placeRect{grid}` DSL.
 *
 * If the grid happens to fit exactly (`safeWidth === rootW` AND
 * `safeHeight === rootH`), the wrapper is omitted and the bare grid DSL is
 * returned — there's nothing to place.
 *
 * @example
 * snapGridFit({ rootW: 1920, rootH: 1080, rows: 6, cols: 8, gutter: 0.1 })
 * // grid totals: 435 × 325
 * // safe inner rect: 1740 × 975 (centered in 1920×1080)
 * // m0 ≈ outer placeRect with the 8×6 grid nested in its frame
 */
export function snapGridFit(opts: SnapGridFitOptions): SnapGridResult {
  const {
    rootW,
    rootH,
    rows,
    cols,
    gutter = 0,
    outerGutters = false,
    hAlign = "center",
    vAlign = "center",
  } = opts;

  const safe = stdlibSafeCanvas({
    rows,
    cols,
    gutter: gutter > 0 ? gutter : undefined,
    outerGutters,
    maxWidth: rootW,
    maxHeight: rootH,
  });

  const innerGrid = stdlibGrid({
    rows,
    cols,
    gutter: gutter > 0 ? gutter : undefined,
    outerGutters,
  });

  const cellW = innerGrid.cellW * safe.ppwX;
  const cellH = innerGrid.cellH * safe.ppwY;
  const gutterPxX = innerGrid.gutterW * safe.ppwX;
  const gutterPxY = innerGrid.gutterW * safe.ppwY;

  let m0: M0String;
  if (safe.width === rootW && safe.height === rootH) {
    // Inner rect already fills the canvas — no placeRect wrapper needed.
    m0 = innerGrid.m0;
  } else {
    const placed = stdlibPlaceRect({
      rootW,
      rootH,
      rectW: safe.width,
      rectH: safe.height,
      hAlign,
      vAlign,
    });
    // placeRect always emits exactly one rendered frame; replace it with the grid.
    m0 = replace(placed.m0, { by: "logicalIndex", index: 0 }, innerGrid.m0) as M0String;
  }

  const coverage = (safe.width * safe.height) / (rootW * rootH);

  return {
    m0,
    rectW: safe.width,
    rectH: safe.height,
    cellW,
    cellH,
    gutterPxX,
    gutterPxY,
    tileCount: rows * cols,
    coverage,
  };
}

// ── snapGridEnumerate / snapGridFind ──────────────────────

/**
 * Enumerate every (rows, cols) combination in the search range that fits
 * inside the canvas with zero pixel distortion. Candidates are returned
 * sorted by `fitScore` descending (best first).
 *
 * `fitScore = coverage × tileCount` — biases toward "tight to the canvas
 * AND lots of cells". Pure coverage would favor degenerate 1×1 picks; pure
 * cell count would favor cramped layouts that waste canvas area. The product
 * keeps both pressures honest.
 */
export function snapGridEnumerate(opts: SnapGridFindOptions): SnapGridCandidate[] {
  const {
    rootW,
    rootH,
    minRows = 1,
    maxRows = 8,
    minCols = 1,
    maxCols = 8,
    gutter = 0,
    outerGutters = false,
  } = opts;

  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error(`snapGridEnumerate: rootW must be a positive integer, got ${rootW}`);
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error(`snapGridEnumerate: rootH must be a positive integer, got ${rootH}`);
  if (minRows < 1 || maxRows < minRows)
    throw new Error(`snapGridEnumerate: invalid row range [${minRows}, ${maxRows}]`);
  if (minCols < 1 || maxCols < minCols)
    throw new Error(`snapGridEnumerate: invalid col range [${minCols}, ${maxCols}]`);

  const candidates: SnapGridCandidate[] = [];

  for (let rows = minRows; rows <= maxRows; rows++) {
    for (let cols = minCols; cols <= maxCols; cols++) {
      try {
        const safe = stdlibSafeCanvas({
          rows,
          cols,
          gutter: gutter > 0 ? gutter : undefined,
          outerGutters,
          maxWidth: rootW,
          maxHeight: rootH,
        });
        const inner = stdlibGrid({
          rows,
          cols,
          gutter: gutter > 0 ? gutter : undefined,
          outerGutters,
        });
        const cellW = inner.cellW * safe.ppwX;
        const cellH = inner.cellH * safe.ppwY;
        const gutterPxX = inner.gutterW * safe.ppwX;
        const gutterPxY = inner.gutterW * safe.ppwY;
        const coverage = (safe.width * safe.height) / (rootW * rootH);
        const tileCount = rows * cols;
        candidates.push({
          rows,
          cols,
          rectW: safe.width,
          rectH: safe.height,
          cellW,
          cellH,
          gutterPxX,
          gutterPxY,
          tileCount,
          coverage,
          fitScore: coverage * tileCount,
        });
      } catch {
        // Grid weights exceed canvas dims — skip this (rows, cols).
      }
    }
  }

  return candidates.sort((a, b) => b.fitScore - a.fitScore);
}

/**
 * Convenience: run {@link snapGridEnumerate} and build the top candidate
 * via {@link snapGridFit}. Throws if no candidate fits in the search range.
 */
export function snapGridFind(opts: SnapGridFindOptions): SnapGridResult {
  const candidates = snapGridEnumerate(opts);
  if (candidates.length === 0) {
    throw new Error(
      `snapGridFind: no grid fits inside ${opts.rootW}×${opts.rootH} ` +
        `for rows ∈ [${opts.minRows ?? 1}, ${opts.maxRows ?? 8}], ` +
        `cols ∈ [${opts.minCols ?? 1}, ${opts.maxCols ?? 8}], ` +
        `gutter ${opts.gutter ?? 0}`,
    );
  }
  const best = candidates[0];
  return snapGridFit({
    rootW: opts.rootW,
    rootH: opts.rootH,
    rows: best.rows,
    cols: best.cols,
    gutter: opts.gutter,
    outerGutters: opts.outerGutters,
    hAlign: opts.hAlign,
    vAlign: opts.vAlign,
  });
}
