import { type OpOutputOptions } from "../../_internal/output";
import { resolveSpanByStableId } from "../../_internal/resolveSpanByStableId";
import { removeOverlayBySpan } from "./removeOverlayBySpan";

/**
 * Remove the overlay from a node identified by its StableKey.
 *
 * Resolves the target node via stableKey -> span, then delegates mutation
 * to `removeOverlayBySpan`. If the node does not currently own an overlay,
 * the operation is a no-op (handled by `removeOverlayBySpan`).
 *
 * @param m0         The m0 string
 * @param stableKey  The stable identity key of the target node
 * @param opts       Optional output format preference
 *
 * @example
 * removeOverlayByStableId(layout, "r/gcolc0/fc1")
 */
export function removeOverlayByStableId(
  m0: string,
  stableKey: string,
  opts?: OpOutputOptions,
): string {
  const { canonical, span } = resolveSpanByStableId("removeOverlayByStableId", m0, stableKey);
  return removeOverlayBySpan(canonical, span, opts);
}
