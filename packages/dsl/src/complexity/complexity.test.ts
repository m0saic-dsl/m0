import {
  getFrameCount,
  getPrecisionCost,
  getComplexityMetricsFast,
} from "./complexity";

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

/** Bare frame — simplest possible mosaic. */
const SIMPLE = "1";

/** 8-way horizontal split — high frame count, no passthroughs. */
const HIGH_FRAMES = "8(1,1,1,1,1,1,1,1)";

/** 4-way split with 3 passthroughs — high editor complexity, low render cost. */
const HIGH_PASSTHROUGH = "4(0,0,0,1)";

/** Nested layout: 2-col with a 3-row left and a 2-col right (one passthrough). */
const NESTED = "2(3[1,1,1],2(0,1))";

/** 100-way col-split — high precision cost. */
const PRECISION_HEAVY = `100(${Array(100).fill("1").join(",")})`;

/** Overlay: frame with overlay subtree containing a 2-way split. */
const WITH_OVERLAY = "2(1{2(1,1)},1)";

/** Mixed: nulls, passthroughs, frames, nesting. */
const MIXED = "3(1,-,2[0,1])";

// ─────────────────────────────────────────────────────────────
// getFrameCount
// ─────────────────────────────────────────────────────────────

describe("getFrameCount", () => {
  it("bare frame", () => {
    expect(getFrameCount(SIMPLE)).toBe(1);
  });

  it("high frame count", () => {
    expect(getFrameCount(HIGH_FRAMES)).toBe(8);
  });

  it("high passthrough — only 1 rendered frame", () => {
    expect(getFrameCount(HIGH_PASSTHROUGH)).toBe(1);
  });

  it("nested layout", () => {
    // 3 left + 1 right = 4 frames
    expect(getFrameCount(NESTED)).toBe(4);
  });

  it("precision-heavy (100 frames)", () => {
    expect(getFrameCount(PRECISION_HEAVY)).toBe(100);
  });

  it("overlay subtree frames are counted", () => {
    // 2 base frames + 2 overlay frames = 4
    expect(getFrameCount(WITH_OVERLAY)).toBe(4);
  });

  it("mixed layout", () => {
    // 1 + 1 inside nested = 2 frames
    expect(getFrameCount(MIXED)).toBe(2);
  });

  it("handles aliases (F and >)", () => {
    expect(getFrameCount("2(F,F)")).toBe(2);
  });

  it("handles whitespace", () => {
    expect(getFrameCount(" 2( 1 , 1 ) ")).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// passthrough count (via getComplexityMetricsFast)
// ─────────────────────────────────────────────────────────────

describe("getComplexityMetricsFast.passthroughCount", () => {
  const pass = (s: string) => getComplexityMetricsFast(s).passthroughCount;

  it("bare frame — no passthroughs", () => {
    expect(pass(SIMPLE)).toBe(0);
  });

  it("high frame count — no passthroughs", () => {
    expect(pass(HIGH_FRAMES)).toBe(0);
  });

  it("high passthrough layout", () => {
    expect(pass(HIGH_PASSTHROUGH)).toBe(3);
  });

  it("nested layout with one passthrough", () => {
    expect(pass(NESTED)).toBe(1);
  });

  it("handles > alias", () => {
    expect(pass("3(>,>,1)")).toBe(2);
  });

  it("mixed layout", () => {
    expect(pass(MIXED)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// node count (via getComplexityMetricsFast)
// ─────────────────────────────────────────────────────────────

describe("getComplexityMetricsFast.nodeCount", () => {
  const nodes = (s: string) => getComplexityMetricsFast(s).nodeCount;

  it("bare frame — 1 node", () => {
    expect(nodes(SIMPLE)).toBe(1);
  });

  it("high frame count — 1 group + 8 frames = 9", () => {
    expect(nodes(HIGH_FRAMES)).toBe(9);
  });

  it("high passthrough — 1 group + 3 passthroughs + 1 frame = 5", () => {
    expect(nodes(HIGH_PASSTHROUGH)).toBe(5);
  });

  it("nested — 3 groups + 4 frames + 1 passthrough = 8", () => {
    // 2(...), 3[...], 2(...) = 3 groups; 3+1 frames; 1 passthrough
    expect(nodes(NESTED)).toBe(8);
  });

  it("overlay — 2 groups + 4 frames = 6", () => {
    // outer 2(...) + overlay 2(...) = 2 groups; 1+2+1 = 4 frames
    expect(nodes(WITH_OVERLAY)).toBe(6);
  });

  it("mixed — 2 groups + 2 frames + 1 null + 1 passthrough = 6", () => {
    // 3(...), 2[...] = 2 groups; 1+1 frames; 1 null; 1 passthrough
    expect(nodes(MIXED)).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────
// getPrecisionCost
// ─────────────────────────────────────────────────────────────

describe("getPrecisionCost", () => {
  it("bare frame — precision 1", () => {
    expect(getPrecisionCost(SIMPLE)).toBe(1);
  });

  it("8-way split — precision 8", () => {
    expect(getPrecisionCost(HIGH_FRAMES)).toBe(8);
  });

  it("100-way split — precision 100", () => {
    expect(getPrecisionCost(PRECISION_HEAVY)).toBe(100);
  });

  it("nested 2(3[...],2(...)) — precision 3 (max of 2 and 3)", () => {
    expect(getPrecisionCost(NESTED)).toBe(3);
  });

  it("precision is axis-independent (row vs col)", () => {
    expect(getPrecisionCost("5[1,1,1,1,1]")).toBe(5);
    expect(getPrecisionCost("5(1,1,1,1,1)")).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────
// getComplexityMetrics (aggregate)
// ─────────────────────────────────────────────────────────────

describe("getComplexityMetrics", () => {
  it("returns all metrics for a simple mosaic", () => {
    const m = getComplexityMetricsFast(SIMPLE)!;
    expect(m.frameCount).toBe(1);
    expect(m.passthroughCount).toBe(0);
    expect(m.nullCount).toBe(0);
    expect(m.groupCount).toBe(0);
    expect(m.nodeCount).toBe(1);
    expect(m.precisionCost).toBe(1);
  });

  it("returns all metrics for a nested mosaic", () => {
    const m = getComplexityMetricsFast(NESTED)!;
    expect(m.frameCount).toBe(4);
    expect(m.passthroughCount).toBe(1);
    expect(m.nullCount).toBe(0);
    expect(m.groupCount).toBe(3);
    expect(m.nodeCount).toBe(8);
    expect(m.precisionCost).toBe(3);
  });

  it("returns all metrics for a mixed mosaic", () => {
    const m = getComplexityMetricsFast(MIXED)!;
    expect(m.frameCount).toBe(2);
    expect(m.passthroughCount).toBe(1);
    expect(m.nullCount).toBe(1);
    expect(m.groupCount).toBe(2);
    expect(m.nodeCount).toBe(6);
  });

  it("nodeCount equals sum of parts", () => {
    const m = getComplexityMetricsFast(WITH_OVERLAY)!;
    expect(m.nodeCount).toBe(m.groupCount + m.frameCount + m.passthroughCount + m.nullCount);
  });

  it("precision field matches getPrecisionCost", () => {
    const m = getComplexityMetricsFast(PRECISION_HEAVY)!;
    expect(m.precisionCost).toBe(getPrecisionCost(PRECISION_HEAVY));
    expect(m.precision.maxSplitAny).toBe(m.precisionCost);
  });

  it("includes full precision breakdown", () => {
    const m = getComplexityMetricsFast("2(3[1,1,1],1)")!;
    expect(m.precision.maxSplitX).toBe(2);
    expect(m.precision.maxSplitY).toBe(3);
    expect(m.precision.maxSplitAny).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// Illustrative: same frame count, different passthrough counts
// ─────────────────────────────────────────────────────────────

describe("editorial complexity vs render cost", () => {
  it("two mosaics with equal frame count but different editor complexity", () => {
    // Layout A: 3 frames, no passthroughs — simple to reason about
    const a = getComplexityMetricsFast("3(1,1,1)")!;
    // Layout B: 3 frames, 2 passthroughs — space donation makes editing harder
    const b = getComplexityMetricsFast("5(0,1,0,1,1)")!;

    // Same render cost
    expect(a.frameCount).toBe(3);
    expect(b.frameCount).toBe(3);

    // Very different editor complexity
    expect(a.passthroughCount).toBe(0);
    expect(b.passthroughCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// Invalid DSL input → null
// ─────────────────────────────────────────────────────────────

describe("invalid DSL input", () => {
  const INVALID_CASES = [
    { label: "empty string", input: "" },
    { label: "garbage text", input: "hello world" },
    { label: "unbalanced parens", input: "2(1,1" },
    { label: "unbalanced brackets", input: "3[1,1,1" },
    { label: "illegal 1-split", input: "1(1)" },
    { label: "mismatched brackets", input: "2(1,1]" },
    { label: "trailing comma", input: "2(1,1,)" },
    { label: "double comma", input: "2(1,,1)" },
  ];

  // The validating getters (getFrameCount, getPrecisionCost) return null on
  // invalid input. getComplexityMetricsFast does NOT validate by design.
  for (const { label, input } of INVALID_CASES) {
    it(`getFrameCount returns null for ${label}`, () => {
      expect(getFrameCount(input)).toBeNull();
    });

    it(`getPrecisionCost returns null for ${label}`, () => {
      expect(getPrecisionCost(input)).toBeNull();
    });
  }
});
