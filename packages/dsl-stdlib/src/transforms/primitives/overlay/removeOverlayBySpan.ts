import { validateInputOrThrow, assertValidSpan, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { findMatchingClose } from "../../_internal/lexUtils";

/**
 * Remove the overlay block immediately following a node identified by its
 * exact source span.
 *
 * Spans typically come from `EditorFrame.meta.span`. If the node does not
 * have an overlay (i.e. `{` does not immediately follow `span.end`), the
 * transform is a no-op and returns the canonical string unchanged.
 *
 * This is the inverse of `addOverlayBySpan`.
 *
 * @param m0    The m0 string
 * @param span  Exact source span (UTF-16 offsets in the canonical string)
 * @param opts  Optional output format preference
 * @returns     The modified string, or the original canonical string if the
 *              node has no overlay
 *
 * @example
 * removeOverlayBySpan("2(1{F},1)", { start: 2, end: 3 })
 * // => "2(1,1)"
 */
export function removeOverlayBySpan(
  m0: string,
  span: { start: number; end: number },
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("removeOverlayBySpan", m0);

  assertValidSpan("removeOverlayBySpan", canonical, span);

  // No-op if the node does not have an overlay
  if (canonical[span.end] !== "{") {
    return finalizeM0Output("removeOverlayBySpan", canonical, opts);
  }

  const overlayStart = span.end;
  const inner = canonical.substring(overlayStart + 1);
  const relativeEnd = findMatchingClose(inner, "{");
  const overlayEndExclusive = overlayStart + 1 + relativeEnd + 1;

  const result =
    canonical.substring(0, overlayStart) +
    canonical.substring(overlayEndExclusive);

  return finalizeM0Output("removeOverlayBySpan", result, opts);
}
