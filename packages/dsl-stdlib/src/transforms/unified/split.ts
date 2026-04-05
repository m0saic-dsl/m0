import type { M0Axis } from "@m0saic/dsl";
import type { TransformTarget } from "../types";
import type { OpOutputOptions } from "../_internal/output";
import type { WeightMode } from "../primitives/split/_internal/buildSplitFragment";
import { splitByLogicalIndex } from "../primitives/split/splitByLogicalIndex";
import { splitBySpan } from "../primitives/split/splitBySpan";
import { splitByStableId } from "../primitives/split/splitByStableId";

export type SplitOptions = OpOutputOptions & {
  axis: M0Axis;
  count: number;
  weights?: number[];
  weightMode?: WeightMode;
};

/**
 * Split a tile into N children along the given axis.
 *
 * @param m0      The m0 string
 * @param target  Which node to split (by logicalIndex, span, or stableKey)
 * @param opts    Split parameters: axis, count, optional weights
 */
export function split(
  m0: string,
  target: TransformTarget,
  opts: SplitOptions,
): string {
  const { axis, count, weights, weightMode, ...outputOpts } = opts;
  switch (target.by) {
    case "logicalIndex": {
      const result = splitByLogicalIndex(m0, target.index, axis, count, weights, { ...outputOpts, weightMode });
      if (result == null) throw new Error(`split: logicalIndex ${target.index} not found`);
      return result;
    }
    case "span":
      return splitBySpan(m0, target.span, axis, count, weights, { ...outputOpts, weightMode });
    case "stableKey":
      return splitByStableId(m0, target.key, axis, count, weights, outputOpts);
  }
}
