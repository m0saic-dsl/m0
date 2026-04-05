import { validateInputOrThrow, assertValidSpan, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { toCanonicalM0String } from "@m0saic/dsl";
import { findMatchingClose } from "../../_internal/lexUtils";

/**
 * Replace the node body at the given span with a new m0 fragment,
 * preserving any immediately attached overlay block (`{...}`).
 *
 * Spans typically come from `EditorFrame.meta.span`. The span identifies
 * only the **node body** (the split/primitive), not the overlay. If the
 * character immediately after `span.end` is `{`, the overlay block is
 * detached, the body is replaced, and the overlay is reattached to the
 * replacement.
 *
 * @param m0          The m0 string
 * @param span        Exact source span (UTF-16 offsets in the canonical string)
 * @param replacement The replacement m0 fragment
 * @param opts        Optional output format preference
 *
 * @example
 * // Leaf without overlay
 * replaceNodeBySpan("3(1,0,1)", { start: 4, end: 5 }, "2(1,1)")
 * // => "3(1,2(1,1),1)"
 *
 * @example
 * // Leaf with overlay — overlay preserved
 * replaceNodeBySpan("1{1}", { start: 0, end: 1 }, "2(1,1)")
 * // => "2(1,1){1}"
 */
export function replaceNodeBySpan(
  m0: string,
  span: { start: number; end: number },
  replacement: string,
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("replaceNodeBySpan", m0);
  const canonReplacement = toCanonicalM0String(replacement);

  assertValidSpan("replaceNodeBySpan", canonical, span);

  // Detect an overlay block immediately after the node body
  let overlayEnd = span.end;
  if (canonical[span.end] === "{") {
    const inner = canonical.substring(span.end + 1);
    const relativeClose = findMatchingClose(inner, "{");
    overlayEnd = span.end + 1 + relativeClose + 1;
  }

  const overlayBlock = canonical.substring(span.end, overlayEnd);

  const result =
    canonical.substring(0, span.start) +
    canonReplacement +
    overlayBlock +
    canonical.substring(overlayEnd);

  return finalizeM0Output("replaceNodeBySpan", result, opts);
}
