/**
 * Pack dark QR matrix cells into the smallest set of axis-aligned rectangles.
 *
 * Engine-perf optimization: each emitted rect becomes one ffmpeg intermediate
 * instead of one per dark cell. For a typical QR most savings come from
 * function patterns (finders, alignment) and short runs in the data area
 * (the chosen mask biases toward local clustering).
 *
 * Two strategies:
 *   - "rowwise" (default): each maximal horizontal run of dark non-suppressed
 *     cells becomes one rect. O(N²). Simple, predictable, good-enough for
 *     typical QR inputs. ~3–10× frame-count reduction vs. one frame per cell.
 *   - "rect-greedy": (not yet implemented) iteratively finds the largest
 *     axis-aligned dark rect among uncovered cells. NP-hard optimum; greedy
 *     approximation. Add when rowwise savings are insufficient.
 *
 * Honors a suppression mask so callers that already opted into structural
 * channels (eyes, alignment, etc.) don't double-cover those cells.
 */

import type { PlaceRectsRect } from "../../builders/placeRects";

export type PackDarkCellsStrategy = "rowwise";

export type PackDarkCellsOptions = {
  /** Default "rowwise". */
  strategy?: PackDarkCellsStrategy;
};

/**
 * @param modules  N×N boolean matrix — true = dark module. Includes quiet zone.
 * @param suppress Same shape. true = cell is claimed by an enabled overlay
 *                 channel and should NOT be packed (the channel will render it).
 * @param N        Side length (must equal modules.length).
 */
export function packDarkCells(
  modules: boolean[][],
  suppress: boolean[][],
  N: number,
  opts: PackDarkCellsOptions = {},
): PlaceRectsRect[] {
  const strategy = opts.strategy ?? "rowwise";
  if (strategy !== "rowwise") {
    throw new Error(
      `packDarkCells: strategy "${strategy}" not implemented. Available: "rowwise".`,
    );
  }
  return packRowwise(modules, suppress, N);
}

function packRowwise(
  modules: boolean[][],
  suppress: boolean[][],
  N: number,
): PlaceRectsRect[] {
  const rects: PlaceRectsRect[] = [];
  for (let r = 0; r < N; r++) {
    let runStart = -1;
    for (let c = 0; c < N; c++) {
      const isPackable = modules[r][c] && !suppress[r][c];
      if (isPackable) {
        if (runStart === -1) runStart = c;
      } else if (runStart !== -1) {
        rects.push({ x: runStart, y: r, w: c - runStart, h: 1 });
        runStart = -1;
      }
    }
    if (runStart !== -1) {
      rects.push({ x: runStart, y: r, w: N - runStart, h: 1 });
    }
  }
  return rects;
}
