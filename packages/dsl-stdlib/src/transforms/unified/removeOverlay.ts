import type { TransformTarget } from "../types";
import type { OpOutputOptions } from "../_internal/output";
import { removeOverlayByLogicalIndex } from "../primitives/overlay/removeOverlayByLogicalIndex";
import { removeOverlayBySpan } from "../primitives/overlay/removeOverlayBySpan";
import { removeOverlayByStableId } from "../primitives/overlay/removeOverlayByStableId";

/**
 * Remove the overlay from a node.
 *
 * No-op if the node has no overlay.
 *
 * @param m0      The m0 string
 * @param target  Which node to remove overlay from (by logicalIndex, span, or stableKey)
 */
export function removeOverlay(
  m0: string,
  target: TransformTarget,
  opts?: OpOutputOptions,
): string {
  switch (target.by) {
    case "logicalIndex": {
      const result = removeOverlayByLogicalIndex(m0, target.index, opts);
      if (result == null) throw new Error(`removeOverlay: logicalIndex ${target.index} not found`);
      return result;
    }
    case "span":
      return removeOverlayBySpan(m0, target.span, opts);
    case "stableKey":
      return removeOverlayByStableId(m0, target.key, opts);
  }
}
