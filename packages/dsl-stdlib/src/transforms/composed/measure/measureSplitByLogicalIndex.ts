import type { M0Axis } from "@m0saic/dsl";
import { type OpOutputOptions } from "../../_internal/output";
import { replaceNodeByLogicalIndex } from "../../primitives/replace/replaceNodeByLogicalIndex";
import {
  type MeasureRange,
  validateMeasureRanges,
  normalizeGroups,
  buildMeasureFragment,
} from "./_internal/buildMeasureFragment";

/**
 * Replace the Nth rendered frame (by 0-based logical index) with a
 * measure-mode split.
 *
 * A measure split divides a tile into `N` slots. Each slot is either:
 * - part of a **kept group** (`> ... F`): passthrough run ending in a claimant
 * - part of an **uncovered gap** (`> ... -`): passthrough run ending in a null
 *
 * **Normalization rules:**
 * - Overlapping ranges are merged into a single group.
 * - Adjacent ranges (`[0..2]` + `[3..5]`) remain **distinct** groups,
 *   each producing its own `> ... F` run.
 *
 * Overlay preservation is handled by the underlying `replaceNodeByLogicalIndex`.
 *
 * @param m0           The m0 string
 * @param targetIndex  0-based logical index of the target tile
 * @param axis         `"col"` for horizontal, `"row"` for vertical
 * @param N            Number of measure slots (>= 2)
 * @param ranges       Array of `{a, b}` inclusive 0-indexed ranges to keep
 * @param opts         Optional output format preference
 */
export function measureSplitByLogicalIndex(
  m0: string,
  targetIndex: number,
  axis: M0Axis,
  N: number,
  ranges: MeasureRange[],
  opts?: OpOutputOptions,
): string {
  if (!Number.isFinite(targetIndex) || targetIndex < 0)
    throw new Error("targetIndex must be >= 0");

  validateMeasureRanges(N, ranges);

  const normalized = normalizeGroups(ranges);
  const replacement = buildMeasureFragment(axis, N, normalized);

  const result = replaceNodeByLogicalIndex(m0, targetIndex, replacement, opts);
  if (result === null) {
    throw new Error(
      `measureSplitByLogicalIndex: targetIndex ${targetIndex} not found`,
    );
  }

  return result;
}
