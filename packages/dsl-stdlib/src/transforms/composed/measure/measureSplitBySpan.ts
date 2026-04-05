import type { M0Axis } from "@m0saic/dsl";
import { validateInputOrThrow, assertValidSpan, assertRenderedFrameSpan, type OpOutputOptions } from "../../_internal/output";
import { replaceNodeBySpan } from "../../primitives/replace/replaceNodeBySpan";
import {
  type MeasureRange,
  validateMeasureRanges,
  normalizeGroups,
  buildMeasureFragment,
} from "./_internal/buildMeasureFragment";

/**
 * Replace a rendered frame identified by its exact source span with a
 * measure-mode split.
 *
 * The span must identify a single rendered frame primitive (`1` / `F`).
 * Overlay preservation is handled by the underlying `replaceNodeBySpan`.
 *
 * @param m0      The m0 string
 * @param span    Exact source span (UTF-16 offsets in the canonical string)
 * @param axis    `"col"` for horizontal, `"row"` for vertical
 * @param N       Number of measure slots (>= 2)
 * @param ranges  Array of `{a, b}` inclusive 0-indexed ranges to keep
 * @param opts    Optional output format preference
 *
 * @example
 * measureSplitBySpan("2(1,1)", { start: 2, end: 3 }, "col", 4, [{ a: 1, b: 2 }])
 */
export function measureSplitBySpan(
  m0: string,
  span: { start: number; end: number },
  axis: M0Axis,
  N: number,
  ranges: MeasureRange[],
  opts?: OpOutputOptions,
): string {
  validateMeasureRanges(N, ranges);

  const canonical = validateInputOrThrow("measureSplitBySpan", m0);

  assertValidSpan("measureSplitBySpan", canonical, span);
  assertRenderedFrameSpan("measureSplitBySpan", canonical, span);

  const normalized = normalizeGroups(ranges);
  const replacement = buildMeasureFragment(axis, N, normalized);

  return replaceNodeBySpan(canonical, span, replacement, opts);
}
