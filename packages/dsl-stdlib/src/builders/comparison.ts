/**
 * Comparison / Before-After builder.
 *
 * Side-by-side or stacked pairs with optional label/divider space.
 */

import type { M0String } from "@m0saic/dsl";
import { weightedSplit } from "./weightedSplit";

// ── Types ─────────────────────────────────────────────────

/** Options for {@link comparison}. */
export type ComparisonOptions = {
  /** Number of comparison pairs (1–4). Default: 1. */
  pairs?: number;
  /** Split direction. Default: "horizontal" (side-by-side). */
  direction?: "horizontal" | "vertical";
  /** Label/divider space as fraction (0–0.15). Default: 0. */
  labelSpace?: number;
  /** Gutter between pairs (0–0.2). Default: 0. */
  gutter?: number;
};

/** Result from {@link comparison}. */
export type ComparisonResult = {
  m0: M0String;
  tileCount: number;
};

// ── Main ──────────────────────────────────────────────────

const CELL = 50;

export function comparison(opts: ComparisonOptions = {}): ComparisonResult {
  const {
    pairs = 1,
    direction = "horizontal",
    labelSpace = 0,
    gutter = 0,
  } = opts;

  if (!Number.isInteger(pairs) || pairs < 1 || pairs > 4)
    throw new Error("comparison: pairs must be 1–4");

  const hasGutter = gutter > 0;
  const gutterW = hasGutter ? Math.max(1, Math.round(CELL * gutter)) : 0;
  const labelW = labelSpace > 0 ? Math.max(1, Math.round(CELL * labelSpace)) : 0;

  // Each pair is: tileA [label] tileB
  const pairAxis = direction === "horizontal" ? "col" : "row";

  function buildPair(): M0String {
    if (labelW > 0) {
      return weightedSplit(
        [CELL, labelW, CELL],
        pairAxis,
        { claimants: ["1", "-", "1"] },
      );
    }
    return weightedSplit([CELL, CELL], pairAxis);
  }

  const tileCount = pairs * 2;

  if (pairs === 1) {
    return { m0: buildPair(), tileCount };
  }

  // Multiple pairs: stack them along the opposite axis with optional gutters
  // between pairs. Express as a weighted split with per-child claimants so
  // GCD reduction collapses uniform weights uniformly.
  const stackAxis = direction === "horizontal" ? "row" : "col";
  const pairExpr = buildPair();

  if (!hasGutter) {
    const weights = Array(pairs).fill(CELL);
    const claimants = Array(pairs).fill(pairExpr as string);
    return { m0: weightedSplit(weights, stackAxis, { claimants }), tileCount };
  }

  // Interleave: pair, gutter, pair, gutter, ..., pair
  const weights: number[] = [];
  const claimants: string[] = [];
  for (let i = 0; i < pairs; i++) {
    if (i > 0) {
      weights.push(gutterW);
      claimants.push("-");
    }
    weights.push(CELL);
    claimants.push(pairExpr as string);
  }
  return { m0: weightedSplit(weights, stackAxis, { claimants }), tileCount };
}
