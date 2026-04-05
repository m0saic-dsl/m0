import type { M0Axis } from "@m0saic/dsl";
import { validateInputOrThrow, assertValidSpan, assertRenderedFrameSpan, type OpOutputOptions } from "../../_internal/output";
import { replaceNodeBySpan } from "../replace/replaceNodeBySpan";
import { buildSplitFragment, type WeightMode } from "./_internal/buildSplitFragment";

/**
 * Split a rendered frame identified by its exact source span into a
 * multi-child container along the given axis.
 *
 * Only rendered frame primitives (`1` / `F`) may be split. The span must
 * identify exactly one such primitive character. Attached overlays are
 * preserved via `replaceNodeBySpan`.
 *
 * @param m0       The m0 string
 * @param span     Exact source span (UTF-16 offsets in the canonical string).
 *                 Must identify a single rendered frame primitive.
 * @param axis     `"col"` for horizontal `count(...)`, `"row"` for vertical `count[...]`
 * @param count    Number of children in the new split (must be >= 2)
 * @param weights  Optional per-child weights (length must equal `count`)
 * @param opts     Optional output format preference
 *
 * @example
 * splitBySpan("3(1,0,1)", { start: 2, end: 3 }, "col", 2)
 * // => "3(2(1,1),0,1)"
 */
export function splitBySpan(
  m0: string,
  span: { start: number; end: number },
  axis: M0Axis,
  count: number,
  weights?: number[],
  opts?: OpOutputOptions & { weightMode?: WeightMode },
): string {
  const canonical = validateInputOrThrow("splitBySpan", m0);

  assertValidSpan("splitBySpan", canonical, span);

  if (!Number.isFinite(count) || count < 2) {
    throw new Error(`splitBySpan: count must be >= 2`);
  }

  assertRenderedFrameSpan("splitBySpan", canonical, span);

  const replacement = buildSplitFragment(axis, count, weights, opts?.weightMode);

  return replaceNodeBySpan(canonical, span, replacement, opts);
}
