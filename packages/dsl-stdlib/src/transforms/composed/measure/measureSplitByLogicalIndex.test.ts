import { isValidM0String } from "@m0saic/dsl";
import { measureSplitByLogicalIndex } from "./measureSplitByLogicalIndex";

function expectValid(s: string) {
  expect(typeof s).toBe("string");
  expect(isValidM0String(s)).toBe(true);
}

function escapeRegExp(lit: string) {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countChar(s: string, ch: string) {
  const re = new RegExp(escapeRegExp(ch), "g");
  return (s.match(re) ?? []).length;
}

// Count "frame claimants" in pretty (F) OR canonical (1) form.
// This avoids false failures if implementation chooses canonical tokens.
function countClaimants(s: string) {
    // Count delimiter-bounded "F" or "1" tokens only (not digits inside numbers like "10(").
    const re = /(^|[,\[\]\(\)\{\}\-])(F|1)(?=($|[,\[\]\(\)\{\}\-]))/g;
    return (s.match(re) ?? []).length;
  }

// Helper that asserts replacement position for the simple input `2(1,1)`
// without doing a full parse: we assert the prefix structure.
// We also tolerate whitespace (though your ops likely strip it).
function expectReplacedFirstChild(out: string, N: number, axis: "row" | "col") {
  const open = axis === "col" ? "\\(" : "\\[";
  // 2( N( ...   or 2( N[ ...
  const re = new RegExp(`^2\\(\\s*${N}${open}`);
  expect(out).toMatch(re);
}

function expectReplacedSecondChild(out: string, N: number, axis: "row" | "col") {
  const open = axis === "col" ? "\\(" : "\\[";
  // 2( 1, N( ...   or 2( 1, N[ ...
  // Note: input is canonical "1" so we assert "1" (not "F") here.
  // If your rewrite standardizes to "F", you can change "1" to "[F1]".
  const re = new RegExp(`^2\\(\\s*[F1]\\s*,\\s*${N}${open}`);
  expect(out).toMatch(re);
}

describe("measureSplitByLogicalIndex", () => {
  test("targetIndex is 0-based and replaces correct leaf", () => {
    const input = "2(1,1)";

    const out1 = measureSplitByLogicalIndex(input, 0, "col", 5, [{ a: 0, b: 1 }]);
    expectValid(out1);
    expectReplacedFirstChild(out1, 5, "col");

    const out2 = measureSplitByLogicalIndex(input, 1, "col", 5, [{ a: 0, b: 1 }]);
    expectValid(out2);
    expectReplacedSecondChild(out2, 5, "col");
  });

  test("single range validates and produces 1 claimant and 2 gap sinks", () => {
    const out = measureSplitByLogicalIndex("1", 0, "col", 10, [{ a: 2, b: 4 }]);
    expectValid(out);

    // Should replace the root tile with a 10(...)
    expect(out.startsWith("10(")).toBe(true);

    // One kept range => 1 claimant (F or 1)
    expect(countClaimants(out)).toBe(1);

    // For N=10, kept [2..4] => leading gap [0..1], trailing gap [5..9] => 2 sinks
    expect(countChar(out, "-")).toBe(2);
  });

  test("two disjoint ranges => 2 claimants and 3 gap sinks", () => {
    const out = measureSplitByLogicalIndex("1", 0, "col", 10, [
      { a: 1, b: 2 },
      { a: 6, b: 7 },
    ]);
    expectValid(out);

    // Two kept ranges => 2 claimants
    expect(countClaimants(out)).toBe(2);

    // gaps: [0..0], [3..5], [8..9] => 3 sinks
    expect(countChar(out, "-")).toBe(3);
  });

  test("adjacent ranges remain distinct groups => 2 claimants", () => {
    const out = measureSplitByLogicalIndex("1", 0, "col", 10, [
      { a: 1, b: 2 },
      { a: 3, b: 4 }, // adjacent — stays distinct, NOT merged
    ]);
    expectValid(out);
    expect(countClaimants(out)).toBe(2);

    // gaps: [0..0], [5..9] => 2 sinks
    expect(countChar(out, "-")).toBe(2);
  });

  test("overlapping ranges are merged (normalization) => 1 claimant", () => {
    const out = measureSplitByLogicalIndex("1", 0, "col", 10, [
      { a: 1, b: 4 },
      { a: 3, b: 6 }, // overlap -> should normalize to [1..6]
    ]);
    expectValid(out);
    expect(countClaimants(out)).toBe(1);
  });

  test("full coverage produces no '-' sinks", () => {
    const out = measureSplitByLogicalIndex("1", 0, "row", 10, [{ a: 0, b: 9 }]);
    expectValid(out);

    // One range covering all => exactly 1 claimant, no gaps
    expect(countClaimants(out)).toBe(1);
    expect(countChar(out, "-")).toBe(0);
  });

  // ── New: adjacent distinct group examples ──

  test("two adjacent groups covering all slots => 2 claimants, no gaps", () => {
    // N=6, groups [{a:0,b:2},{a:3,b:5}] => 6(>,>,F,>,>,F)
    const out = measureSplitByLogicalIndex("1", 0, "col", 6, [
      { a: 0, b: 2 },
      { a: 3, b: 5 },
    ]);
    expectValid(out);
    expect(out).toBe("6(0,0,1,0,0,1)");
    expect(countClaimants(out)).toBe(2);
    expect(countChar(out, "-")).toBe(0);
  });

  test("singleton adjacent groups => N(F,F)", () => {
    // N=2, groups [{a:0,b:0},{a:1,b:1}] => 2(F,F)
    const out = measureSplitByLogicalIndex("1", 0, "col", 2, [
      { a: 0, b: 0 },
      { a: 1, b: 1 },
    ]);
    expectValid(out);
    expect(out).toBe("2(1,1)");
    expect(countClaimants(out)).toBe(2);
  });

  test("two groups with a real gap", () => {
    // N=8, groups [{a:1,b:2},{a:5,b:6}]
    // Expected tokens: [-,>,F,>,-,>,F,-]
    const out = measureSplitByLogicalIndex("1", 0, "col", 8, [
      { a: 1, b: 2 },
      { a: 5, b: 6 },
    ]);
    expectValid(out);
    expect(countClaimants(out)).toBe(2);
    expect(countChar(out, "-")).toBe(3); // gaps: [0], [3..4], [7]
  });

  test("three adjacent singleton groups", () => {
    // N=3, groups [{a:0,b:0},{a:1,b:1},{a:2,b:2}]
    const out = measureSplitByLogicalIndex("1", 0, "row", 3, [
      { a: 0, b: 0 },
      { a: 1, b: 1 },
      { a: 2, b: 2 },
    ]);
    expectValid(out);
    expect(out).toBe("3[1,1,1]");
    expect(countClaimants(out)).toBe(3);
  });

  test("preserves overlay on replaced tile", () => {
    const out = measureSplitByLogicalIndex("1{1}", 0, "col", 4, [
      { a: 1, b: 2 },
    ]);
    expectValid(out);
    // The base tile gets replaced with the measure split,
    // and the overlay {1} is preserved
    expect(out).toContain("{");
  });

  // ── Error cases ──

  test("throws on N < 2", () => {
    expect(() =>
      measureSplitByLogicalIndex("1", 0, "col", 1, [{ a: 0, b: 0 }])
    ).toThrow();
  });

  test("throws on out-of-bounds", () => {
    expect(() =>
      measureSplitByLogicalIndex("1", 0, "col", 10, [{ a: 0, b: 10 }])
    ).toThrow();
  });

  test("throws on invalid range a > b", () => {
    expect(() =>
      measureSplitByLogicalIndex("1", 0, "col", 10, [{ a: 5, b: 4 }])
    ).toThrow();
  });

  test("throws on empty ranges", () => {
    expect(() =>
      measureSplitByLogicalIndex("1", 0, "col", 10, [])
    ).toThrow();
  });

  test("throws on targetIndex not found", () => {
    expect(() =>
      measureSplitByLogicalIndex("1", 5, "col", 4, [{ a: 0, b: 1 }])
    ).toThrow(/not found/i);
  });
});
