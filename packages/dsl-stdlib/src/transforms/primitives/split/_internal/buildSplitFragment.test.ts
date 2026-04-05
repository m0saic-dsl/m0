import {
  gcd,
  gcdArray,
  buildWeightedSplit,
  buildSplitFragment,
  buildUniformSplit,
} from "./buildSplitFragment";

// ── GCD utility ──────────────────────────────────────────────────

describe("gcd", () => {
  test("gcd(70, 30) = 10", () => expect(gcd(70, 30)).toBe(10));
  test("gcd(50, 50) = 50", () => expect(gcd(50, 50)).toBe(50));
  test("gcd(33, 34) = 1", () => expect(gcd(33, 34)).toBe(1));
  test("gcd(12, 8) = 4", () => expect(gcd(12, 8)).toBe(4));
  test("gcd(7, 0) = 7", () => expect(gcd(7, 0)).toBe(7));
  test("gcd(0, 5) = 5", () => expect(gcd(0, 5)).toBe(5));
});

describe("gcdArray", () => {
  test("[70, 30] = 10", () => expect(gcdArray([70, 30])).toBe(10));
  test("[50, 50] = 50", () => expect(gcdArray([50, 50])).toBe(50));
  test("[25, 25, 25, 25] = 25", () => expect(gcdArray([25, 25, 25, 25])).toBe(25));
  test("[10, 20, 30, 40] = 10", () => expect(gcdArray([10, 20, 30, 40])).toBe(10));
  test("[33, 33, 34] = 1", () => expect(gcdArray([33, 33, 34])).toBe(1));
  test("[5, 95] = 5", () => expect(gcdArray([5, 95])).toBe(5));
  test("empty array = 1", () => expect(gcdArray([])).toBe(1));
  test("[7] = 7", () => expect(gcdArray([7])).toBe(7));
});

// ── buildWeightedSplit optimized (default) ───────────────────────

describe("buildWeightedSplit optimized", () => {
  test("[70,30] → reduces to [7,3] → 10 slots", () => {
    expect(buildWeightedSplit("col", [70, 30])).toBe(
      "10(0,0,0,0,0,0,F,0,0,F)"
    );
  });

  test("[50,50] → equal split", () => {
    expect(buildWeightedSplit("col", [50, 50])).toBe("2(F,F)");
  });

  test("[25,25,25,25] → equal split", () => {
    expect(buildWeightedSplit("row", [25, 25, 25, 25])).toBe("4[F,F,F,F]");
  });

  test("[10,20,30,40] → [1,2,3,4] → 10 slots", () => {
    expect(buildWeightedSplit("row", [10, 20, 30, 40])).toBe(
      "10[F,0,F,0,0,F,0,0,0,F]"
    );
  });

  test("[33,33,34] → unchanged (GCD=1)", () => {
    const result = buildWeightedSplit("col", [33, 33, 34]);
    expect(result.startsWith("100(")).toBe(true);
  });

  test("[1,2,1] → already minimal", () => {
    expect(buildWeightedSplit("col", [1, 2, 1])).toBe("4(F,0,F,F)");
  });
});

// ── buildWeightedSplit literal ───────────────────────────────────

describe("buildWeightedSplit literal", () => {
  test("[70,30] → 100 slots", () => {
    const result = buildWeightedSplit("col", [70, 30], "literal");
    expect(result.startsWith("100(")).toBe(true);
  });

  test("[50,50] → 100 slots (no equal-split optimization)", () => {
    const result = buildWeightedSplit("col", [50, 50], "literal");
    expect(result.startsWith("100(")).toBe(true);
  });
});

// ── buildSplitFragment routing ──────────────────────────────────

describe("buildSplitFragment", () => {
  test("without weights → uniform", () => {
    expect(buildSplitFragment("col", 3)).toBe("3(F,F,F)");
  });

  test("with weights → optimized by default", () => {
    expect(buildSplitFragment("col", 2, [50, 50])).toBe("2(F,F)");
  });

  test("with weights + literal mode", () => {
    const result = buildSplitFragment("col", 2, [50, 50], "literal");
    expect(result.startsWith("100(")).toBe(true);
  });

  test("weight length mismatch → falls back to uniform", () => {
    expect(buildSplitFragment("col", 3, [50, 50])).toBe("3(F,F,F)");
  });
});
