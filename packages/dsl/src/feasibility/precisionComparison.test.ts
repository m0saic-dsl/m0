/**
 * Comparison: computePrecisionFromString vs computeFeasibility
 *
 * computePrecisionFromString is O(n) — a single character scan that reports
 * the largest split count on each axis (maxSplitX, maxSplitY). This equals
 * the true minimum resolution for flat (non-nested) layouts but diverges
 * for nested same-axis splits and passthrough-heavy layouts.
 *
 * computeFeasibility is exact — O(n) structural analysis that returns the
 * true minimum feasible resolution. Correct for all layouts.
 *
 * This test documents every known class of divergence so the tradeoff is
 * explicit before v1.0.0. M0Precision only contains maxSplitX /
 * maxSplitY / maxSplitAny — truthful structural metrics that do not
 * claim to be exact minimum resolutions:
 *
 *   - For NESTED same-axis splits, fast UNDERESTIMATES (too low).
 *     Real min is higher because inner splits subdivide already-reduced space.
 *
 *   - For PASSTHROUGH-heavy layouts, fast OVERESTIMATES (too high).
 *     Passthroughs donate space so fewer frames need pixels, but the fast
 *     scan still counts the full classifier.
 *
 * In practice, the fast value equals the exact value for the vast majority
 * of real-world layouts (flat grids, simple splits, cross-axis nesting).
 * The divergence cases are edge cases that arise from deep same-axis nesting
 * or high passthrough ratios.
 */

import { computePrecisionFromString } from "../parse/m0StringParser";
import { computeFeasibility } from "./computeFeasibility";

// ─────────────────────────────────────────────────────────────
// Cases where both agree (flat layouts, no same-axis nesting)
// ─────────────────────────────────────────────────────────────

describe("computePrecisionFromString === computeFeasibility (agreement)", () => {
  const agreementCases: { name: string; s: string }[] = [
    { name: "bare tile", s: "1" },
    { name: "2-col split", s: "2(1,1)" },
    { name: "5-row split", s: "5[1,1,1,1,1]" },
    { name: "3×3 grid (cross-axis nesting)", s: "3(3[1,1,1],3[1,1,1],3[1,1,1])" },
    { name: "4×2 grid", s: "4(2[1,1],2[1,1],2[1,1],2[1,1])" },
    { name: "single overlay", s: "1{1}" },
    { name: "overlay with split", s: "1{2(1,1)}" },
    // Note: passthrough layouts like 3(0,0,1) are NOT agreement cases.
    // Fast reports minW=3 (the split count), but passthroughs donate all
    // space to the single frame, so exact minW=1. See divergence section.
    {
      name: "100-way flat col split",
      s: `100(${Array(100).fill("1").join(",")})`,
    },
  ];

  it.each(agreementCases)("$name", ({ s }) => {
    const fast = computePrecisionFromString(s);
    const exact = computeFeasibility(s);

    expect(fast.maxSplitX).toBe(exact.minWidthPx);
    expect(fast.maxSplitY).toBe(exact.minHeightPx);
  });
});

// ─────────────────────────────────────────────────────────────
// Cases where they DISAGREE (nested same-axis splits)
//
// computePrecisionFromString reports the max single split count.
// computeFeasibility reports the true minimum resolution.
// For nested same-axis splits, the true minimum is higher because
// the outer split reduces available pixels for inner splits.
// ─────────────────────────────────────────────────────────────

// ── Underestimates: fast < exact (nested same-axis splits) ──
//
// The fast scan reports the max single split count, but nested
// same-axis splits multiply: the outer split reduces available
// pixels, so the inner split needs more total width to still
// have ≥1px per child.

