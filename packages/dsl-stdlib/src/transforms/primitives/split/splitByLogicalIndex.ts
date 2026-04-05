import type { M0Axis } from "@m0saic/dsl";
import { validateInputOrThrow, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { walkByLogicalIndex } from "../../_internal/walkByLogicalIndex";
import { buildSplitFragment, type WeightMode } from "./_internal/buildSplitFragment";

/**
 * Split the Nth "1" in traversal order (0-based).
 * axis:
 *  - "col" => count( ... )  (parenthesis)
 *  - "row" => count[ ... ]  (brackets)
 *
 */
export function splitByLogicalIndex(
  m0: string,
  targetIndex: number,
  axis: M0Axis,
  count: number,
  weights?: number[],
  opts?: OpOutputOptions & { weightMode?: WeightMode },
): string {
  if (!Number.isFinite(targetIndex) || targetIndex < 0)
    throw new Error(`targetIndex must be >= 0`);
  if (!Number.isFinite(count) || count < 2)
    throw new Error(`count must be >= 2`);

  const canonical = validateInputOrThrow("splitByLogicalIndex", m0);

  const fragment = buildSplitFragment(axis, count, weights, opts?.weightMode);

  const { result, found } = walkByLogicalIndex(canonical, targetIndex, () => ({
    output: fragment,
    consumedFromRest: 0,
  }));

  if (!found) {
    throw new Error(`splitByLogicalIndex: targetIndex ${targetIndex} not found`);
  }
  return finalizeM0Output("splitByLogicalIndex", result, opts);
}
