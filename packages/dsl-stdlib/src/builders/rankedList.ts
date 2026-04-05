/**
 * Ranked List / Leaderboard builder.
 *
 * Asymmetrically weighted vertical (or horizontal) stack where the
 * top tile is largest and each subsequent tile is progressively smaller.
 */

import type { M0String } from "@m0saic/dsl";
import { weightedSplit } from "./weightedSplit";

// ── Types ─────────────────────────────────────────────────

/** Weight decay curve. */
export type RankedListDecay = "linear" | "gentle" | "steep";

/** Options for {@link rankedList}. */
export type RankedListOptions = {
  /** Number of ranked items (2–10). Default: 3. */
  count?: number;
  /** How fast tiles shrink. Default: "linear". */
  decay?: RankedListDecay;
  /** Stack direction. Default: "vertical". */
  direction?: "vertical" | "horizontal";
  /** Gutter ratio (0–0.2). Default: 0. */
  gutter?: number;
};

/** Result from {@link rankedList}. */
export type RankedListResult = {
  m0: M0String;
  tileCount: number;
  weights: number[];
};

// ── Helpers ───────────────────────────────────────────────

function computeWeights(count: number, decay: RankedListDecay): number[] {
  const raw: number[] = [];

  for (let i = 0; i < count; i++) {
    switch (decay) {
      case "steep":
        // Exponential-ish: each rank is half the previous
        raw.push(Math.max(1, Math.round(100 * Math.pow(0.6, i))));
        break;
      case "gentle":
        // Slow linear decay
        raw.push(Math.max(1, 100 - Math.round(i * (60 / count))));
        break;
      case "linear":
      default:
        // Linear from count down to 1
        raw.push(count - i);
        break;
    }
  }

  return raw;
}

// ── Main ──────────────────────────────────────────────────

/**
 * Build a ranked list where each tile is progressively smaller.
 *
 * @example
 * rankedList({ count: 3, decay: "steep" })
 * // → Podium: #1 ≈ 50%, #2 ≈ 30%, #3 ≈ 20%
 */
export function rankedList(opts: RankedListOptions = {}): RankedListResult {
  const {
    count = 3,
    decay = "linear",
    direction = "vertical",
    gutter: _gutter = 0,
  } = opts;

  if (!Number.isInteger(count) || count < 2 || count > 10)
    throw new Error("rankedList: count must be 2–10");

  const weights = computeWeights(count, decay);
  const axis = direction === "vertical" ? "row" : "col";

  // weightedSplit handles GCD reduction in optimized mode
  const m0 = weightedSplit(weights, axis);

  return { m0, tileCount: count, weights };
}
