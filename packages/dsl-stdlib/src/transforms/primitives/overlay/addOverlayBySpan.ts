import { validateInputOrThrow, assertValidSpan, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";

/**
 * Add an overlay to a leaf node identified by its exact source span.
 *
 * Spans typically come from `EditorFrame.meta.span`. If the node already
 * has an overlay (i.e. `{` immediately follows `span.end`), the transform
 * is a no-op and returns the canonical string unchanged.
 *
 * @param m0    The m0 string
 * @param span  Exact source span (UTF-16 offsets in the canonical string)
 * @param opts  Optional output format preference
 * @returns     The modified string, or the original canonical string if the
 *              node already has an overlay
 *
 * @example
 * addOverlayBySpan("2(1,1)", { start: 2, end: 3 })
 * // => "2(1{1},1)"
 */
export function addOverlayBySpan(
  m0: string,
  span: { start: number; end: number },
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("addOverlayBySpan", m0);

  assertValidSpan("addOverlayBySpan", canonical, span);

  // No-op if the node already has an overlay
  if (canonical[span.end] === "{") {
    return canonical;
  }

  const result =
    canonical.substring(0, span.end) +
    "{F}" +
    canonical.substring(span.end);

  return finalizeM0Output("addOverlayBySpan", result, opts);
}
