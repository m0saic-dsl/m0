import { weightedSplit } from "./weightedSplit";

describe("weightedSplit", () => {
  // ---- Basic cases (already minimal) ----

  test("[1] col returns single tile", () => {
    expect(weightedSplit([1], "col")).toBe("1");
  });

  test("[1] row returns single tile", () => {
    expect(weightedSplit([1], "row")).toBe("1");
  });

  test("[1,1] col", () => {
    expect(weightedSplit([1, 1], "col")).toBe("2(1,1)");
  });

  test("[1,1] row", () => {
    expect(weightedSplit([1, 1], "row")).toBe("2[1,1]");
  });

  test("[1,1,1] row", () => {
    expect(weightedSplit([1, 1, 1], "row")).toBe("3[1,1,1]");
  });

  // ---- Optimized weighted proportions (default) ----

  test("[35,65] col reduces by GCD=5 → [7,13] → 20 slots", () => {
    const result = weightedSplit([35, 65], "col");
    // GCD(35,65) = 5, reduced to [7,13], total = 20
    expect(result).toMatch(/^20\(/);
    const inner = result.slice(3, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(20);
    // child1: 6 zeros + "1" (7 slots)
    expect(tokens.slice(0, 7)).toEqual([...Array(6).fill("0"), "1"]);
    // child2: 12 zeros + "1" (13 slots)
    expect(tokens.slice(7)).toEqual([...Array(12).fill("0"), "1"]);
  });

  test("[50,50] col → equal split (GCD=50, all weights=1)", () => {
    expect(weightedSplit([50, 50], "col")).toBe("2(1,1)");
  });

  test("[25,25,25,25] row → equal split", () => {
    expect(weightedSplit([25, 25, 25, 25], "row")).toBe("4[1,1,1,1]");
  });

  test("[10,20,30,40] row reduces by GCD=10 → [1,2,3,4]", () => {
    const result = weightedSplit([10, 20, 30, 40], "row");
    expect(result).toMatch(/^10\[/);
    const inner = result.slice(3, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(10);
    expect(tokens).toEqual([
      "1",
      "0", "1",
      "0", "0", "1",
      "0", "0", "0", "1",
    ]);
  });

  test("[5,95] col reduces by GCD=5 → [1,19]", () => {
    const result = weightedSplit([5, 95], "col");
    expect(result).toMatch(/^20\(/);
    const inner = result.slice(3, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(20);
  });

  test("[33,33,34] unchanged (GCD=1)", () => {
    const result = weightedSplit([33, 33, 34], "row");
    expect(result).toMatch(/^100\[/);
    const inner = result.slice(4, -1);
    expect(inner.split(",")).toHaveLength(100);
  });

  test("[70,30] col reduces by GCD=10 → [7,3]", () => {
    const result = weightedSplit([70, 30], "col");
    expect(result).toMatch(/^10\(/);
    const inner = result.slice(3, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(10);
  });

  test("[27,32,27,14] row (GCD=1, unchanged)", () => {
    const result = weightedSplit([27, 32, 27, 14], "row");
    expect(result).toMatch(/^100\[/);
    const inner = result.slice(4, -1);
    expect(inner.split(",")).toHaveLength(100);
  });

  // ---- Axis correctness ----

  test("col uses parentheses", () => {
    const result = weightedSplit([2, 3], "col");
    expect(result).toMatch(/^\d+\(/);
    expect(result).toMatch(/\)$/);
  });

  test("row uses brackets", () => {
    const result = weightedSplit([2, 3], "row");
    expect(result).toMatch(/^\d+\[/);
    expect(result).toMatch(/\]$/);
  });

  // ---- Order preservation ----

  test("child order matches weight order", () => {
    const result = weightedSplit([1, 2, 1], "col");
    // 1 + 2 + 1 = 4 total: "1", "0","1", "1"
    expect(result).toBe("4(1,0,1,1)");
  });

  // ---- Returns branded M0String ----

  test("result is a string (branded M0String)", () => {
    const result = weightedSplit([3, 7], "col");
    expect(typeof result).toBe("string");
  });

  // ---- Invalid inputs ----

  test("empty array throws", () => {
    expect(() => weightedSplit([], "col")).toThrow(
      "weightedSplit: weights must be non-empty"
    );
  });

  test("zero weight throws", () => {
    expect(() => weightedSplit([1, 0, 1], "row")).toThrow(
      /weight\[1\] must be a positive integer, got 0/
    );
  });

  test("negative weight throws", () => {
    expect(() => weightedSplit([-3], "col")).toThrow(
      /weight\[0\] must be a positive integer, got -3/
    );
  });

  test("non-integer weight throws", () => {
    expect(() => weightedSplit([2.5], "row")).toThrow(
      /weight\[0\] must be a positive integer, got 2\.5/
    );
  });

  // ---- claimant option ----

  test("claimant overrides default tile token", () => {
    const result = weightedSplit([1, 2], "row", { claimant: "1{1}" });
    // 1+2 = 3 slots: "1{1}", "0", "1{1}"
    expect(result).toBe("3[1{1},0,1{1}]");
  });

  test("single weight with custom claimant bypasses container", () => {
    const result = weightedSplit([1], "col", { claimant: "1{1}" });
    expect(result).toBe("1{1}");
  });

  // ---- claimants option (skips GCD reduction) ----

  test("claimants provides per-child tokens", () => {
    const result = weightedSplit([1, 1], "row", {
      claimants: ["1", "1{1}"],
    });
    expect(result).toBe("2[1,1{1}]");
  });

  test("claimants with weighted children", () => {
    const result = weightedSplit([2, 3], "col", {
      claimants: ["1", "1{1}"],
    });
    // child1: "0","1"  child2: "0","0","1{1}"
    expect(result).toBe("5(0,1,0,0,1{1})");
  });

  test("claimants length mismatch throws", () => {
    expect(() =>
      weightedSplit([1, 2], "col", { claimants: ["1"] })
    ).toThrow(
      "weightedSplit: claimants.length (1) must equal weights.length (2)"
    );
  });

  test("claimant and claimants together throws", () => {
    expect(() =>
      weightedSplit([1, 1], "col", { claimant: "1", claimants: ["1", "1"] })
    ).toThrow("weightedSplit: claimant and claimants are mutually exclusive");
  });

  // ---- precision option (with optimized GCD) ----

  test("precision scales weights then reduces by GCD", () => {
    const result = weightedSplit([1, 2], "col", { precision: 90 });
    // Scaled: 30 + 60 = 90, GCD(30,60) = 30, reduced to [1,2] = 3 slots
    expect(result).toBe("3(1,0,1)");
  });

  test("precision with equal distribution → equal split", () => {
    const result = weightedSplit([1, 1, 1], "row", { precision: 99 });
    // Scaled: 33+33+33 = 99, GCD=33, reduced to [1,1,1] = equal split
    expect(result).toBe("3[1,1,1]");
  });

  test("precision with non-trivial remainder (GCD=1)", () => {
    // 3 equal weights into 100: 34+33+33 or 33+34+33, GCD=1
    const result = weightedSplit([1, 1, 1], "row", { precision: 100 });
    const inner = result.slice(4, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(100);
  });

  test("precision preserves exact sum", () => {
    const result = weightedSplit([1, 1, 1], "row", { precision: 100 });
    const inner = result.slice(4, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(100);
  });

  test("precision with claimants (no GCD reduction)", () => {
    const result = weightedSplit([1, 3], "row", {
      claimants: ["1", "1{1}"],
      precision: 100,
    });
    expect(result).toMatch(/^100\[/);
    const inner = result.slice(4, -1);
    const tokens = inner.split(",");
    expect(tokens).toHaveLength(100);
    expect(tokens[24]).toBe("1");
    expect(tokens[99]).toBe("1{1}");
  });

  test("precision < weights.length throws", () => {
    expect(() =>
      weightedSplit([1, 1, 1], "col", { precision: 2 })
    ).toThrow(
      "weightedSplit: precision (2) must be >= weights.length (3)"
    );
  });

  test("non-integer precision throws", () => {
    expect(() =>
      weightedSplit([1, 1], "col", { precision: 10.5 })
    ).toThrow(/precision must be a positive integer/);
  });

  test("zero precision throws", () => {
    expect(() =>
      weightedSplit([1], "col", { precision: 0 })
    ).toThrow(/precision must be a positive integer/);
  });

  // ---- precision scaling determinism ----

  test("precision scaling is deterministic across calls", () => {
    const a = weightedSplit([7, 13, 3], "col", { precision: 100 });
    const b = weightedSplit([7, 13, 3], "col", { precision: 100 });
    expect(a).toBe(b);
  });

  test("precision scaling preserves proportions", () => {
    // 1:4 ratio → scaled to 100, GCD reduces it
    const result = weightedSplit([1, 4], "row", { precision: 100 });
    // Scaled: 20+80=100, GCD(20,80)=20, reduced to [1,4] = 5 slots
    expect(result).toBe("5[1,0,0,0,1]");
  });
});

// ── Literal mode (opt-in) ────────────────────────────────────────

describe("weightedSplit literal mode", () => {
  test("[35,65] col stays 100 slots", () => {
    const result = weightedSplit([35, 65], "col", { mode: "literal" });
    expect(result).toMatch(/^100\(/);
    const inner = result.slice(4, -1);
    expect(inner.split(",")).toHaveLength(100);
  });

  test("[50,50] col stays 100 slots (no equal-split optimization)", () => {
    const result = weightedSplit([50, 50], "col", { mode: "literal" });
    expect(result).toMatch(/^100\(/);
    const inner = result.slice(4, -1);
    expect(inner.split(",")).toHaveLength(100);
  });

  test("[70,30] col stays 100 slots", () => {
    const result = weightedSplit([70, 30], "col", { mode: "literal" });
    expect(result).toMatch(/^100\(/);
  });

  test("[1,2,3,4] row stays 10 slots (already minimal)", () => {
    const result = weightedSplit([1, 2, 3, 4], "row", { mode: "literal" });
    expect(result).toMatch(/^10\[/);
    const inner = result.slice(3, -1);
    expect(inner.split(",")).toHaveLength(10);
    expect(inner.split(",")).toEqual([
      "1",
      "0", "1",
      "0", "0", "1",
      "0", "0", "0", "1",
    ]);
  });
});
