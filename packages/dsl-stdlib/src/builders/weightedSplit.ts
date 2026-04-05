import type { M0String } from "@m0saic/dsl";
import type { ContainerAxis } from "./container";
import type { WeightMode } from "../transforms/primitives/split/_internal/buildSplitFragment";
import { gcdArray } from "../transforms/primitives/split/_internal/buildSplitFragment";
import { weightedTokens } from "./weightedTokens";
import { container } from "./container";

/** Options for {@link weightedSplit}. */
export interface WeightedSplitOptions {
  /**
   * Shared claimant token for every child slot.
   * Defaults to `"1"` (media tile). May be any valid DSL expression.
   * Mutually exclusive with {@link claimants}.
   */
  claimant?: string;
  /**
   * Per-child claimant overrides for heterogeneous splits.
   * Length must equal `weights.length`.
   * Mutually exclusive with {@link claimant}.
   */
  claimants?: string[];
  /**
   * Total slot budget. When provided, the input weights are scaled to
   * sum to exactly this value using the largest-remainder method
   * (Hamilton's method), preserving proportions deterministically.
   *
   * Must be ≥ `weights.length` (every child needs at least 1 slot).
   */
  precision?: number;
  /**
   * Weight encoding mode.
   * - `"optimized"` (default): reduce weights by GCD, fall back to equal
   *   split when all reduced weights are 1.
   * - `"literal"`: use weights exactly as provided (legacy behavior).
   */
  mode?: WeightMode;
}

/**
 * Build a proportional split from an array of integer child weights.
 *
 * Each weight determines how many slots the corresponding child occupies
 * in the resulting DSL expression. Internally, each child is encoded as
 * `(weight - 1)` passthrough (`"0"`) tokens followed by a claimant token,
 * then the full slot list is wrapped in a counted container.
 *
 * The result is a validated, branded {@link M0String}.
 *
 * @param weights - Positive integer weights (one per child). Must be non-empty;
 *                  each value must be a positive integer (before precision scaling).
 * @param axis    - `"col"` for parentheses (horizontal), `"row"` for brackets (vertical).
 * @param opts    - Optional configuration: `claimant`, `claimants`, `precision`.
 * @returns A branded `M0String` whose total slot count equals
 *          `precision` (if given) or `sum(weights)`.
 *
 * @example
 * weightedSplit([1, 1, 1], "row")                        // => "3[1,1,1]"
 * weightedSplit([35, 65], "col")                          // => "100(0,...,0,1,0,...,0,1)"
 * weightedSplit([1], "col")                               // => "1"
 * weightedSplit([1, 3], "row", { claimant: "1{1}" })      // => "4[1{1},0,0,1{1}]"
 * weightedSplit([1, 2], "col", { precision: 100 })        // => scaled to 100 total slots
 */
export function weightedSplit(
  weights: number[],
  axis: ContainerAxis,
  opts?: WeightedSplitOptions,
): M0String {
  if (weights.length === 0) {
    throw new Error("weightedSplit: weights must be non-empty");
  }

  const { claimant, claimants, precision, mode = "optimized" } = opts ?? {};

  // Validate mutual exclusivity
  if (claimant !== undefined && claimants !== undefined) {
    throw new Error(
      "weightedSplit: claimant and claimants are mutually exclusive",
    );
  }

  // Validate claimants length
  if (claimants !== undefined && claimants.length !== weights.length) {
    throw new Error(
      `weightedSplit: claimants.length (${claimants.length}) must equal weights.length (${weights.length})`,
    );
  }

  // Validate raw weights
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (!Number.isInteger(w) || w < 1) {
      throw new Error(
        `weightedSplit: weight[${i}] must be a positive integer, got ${w}`,
      );
    }
  }

  // Compute effective weights (apply precision scaling if requested)
  let effective: number[];
  if (precision !== undefined) {
    if (!Number.isInteger(precision) || precision < 1) {
      throw new Error(
        `weightedSplit: precision must be a positive integer, got ${precision}`,
      );
    }
    if (precision < weights.length) {
      throw new Error(
        `weightedSplit: precision (${precision}) must be >= weights.length (${weights.length})`,
      );
    }
    effective = scaleWeights(weights, precision);
  } else {
    effective = weights;
  }

  // GCD reduction in optimized mode (only when no custom claimants —
  // per-child claimants depend on positional alignment with weights)
  if (mode === "optimized" && !claimants) {
    const d = gcdArray(effective);
    if (d > 1) effective = effective.map((w) => w / d);
  }

  // Build slot array
  const defaultClaimant = claimant ?? "1";
  const slots: string[] = [];
  for (let i = 0; i < effective.length; i++) {
    const c = claimants ? claimants[i] : defaultClaimant;
    slots.push(...weightedTokens(effective[i], c));
  }

  return container(slots, axis);
}

/**
 * Scale weights to a target sum using the largest-remainder method
 * (Hamilton's method). Guarantees:
 * - Every child gets at least 1 slot
 * - Total sum === targetSum exactly
 * - Proportions are preserved as closely as possible
 * - Deterministic (stable sort by remainder descending, index ascending)
 */
function scaleWeights(weights: number[], targetSum: number): number[] {
  const inputSum = weights.reduce((a, b) => a + b, 0);

  // Compute ideal (floating) allocations
  const ideal = weights.map((w) => (w / inputSum) * targetSum);

  // Floor each, clamp to minimum 1
  const floored = ideal.map((v) => Math.max(1, Math.floor(v)));
  const flooredSum = floored.reduce((a, b) => a + b, 0);
  let remainder = targetSum - flooredSum;

  if (remainder > 0) {
    // Distribute remaining slots by largest fractional remainder
    const remainders = ideal.map((v, i) => ({
      index: i,
      frac: v - floored[i],
    }));
    // Sort descending by fractional part, then by index for stability
    remainders.sort((a, b) => b.frac - a.frac || a.index - b.index);
    for (let j = 0; j < remainder; j++) {
      floored[remainders[j].index]++;
    }
  } else if (remainder < 0) {
    // Rare edge case: clamping to 1 overshot the target.
    // Remove from largest allocations first (those > 1).
    const sorted = floored
      .map((v, i) => ({ index: i, val: v }))
      .filter((x) => x.val > 1)
      .sort((a, b) => b.val - a.val || a.index - b.index);
    for (let j = 0; remainder < 0 && j < sorted.length; j++) {
      const reduce = Math.min(sorted[j].val - 1, -remainder);
      floored[sorted[j].index] -= reduce;
      remainder += reduce;
    }
  }

  return floored;
}
