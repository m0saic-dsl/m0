/**
 * Comparison / Before-After builder.
 *
 * Side-by-side or stacked pairs with optional label/divider space.
 */

import type { M0String } from "@m0saic/dsl";
import { weightedTokens } from "./weightedTokens";
import { container } from "./container";
import { strip } from "./strip";

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

  function buildPair(): string {
    const tokens: string[] = [];
    tokens.push(...weightedTokens(CELL, "1"));
    if (labelW > 0) tokens.push(...weightedTokens(labelW, "-"));
    tokens.push(...weightedTokens(CELL, "1"));
    return container(tokens, pairAxis) as string;
  }

  const tileCount = pairs * 2;

  if (pairs === 1) {
    const m0 = buildPair() as M0String;
    return { m0: m0 as M0String, tileCount };
  }

  // Multiple pairs: stack them along the opposite axis
  const stackAxis = direction === "horizontal" ? "row" : "col";
  const pairExpr = buildPair();

  const m0 = strip(pairs, stackAxis, {
    cellWeight: CELL,
    gutterWeight: gutterW,
    claimant: pairExpr,
  });

  return { m0, tileCount };
}
