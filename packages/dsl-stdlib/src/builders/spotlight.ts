/**
 * Spotlight builder.
 *
 * One dominant hero tile with N supporting tiles arranged around it.
 * Builds from weightedTokens + container + strip primitives.
 */

import type { M0String } from "@m0saic/dsl";
import { weightedTokens } from "./weightedTokens";
import { container } from "./container";
import { strip } from "./strip";

// ── Types ─────────────────────────────────────────────────

/** How supporting tiles are arranged relative to the hero. */
export type SpotlightArrangement = "bottom" | "right" | "l-wrap" | "u-wrap";

/** Options for {@link spotlight}. */
export type SpotlightOptions = {
  /** Number of supporting tiles (1–8). Default: 3. */
  supportCount?: number;
  /** Where supporting tiles go. Default: "bottom". */
  arrangement?: SpotlightArrangement;
  /** Hero size weight multiplier (1–4). Default: 2. */
  heroWeight?: number;
  /** Gutter ratio (0–0.2). Default: 0. */
  gutter?: number;
};

/** Result from {@link spotlight}. */
export type SpotlightResult = {
  m0: M0String;
  tileCount: number;
};

// ── Main ──────────────────────────────────────────────────

const DEFAULT_CELL = 50;

export function spotlight(opts: SpotlightOptions = {}): SpotlightResult {
  const {
    supportCount = 3,
    arrangement = "bottom",
    heroWeight = 2,
    gutter = 0,
  } = opts;

  if (!Number.isInteger(supportCount) || supportCount < 1 || supportCount > 8)
    throw new Error("spotlight: supportCount must be 1–8");
  if (heroWeight < 1 || heroWeight > 4)
    throw new Error("spotlight: heroWeight must be 1–4");

  const cellW = DEFAULT_CELL;
  const hasGutter = gutter > 0;
  const gutterW = hasGutter ? Math.max(1, Math.round(cellW * gutter)) : 0;

  const heroW = Math.max(1, Math.round(heroWeight * cellW));
  const supportW = cellW;

  const tileCount = 1 + supportCount;

  // Build support strip
  const supportExpr = strip(supportCount, arrangement === "bottom" ? "col" : "row", {
    cellWeight: cellW,
    gutterWeight: gutterW,
  });

  let m0: M0String;

  switch (arrangement) {
    case "bottom": {
      // Hero on top, support strip below
      const slots: string[] = [];
      slots.push(...weightedTokens(heroW, "1"));
      if (hasGutter) slots.push(...weightedTokens(gutterW, "-"));
      slots.push(...weightedTokens(supportW, supportExpr));
      m0 = container(slots, "row");
      break;
    }
    case "right": {
      // Hero on left, support column on right
      const supportCol = strip(supportCount, "row", {
        cellWeight: cellW,
        gutterWeight: gutterW,
      });
      const slots: string[] = [];
      slots.push(...weightedTokens(heroW, "1"));
      if (hasGutter) slots.push(...weightedTokens(gutterW, "-"));
      slots.push(...weightedTokens(supportW, supportCol));
      m0 = container(slots, "col");
      break;
    }
    case "l-wrap": {
      // Hero top-left, support right + support bottom
      // Split support: ceil(count/2) go right, rest go bottom
      const rightCount = Math.ceil(supportCount / 2);
      const bottomCount = supportCount - rightCount;

      const rightCol = strip(rightCount, "row", {
        cellWeight: cellW,
        gutterWeight: gutterW,
      });

      // Top row: hero + right column
      const topSlots: string[] = [];
      topSlots.push(...weightedTokens(heroW, "1"));
      if (hasGutter) topSlots.push(...weightedTokens(gutterW, "-"));
      topSlots.push(...weightedTokens(supportW, rightCol));
      const topExpr = container(topSlots, "col");

      if (bottomCount > 0) {
        const bottomStrip = strip(bottomCount, "col", {
          cellWeight: cellW,
          gutterWeight: gutterW,
        });
        const outerSlots: string[] = [];
        outerSlots.push(...weightedTokens(heroW, topExpr));
        if (hasGutter) outerSlots.push(...weightedTokens(gutterW, "-"));
        outerSlots.push(...weightedTokens(supportW, bottomStrip));
        m0 = container(outerSlots, "row");
      } else {
        m0 = topExpr;
      }
      break;
    }
    case "u-wrap": {
      // Hero center-top, support split evenly left + right
      const leftCount = Math.ceil(supportCount / 2);
      const rightCount = supportCount - leftCount;

      const leftCol = strip(leftCount, "row", {
        cellWeight: cellW,
        gutterWeight: gutterW,
      });

      const slots: string[] = [];
      slots.push(...weightedTokens(supportW, leftCol));
      if (hasGutter) slots.push(...weightedTokens(gutterW, "-"));
      slots.push(...weightedTokens(heroW, "1"));
      if (rightCount > 0) {
        const rightCol = strip(rightCount, "row", {
          cellWeight: cellW,
          gutterWeight: gutterW,
        });
        if (hasGutter) slots.push(...weightedTokens(gutterW, "-"));
        slots.push(...weightedTokens(supportW, rightCol));
      }
      m0 = container(slots, "col");
      break;
    }
  }

  return { m0, tileCount };
}
