import { validateInputOrThrow, assertValidSpan, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import type { TileTypePrimitive } from "../../../types";

const LEAF_PRIMITIVES = new Set(["1", "F", "0", ">", "-"]);

/**
 * Change the tile type of a leaf node identified by its exact source span.
 *
 * This transform targets **exact source spans** as provided by
 * `EditorFrame.meta.span`. It is intended for editor interactions where the
 * parser has already resolved the span of the target node.
 *
 * Unlike `setFrameTypeByLogicalIndex` (which can only address rendered tiles),
 * this operation can modify **any** leaf primitive: rendered tiles (`1`/`F`),
 * passthroughs (`0`/`>`), and nulls (`-`).
 *
 * @param m0    The m0 string
 * @param span  Exact source span (UTF-16 offsets in the canonical string).
 *              Must identify a single primitive token (end - start === 1).
 * @param next  The replacement primitive: `"F"` (tile), `">"` (passthrough), `"-"` (null)
 * @param opts  Optional output format preference
 *
 * @example
 * setTileTypeBySpan("3(1,>,1)", { start: 3, end: 4 }, "-")
 * // => "3(1,-,1)"
 */
export function setTileTypeBySpan(
  m0: string,
  span: { start: number; end: number },
  next: TileTypePrimitive,
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("setTileTypeBySpan", m0);

  // Span must identify exactly one character
  if (span.end - span.start !== 1) {
    throw new Error(
      `setTileTypeBySpan: span must identify a single primitive token (end - start must be 1, got ${span.end - span.start})`,
    );
  }

  assertValidSpan("setTileTypeBySpan", canonical, span);

  // Character at span must be a leaf primitive
  const target = canonical[span.start];
  if (!LEAF_PRIMITIVES.has(target)) {
    throw new Error(
      `setTileTypeBySpan: character at span.start is '${target}', expected a leaf primitive (1, F, 0, >, -)`,
    );
  }

  // Replace the primitive at the span
  const result =
    canonical.substring(0, span.start) +
    next +
    canonical.substring(span.end);

  return finalizeM0Output("setTileTypeBySpan", result, opts);
}
