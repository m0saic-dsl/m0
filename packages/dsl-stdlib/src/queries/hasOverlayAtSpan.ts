import { validateInputOrThrow, assertValidSpan } from "../transforms/_internal/output";

/**
 * Check whether the node at a given span owns an overlay block.
 *
 * A node owns an overlay if `{` immediately follows `span.end` in the
 * canonical form. This is the same ownership rule used by `addOverlayBySpan`,
 * `removeOverlayBySpan`, and `replaceNodeBySpan`.
 *
 * The input is canonicalized and validated before checking. The span is
 * bounds-checked against the canonical string.
 *
 * @param m0    The m0 string
 * @param span  Exact source span (UTF-16 offsets in the canonical string)
 * @returns     `true` if the node at the span owns an overlay, `false` otherwise
 *
 * @example
 * hasOverlayAtSpan("1{1}", { start: 0, end: 1 })      // => true
 * hasOverlayAtSpan("2(1,1)", { start: 2, end: 3 })     // => false
 * hasOverlayAtSpan("2(1{1},1)", { start: 2, end: 3 })  // => true
 */
export function hasOverlayAtSpan(
  m0: string,
  span: { start: number; end: number },
): boolean {
  const canonical = validateInputOrThrow("hasOverlayAtSpan", m0);

  assertValidSpan("hasOverlayAtSpan", canonical, span);

  return span.end < canonical.length && canonical[span.end] === "{";
}
