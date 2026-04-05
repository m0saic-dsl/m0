import { expandWeightCanonical } from "../transforms/primitives/split/_internal/buildSplitFragment";

/**
 * Convert a numeric weight into the DSL token sequence that expresses it.
 *
 * Produces `(weight - 1)` passthrough ("0") tokens followed by the claimant
 * token. The returned array always has exactly `weight` elements and is
 * intended to be spread into a container slot list consumed by a split.
 *
 * NOTE:
 * This helper returns raw DSL tokens. It does NOT produce a valid standalone
 * m0 expression.
 *
 * Fractional weights are floored; values below 1 are clamped to 1
 * (the claimant is always emitted at minimum).
 *
 * @param weight   - Positive integer weight (number of slots to occupy).
 * @param claimant - The DSL token placed in the final slot position.
 *                   Typical values: `"1"` (media tile), `"-"` (spacer),
 *                   or a nested expression like `"1{1}"`.
 * @returns An array of DSL tokens whose length equals the effective weight.
 *
 * @example
 * weightedTokens(3, "1")    // => ["0", "0", "1"]
 * weightedTokens(1, "-")    // => ["-"]
 * weightedTokens(5, "1{1}") // => ["0", "0", "0", "0", "1{1}"]
 */
export function weightedTokens(weight: number, claimant: string): string[] {
  return expandWeightCanonical(weight, claimant);
}
