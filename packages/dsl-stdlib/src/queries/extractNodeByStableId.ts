import { resolveSpanByStableId } from "../transforms/_internal/resolveSpanByStableId";
import { findMatchingClose } from "../transforms/_internal/lexUtils";
import { finalizeM0Output, type OpOutputOptions } from "../transforms/_internal/output";

export type ExtractNodeOptions = OpOutputOptions & {
  /**
   * Include the node's immediately attached overlay block (`{...}`) in the
   * extracted fragment. Defaults to `true` — the overlay is part of the
   * node's subtree, so "extract the node" carries it along. Pass `false`
   * to extract the node body alone (mirror of `replaceNodeBySpan`'s
   * body-only span semantics).
   */
  includeOverlay?: boolean;
};

/**
 * Extract the node identified by its StableKey as a standalone m0 string.
 *
 * The counterpart to `replaceNodeByStableId`: where replace writes a new
 * fragment at a node's span, extract reads the fragment back out. By
 * default the extraction is subtree-complete — the node body plus its
 * immediately attached overlay block — so
 * `replaceNodeByStableId(m0, key, extractNodeByStableId(m0, key), { overlay: "drop" })`
 * round-trips to the original string.
 *
 * The extracted fragment is validated as a standalone m0 and throws if it
 * cannot stand on its own (e.g. a bare null or passthrough node — donors
 * and holes are geometry constructs, not extractable subtrees).
 *
 * @param m0        The m0 string
 * @param stableKey The stable identity key of the target node
 * @param opts      Overlay inclusion + output format preference
 *
 * @example
 * extractNodeByStableId("3(1,2[1,1],1)", "r/gcolc0/growc1")
 * // => "2[1,1]"
 *
 * @example
 * extractNodeByStableId("2(1{1},1)", "r/gcolc0/fc0")
 * // => "1{1}"   (overlay included by default)
 */
export function extractNodeByStableId(
  m0: string,
  stableKey: string,
  opts?: ExtractNodeOptions,
): string {
  const { canonical, span } = resolveSpanByStableId(
    "extractNodeByStableId",
    m0,
    stableKey,
  );

  // Spans identify only the node body; widen to the attached overlay
  // block unless the caller opted out.
  let end = span.end;
  if ((opts?.includeOverlay ?? true) && canonical[end] === "{") {
    const inner = canonical.substring(end + 1);
    end = end + 1 + findMatchingClose(inner, "{") + 1;
  }

  const fragment = canonical.substring(span.start, end);
  return finalizeM0Output("extractNodeByStableId", fragment, opts);
}
