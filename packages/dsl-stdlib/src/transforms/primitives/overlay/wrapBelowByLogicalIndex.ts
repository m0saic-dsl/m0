import { validateInputOrThrow, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { walkByLogicalIndex } from "../../_internal/walkByLogicalIndex";

/**
 * Wrap the Nth rendered frame in logical traversal order as `F{<frame>}` —
 * a new base leaf takes the target's structural position and the target
 * moves into the new wrap's overlay, so the new leaf paints BELOW it.
 *
 * The symmetric pair to {@link addOverlayByLogicalIndex} (which adds a
 * leaf painting ABOVE the target). Unlike that transform, a target that
 * already carries an overlay is NOT a no-op: the whole leaf+overlay span
 * moves inside the wrap (`F{X}` → `F{F{X}}`), keeping the target's own
 * overlay painting above it with the new base underneath both.
 *
 * Logical indexing matches every other `*ByLogicalIndex` transform: only
 * rendered frames (`1` / `F`) are counted, in parse order, INCLUDING
 * frames inside overlay `{...}` bodies. Passthrough (`0` / `>`) and null
 * (`-`) primitives are ignored. The new base leaf parses at the target's
 * old logical index; the target (and every later frame) shifts +1.
 *
 * StableKey contract: destructive for the wrapped leaf — the new outer
 * leaf takes the target's structural position (and stableKey); the
 * target re-keys into the wrap's overlay namespace. Sibling leaves are
 * unaffected.
 *
 * @param m0                    The m0 string
 * @param targetLogicalIndex    0-based logical index (counting only `1` / `F` tiles)
 * @param opts                  Optional output format preference
 * @returns                     The modified string, or null if the logical index
 *                              does not exist or is invalid
 *
 * @example
 * wrapBelowByLogicalIndex("2(1,1)", 1)
 * // => "2(1,1{1})"   (new base leaf at index 1; original moved into its overlay)
 *
 * @example
 * wrapBelowByLogicalIndex("2(1{1},1)", 0)
 * // => "2(1{1{1}},1)"   (leaf + its overlay both move inside the wrap)
 */
export function wrapBelowByLogicalIndex(
  m0: string,
  targetLogicalIndex: number,
  opts?: OpOutputOptions,
): string | null {
  if (!Number.isFinite(targetLogicalIndex) || targetLogicalIndex < 0) return null;

  const canonical = validateInputOrThrow("wrapBelowByLogicalIndex", m0);

  const { result, found } = walkByLogicalIndex(canonical, targetLogicalIndex, (ctx) => ({
    // Consume the target's attached overlay (if any) into the wrapped
    // span — emitting it after the wrap would produce the illegal
    // overlay chain `F{F}{X}`.
    output: "F{F" + ctx.overlay + "}",
    consumedFromRest: ctx.overlayLength,
  }));

  if (!found) return null;

  return finalizeM0Output("wrapBelowByLogicalIndex", result, opts);
}
