import type { TransformTarget } from "../types";
import type { OpOutputOptions } from "../_internal/output";
import { addOverlayByLogicalIndex } from "../primitives/overlay/addOverlayByLogicalIndex";
import { addOverlayBySpan } from "../primitives/overlay/addOverlayBySpan";
import { addOverlayByStableId } from "../primitives/overlay/addOverlayByStableId";

/**
 * Add an overlay `{F}` to a node.
 *
 * No-op if the node already has an overlay.
 *
 * @param m0      The m0 string
 * @param target  Which node to overlay (by logicalIndex, span, or stableKey)
 */
export function addOverlay(
  m0: string,
  target: TransformTarget,
  opts?: OpOutputOptions,
): string {
  switch (target.by) {
    case "logicalIndex": {
      const result = addOverlayByLogicalIndex(m0, target.index, opts);
      if (result == null) throw new Error(`addOverlay: logicalIndex ${target.index} not found`);
      return result;
    }
    case "span":
      return addOverlayBySpan(m0, target.span, opts);
    case "stableKey":
      return addOverlayByStableId(m0, target.key, opts);
  }
}
