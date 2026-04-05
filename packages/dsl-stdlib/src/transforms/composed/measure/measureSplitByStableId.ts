import type { M0Axis } from "@m0saic/dsl";
import { type OpOutputOptions } from "../../_internal/output";
import { resolveSpanByStableId } from "../../_internal/resolveSpanByStableId";
import { measureSplitBySpan } from "./measureSplitBySpan";
import { type MeasureRange } from "./_internal/buildMeasureFragment";

/**
 * Replace a rendered frame identified by its StableKey with a measure-mode
 * split.
 *
 * Resolves the target node via stableKey -> span, then delegates to
 * `measureSplitBySpan`. The resolved node must be a rendered frame
 * primitive (`1` / `F`); this constraint is enforced by the span transform.
 *
 * @param m0         The m0 string
 * @param stableKey  The stable identity key of the target node
 * @param axis       `"col"` for horizontal, `"row"` for vertical
 * @param N          Number of measure slots (>= 2)
 * @param ranges     Array of `{a, b}` inclusive 0-indexed ranges to keep
 * @param opts       Optional output format preference
 *
 * @example
 * measureSplitByStableId(layout, "r/gcolc0/fc1", "col", 6, [{ a: 0, b: 2 }])
 */
export function measureSplitByStableId(
  m0: string,
  stableKey: string,
  axis: M0Axis,
  N: number,
  ranges: MeasureRange[],
  opts?: OpOutputOptions,
): string {
  const { canonical, span } = resolveSpanByStableId("measureSplitByStableId", m0, stableKey);
  return measureSplitBySpan(canonical, span, axis, N, ranges, opts);
}
