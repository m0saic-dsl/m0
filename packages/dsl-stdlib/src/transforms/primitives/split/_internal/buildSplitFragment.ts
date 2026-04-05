import type { M0Axis } from "@m0saic/dsl";

/** Weight encoding mode for split construction. */
export type WeightMode = "optimized" | "literal";

/**
 * Compute the greatest common divisor of two non-negative integers.
 */
export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * Compute the GCD of an array of positive integers.
 * Returns 1 for empty arrays.
 */
export function gcdArray(nums: number[]): number {
  if (nums.length === 0) return 1;
  let result = nums[0];
  for (let i = 1; i < nums.length; i++) {
    result = gcd(result, nums[i]);
    if (result === 1) return 1; // early exit
  }
  return result;
}

/**
 * Expand a numeric weight into canonical token sequences.
 *
 * Returns `(weight - 1)` canonical passthroughs (`"0"`) followed by the
 * claimant token. This is the single encoding path for weight expansion
 * used by both transform fragment builders and the `weightedTokens` builder.
 *
 * Fractional weights are floored; values below 1 are clamped to 1.
 */
export function expandWeightCanonical(weight: number, claimant: string): string[] {
  const w = Math.max(1, Math.floor(weight));
  const slots: string[] = [];
  for (let i = 0; i < w - 1; i++) slots.push("0");
  slots.push(claimant);
  return slots;
}

/**
 * Build a uniform split fragment: `count(F,F,...)` or `count[F,F,...]`.
 */
export function buildUniformSplit(axis: M0Axis, count: number): string {
  const inner = Array(count).fill("F").join(",");
  return axis === "col" ? `${count}(${inner})` : `${count}[${inner}]`;
}

/**
 * Build a weighted split fragment using passthrough-based weight encoding.
 *
 * Each weight `w` produces `w-1` passthroughs followed by one tile:
 *   `0,0,…,0,1`
 *
 * The container size is `sum(weights)`.
 *
 * @param mode - `"optimized"` (default): reduce weights by GCD, fall back to
 *               equal split if all reduced weights are 1.
 *               `"literal"`: use weights exactly as provided (legacy behavior).
 */
export function buildWeightedSplit(
  axis: M0Axis,
  weights: number[],
  mode: WeightMode = "optimized",
): string {
  if (mode === "optimized") {
    const d = gcdArray(weights);
    const reduced = d > 1 ? weights.map((w) => w / d) : weights;

    // If all reduced weights are 1, emit a plain equal split
    if (reduced.every((w) => w === 1)) {
      return buildUniformSplit(axis, reduced.length);
    }

    return buildWeightedSplitLiteral(axis, reduced);
  }

  return buildWeightedSplitLiteral(axis, weights);
}

/**
 * Build a weighted split fragment using exact literal weights (no reduction).
 */
function buildWeightedSplitLiteral(axis: M0Axis, weights: number[]): string {
  const total = weights.reduce((a, b) => a + b, 0);

  const parts: string[] = [];
  for (const w of weights) {
    parts.push(...expandWeightCanonical(w, "F"));
  }

  const inner = parts.join(",");
  return axis === "col" ? `${total}(${inner})` : `${total}[${inner}]`;
}

/**
 * Build either a uniform or weighted split fragment based on whether
 * `weights` is provided and matches `count`.
 */
export function buildSplitFragment(
  axis: M0Axis,
  count: number,
  weights?: number[],
  mode: WeightMode = "optimized",
): string {
  return weights && weights.length === count
    ? buildWeightedSplit(axis, weights, mode)
    : buildUniformSplit(axis, count);
}
