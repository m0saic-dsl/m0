import { type OpOutputOptions } from "../../_internal/output";
import { resolveSpanByStableId } from "../../_internal/resolveSpanByStableId";
import type { M0Axis } from "@m0saic/dsl";
import { splitBySpan } from "./splitBySpan";

/**
 * Split a rendered frame identified by its StableKey into a multi-child
 * container along the given axis.
 *
 * Resolves the target node via stableKey -> span, then delegates mutation
 * to `splitBySpan`. The resolved node must be a rendered frame primitive
 * (`1` / `F`); this constraint is enforced by `splitBySpan`.
 *
 * @param m0         The m0 string
 * @param stableKey  The stable identity key of the target node
 * @param axis       `"col"` for horizontal `count(...)`, `"row"` for vertical `count[...]`
 * @param count      Number of children in the new split (must be >= 2)
 * @param weights    Optional per-child weights (length must equal `count`)
 * @param opts       Optional output format preference
 *
 * @example
 * splitByStableId(layout, "r/gcolc0/fc1", "col", 3)
 */
export function splitByStableId(
  m0: string,
  stableKey: string,
  axis: M0Axis,
  count: number,
  weights?: number[],
  opts?: OpOutputOptions,
): string {
  const { canonical, span } = resolveSpanByStableId("splitByStableId", m0, stableKey);
  return splitBySpan(canonical, span, axis, count, weights, opts);
}
