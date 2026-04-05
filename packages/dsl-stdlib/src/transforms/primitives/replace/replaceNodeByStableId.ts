import { type OpOutputOptions } from "../../_internal/output";
import { resolveSpanByStableId } from "../../_internal/resolveSpanByStableId";
import { replaceNodeBySpan } from "./replaceNodeBySpan";

/**
 * Replace a node identified by its StableKey with a new m0 fragment.
 *
 * Resolves the target node via stableKey -> span, then delegates mutation
 * to `replaceNodeBySpan`. Overlay ownership semantics (preserve any
 * immediately attached `{...}` block) are handled by the span transform.
 *
 * @param m0          The m0 string
 * @param stableKey   The stable identity key of the target node
 * @param replacement The replacement m0 fragment (canonical or pretty)
 * @param opts        Optional output format preference
 *
 * @example
 * replaceNodeByStableId(layout, "r/gcolc0/fc1", "2(F,F)")
 */
export function replaceNodeByStableId(
  m0: string,
  stableKey: string,
  replacement: string,
  opts?: OpOutputOptions,
): string {
  const { canonical, span } = resolveSpanByStableId("replaceNodeByStableId", m0, stableKey);
  return replaceNodeBySpan(canonical, span, replacement, opts);
}
