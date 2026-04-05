import type { M0String } from "@m0saic/dsl";
import type { ContainerAxis } from "./container";
import { weightedTokens } from "./weightedTokens";
import { container } from "./container";

/** Options for {@link strip}. */
export interface StripOptions {
  /**
   * Weight (in DSL slot units) of each cell.
   * Must be a positive integer.
   *
   * Each cell is expanded to `(cellWeight - 1)` passthroughs followed by
   * one claimant token, exactly like {@link weightedTokens}.
   */
  cellWeight: number;
  /**
   * Weight (in DSL slot units) of each gutter between cells.
   * Must be a non-negative integer. Defaults to `0` (no gutters).
   *
   * Gutters use `"-"` (null) as their claimant — they donate space but
   * produce no rendered geometry.
   */
  gutterWeight?: number;
  /**
   * When `true`, gutters are also placed on the outer edges (before the
   * first cell and after the last cell). Defaults to `false`.
   *
   * Has no effect when `gutterWeight` is 0.
   */
  outerGutters?: boolean;
  /**
   * The DSL token placed in each cell's claimant position.
   * Defaults to `"1"` (media tile). May be any valid DSL expression,
   * e.g. `"1{1}"` or a nested container string.
   *
   * Accepts both raw DSL fragments and branded {@link M0String} values
   * (e.g. the output of another builder like {@link strip} or {@link equalSplit}).
   */
  claimant?: M0String | string;
}

/**
 * Build a strip of `count` uniform cells along the given axis, with
 * optional interleaved gutters.
 *
 * This is the reusable primitive behind the "for-loop + gutter insertion +
 * weighted token expansion + container wrapping" pattern that appears in
 * generators like {@link grid} and magazine-style builders.
 *
 * Gutter behavior:
 * - `gutterWeight === 0` or omitted: no gutters, cells are packed
 * - `gutterWeight > 0, outerGutters false`: gutters between cells only
 *   → `cell, gutter, cell, gutter, cell` (count - 1 gutters)
 * - `gutterWeight > 0, outerGutters true`: gutters on all edges
 *   → `gutter, cell, gutter, cell, gutter` (count + 1 gutters)
 *
 * The result is a validated, branded {@link M0String}.
 *
 * @param count - Number of cells. Must be a positive integer.
 * @param axis  - `"col"` for horizontal split, `"row"` for vertical split.
 * @param opts  - Cell weight, gutter weight, outer gutters, and claimant.
 * @returns A branded `M0String`.
 *
 * @example
 * strip(3, "col", { cellWeight: 1 })
 * // => "3(1,1,1)"
 *
 * @example
 * strip(3, "col", { cellWeight: 1, gutterWeight: 1 })
 * // => "5(1,-,1,-,1)"
 *
 * @example
 * strip(2, "row", { cellWeight: 50, gutterWeight: 5 })
 * // => "105[0,...,0,1,0,...,0,-,0,...,0,1]"
 *
 * @example
 * strip(2, "col", { cellWeight: 1, gutterWeight: 1, outerGutters: true })
 * // => "5(-,1,-,1,-)"  — note: gutter on outer edges too
 *
 * @example
 * strip(2, "row", { cellWeight: 3, claimant: "2(1,1)" })
 * // => "6[0,0,2(1,1),0,0,2(1,1)]"
 */
export function strip(
  count: number,
  axis: ContainerAxis,
  opts: StripOptions,
): M0String {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `strip: count must be a positive integer, got ${count}`,
    );
  }

  const {
    cellWeight,
    gutterWeight = 0,
    outerGutters = false,
    claimant = "1",
  } = opts;

  if (!Number.isInteger(cellWeight) || cellWeight < 1) {
    throw new Error(
      `strip: cellWeight must be a positive integer, got ${cellWeight}`,
    );
  }
  if (!Number.isInteger(gutterWeight) || gutterWeight < 0) {
    throw new Error(
      `strip: gutterWeight must be a non-negative integer, got ${gutterWeight}`,
    );
  }

  const hasGutter = gutterWeight > 0;
  const slots: string[] = [];

  if (!hasGutter) {
    for (let i = 0; i < count; i++) {
      slots.push(...weightedTokens(cellWeight, claimant));
    }
  } else if (outerGutters) {
    slots.push(...weightedTokens(gutterWeight, "-"));
    for (let i = 0; i < count; i++) {
      slots.push(...weightedTokens(cellWeight, claimant));
      slots.push(...weightedTokens(gutterWeight, "-"));
    }
  } else {
    for (let i = 0; i < count; i++) {
      if (i > 0) slots.push(...weightedTokens(gutterWeight, "-"));
      slots.push(...weightedTokens(cellWeight, claimant));
    }
  }

  return container(slots, axis);
}
