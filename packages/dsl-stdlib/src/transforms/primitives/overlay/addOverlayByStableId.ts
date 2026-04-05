import { type OpOutputOptions } from "../../_internal/output";
import { resolveSpanByStableId } from "../../_internal/resolveSpanByStableId";
import { addOverlayBySpan } from "./addOverlayBySpan";

/**
 * Add an overlay to a node identified by its StableKey.
 *
 * Resolves the target node via stableKey -> span, then delegates mutation
 * to `addOverlayBySpan`. If the node already has an overlay, the operation
 * is a no-op (handled by `addOverlayBySpan`).
 *
 * @param m0         The m0 string
 * @param stableKey  The stable identity key of the target node
 * @param opts       Optional output format preference
 *
 * @example
 * addOverlayByStableId(layout, "r/gcolc0/fc1")
 */
export function addOverlayByStableId(
  m0: string,
  stableKey: string,
  opts?: OpOutputOptions,
): string {
  const { canonical, span } = resolveSpanByStableId("addOverlayByStableId", m0, stableKey);
  return addOverlayBySpan(canonical, span, opts);
}