describe("fast UNDERESTIMATES exact (nested same-axis splits)", () => {
  const cases: {
    name: string;
    s: string;
    fastMaxX: number;
    fastMaxY: number;
    exactW: number;
    exactH: number;
  }[] = [
    {
      // 2(5(...), 5(...)) — outer gives each child ~width/2,
      // inner needs ≥5 → true min is 10, not 5.
      name: "2(5×5) nested col splits",
      s: "2(5(1,1,1,1,1),5(1,1,1,1,1))",
      fastMaxX: 5,
      fastMaxY: 1,
      exactW: 10,
      exactH: 1,
    },
    {
      // 3(3(...), 3(...), 3(...)) — outer gives each ~width/3,
      // inner needs ≥3 → true min is 9, not 3.
      name: "3(3×3×3) nested col splits",
      s: "3(3(1,1,1),3(1,1,1),3(1,1,1))",
      fastMaxX: 3,
      fastMaxY: 1,
      exactW: 9,
      exactH: 1,
    },
    {
      // Same-axis nesting on row axis: 2[3[...], 3[...]]
      name: "2[3×3] nested row splits",
      s: "2[3[1,1,1],3[1,1,1]]",
      fastMaxX: 1,
      fastMaxY: 3,
      exactW: 1,
      exactH: 6,
    },
    {
      // 3-level deep: 2(2(2(1,1),1),1)
      // Outside-in remainder distribution means the exact minimum
      // depends on how remainders cascade through levels.
      name: "3-level deep col nesting",
      s: "2(2(2(1,1),1),1)",
      fastMaxX: 2,
      fastMaxY: 1,
      exactW: 5,
      exactH: 1,
    },
    {
      // Outer 10-split, first child has inner 10-split (all non-zero).
      // Outer gives first child ~width/10, inner needs ≥10.
      // Remainder distribution means exact min = 91.
      name: "10(inner 10-split, 9×1) — nested same-axis",
      s: "10(10(1,1,1,1,1,1,1,1,1,1),1,1,1,1,1,1,1,1,1)",
      fastMaxX: 10,
      fastMaxY: 1,
      exactW: 91,
      exactH: 1,
    },
  ];

  it.each(cases)(
    "$name: fast=$fastMaxX, exact=$exactW",
    ({ s, fastMaxX, fastMaxY, exactW, exactH }) => {
      const fast = computePrecisionFromString(s);
      const exact = computeFeasibility(s);

      expect(fast.maxSplitX).toBe(fastMaxX);
      expect(fast.maxSplitY).toBe(fastMaxY);
      expect(exact.minWidthPx).toBe(exactW);
      expect(exact.minHeightPx).toBe(exactH);

      // Fast is strictly less than exact on at least one axis
      const underestimatesW = fast.maxSplitX < exact.minWidthPx;
      const underestimatesH = fast.maxSplitY < exact.minHeightPx;
      expect(underestimatesW || underestimatesH).toBe(true);
    },
  );
});

// ── Overestimates: fast > exact (passthrough-heavy layouts) ──
//
// Passthroughs donate their space forward. The fast scan still
// counts the classifier (e.g., 3 in "3(0,0,1)"), but the true
// minimum is lower because only one frame needs pixels.

describe("fast OVERESTIMATES exact (passthrough-heavy layouts)", () => {
  const cases: {
    name: string;
    s: string;
    fastMaxX: number;
    exactW: number;
  }[] = [
    {
      name: "3(0,0,1) — 2 passthroughs donate to 1 frame",
      s: "3(0,0,1)",
      fastMaxX: 3,
      exactW: 1,
    },
    {
      name: "5(0,0,0,0,1) — 4 passthroughs donate to 1 frame",
      s: "5(0,0,0,0,1)",
      fastMaxX: 5,
      exactW: 1,
    },
    {
      // 10(0,0,0,0,0,0,0,0,0,1) — 9 passthroughs, 1 frame
      name: "10(9×0,1) — heavy passthrough",
      s: "10(0,0,0,0,0,0,0,0,0,1)",
      fastMaxX: 10,
      exactW: 1,
    },
  ];

  it.each(cases)(
    "$name: fast=$fastMaxX, exact=$exactW",
    ({ s, fastMaxX, exactW }) => {
      const fast = computePrecisionFromString(s);
      const exact = computeFeasibility(s);

      expect(fast.maxSplitX).toBe(fastMaxX);
      expect(exact.minWidthPx).toBe(exactW);

      // Fast is strictly GREATER than exact (overestimate)
      expect(fast.maxSplitX).toBeGreaterThan(exact.minWidthPx);
    },
  );
});

// ─────────────────────────────────────────────────────────────
// Spot-check: for non-trivial mixed layouts, verify both functions
// return consistent results (no crashes, exact ≥ 1).
//
// Note: we cannot assert fast ≤ exact universally because passthrough-
// heavy layouts cause fast to OVERESTIMATE. These cases specifically
// test layouts where both directions of disagreement are possible.
// ─────────────────────────────────────────────────────────────

describe("mixed layouts: both functions return sane results", () => {
  const stressCases: { name: string; s: string }[] = [
    { name: "4-level deep col nesting", s: "2(2(2(2(1,1),1),1),1)" },
    { name: "mixed axis 2(3[2(1,1),1,1],1)", s: "2(3[2(1,1),1,1],1)" },
    { name: "overlay inside nested split", s: "2(3(1,1,1{2(1,1)}),1)" },
    { name: "deep row nesting", s: "3[3[3[1,1,1],1,1],1,1]" },
    { name: "wide + deep", s: "5(2(1,1),2(1,1),2(1,1),2(1,1),2(1,1))" },
  ];

  it.each(stressCases)("$name", ({ s }) => {
    const fast = computePrecisionFromString(s);
    const exact = computeFeasibility(s);

    // Both return positive values
    expect(fast.maxSplitX).toBeGreaterThanOrEqual(1);
    expect(fast.maxSplitY).toBeGreaterThanOrEqual(1);
    expect(exact.minWidthPx).toBeGreaterThanOrEqual(1);
    expect(exact.minHeightPx).toBeGreaterThanOrEqual(1);
  });
});
