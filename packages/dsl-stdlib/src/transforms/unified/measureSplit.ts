import type { M0Axis } from "@m0saic/dsl";
import type { TransformTarget } from "../types";
import type { OpOutputOptions } from "../_internal/output";
import type { MeasureRange } from "../composed/measure/_internal/buildMeasureFragment";
import { measureSplitByLogicalIndex } from "../composed/measure/measureSplitByLogicalIndex";
import { measureSplitBySpan } from "../composed/measure/measureSplitBySpan";
import { measureSplitByStableId } from "../composed/measure/measureSplitByStableId";

export type MeasureSplitOptions = OpOutputOptions & {
  axis: M0Axis;
  count: number;
  ranges: MeasureRange[];
};

/**
 * Replace a tile with a measure-mode split.
 *
 * @param m0      The m0 string
 * @param target  Which node to measure-split (by logicalIndex, span, or stableKey)
 * @param opts    Measure parameters: axis, count (N slots), ranges (kept regions)
 */
export function measureSplit(
  m0: string,
  target: TransformTarget,
  opts: MeasureSplitOptions,
): string {
  const { axis, count, ranges, ...outputOpts } = opts;
  switch (target.by) {
    case "logicalIndex":
      return measureSplitByLogicalIndex(m0, target.index, axis, count, ranges, outputOpts);
    case "span":
      return measureSplitBySpan(m0, target.span, axis, count, ranges, outputOpts);
    case "stableKey":
      return measureSplitByStableId(m0, target.key, axis, count, ranges, outputOpts);
  }
}
