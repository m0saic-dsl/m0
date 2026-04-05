import type { TransformTarget } from "../types";
import type { OpOutputOptions } from "../_internal/output";
import { replaceNodeByLogicalIndex } from "../primitives/replace/replaceNodeByLogicalIndex";
import { replaceNodeBySpan } from "../primitives/replace/replaceNodeBySpan";
import { replaceNodeByStableId } from "../primitives/replace/replaceNodeByStableId";

/**
 * Replace a node with a new m0 fragment.
 *
 * @param m0           The m0 string
 * @param target       Which node to replace (by logicalIndex, span, or stableKey)
 * @param replacement  The replacement DSL fragment
 */
export function replace(
  m0: string,
  target: TransformTarget,
  replacement: string,
  opts?: OpOutputOptions,
): string {
  switch (target.by) {
    case "logicalIndex": {
      const result = replaceNodeByLogicalIndex(m0, target.index, replacement, opts);
      if (result == null) throw new Error(`replace: logicalIndex ${target.index} not found`);
      return result;
    }
    case "span":
      return replaceNodeBySpan(m0, target.span, replacement, opts);
    case "stableKey":
      return replaceNodeByStableId(m0, target.key, replacement, opts);
  }
}
