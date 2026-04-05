import { isValidM0String } from "@m0saic/dsl";
import { measureSplitBySpan } from "./measureSplitBySpan";

function expectValid(s: string) {
  expect(typeof s).toBe("string");
  expect(isValidM0String(s)).toBe(true);
}

function countChar(s: string, ch: string) {
  const re = new RegExp(ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return (s.match(re) ?? []).length;
}

function countClaimants(s: string) {
  const re = /(^|[,\[\]\(\)\{\}\-])(F|1)(?=($|[,\[\]\(\)\{\}\-]))/g;
  return (s.match(re) ?? []).length;
}

describe("measureSplitBySpan", () => {
  // ── Basic splits ──

  test("replaces first tile in a 2-split", () => {
    // "2(1,1)" → 2=0,(=1,1=2,,=3,1=4,)=5
    const out = measureSplitBySpan("2(1,1)", { start: 2, end: 3 }, "col", 4, [
      { a: 1, b: 2 },
    ]);
    expectValid(out);
    expect(out).toMatch(/^2\(4\(/);
    expect(countClaimants(out)).toBe(2); // 1 from measure + 1 from second child
  });

  test("replaces bare root tile", () => {
    const out = measureSplitBySpan("1", { start: 0, end: 1 }, "col", 6, [
      { a: 0, b: 2 },
      { a: 3, b: 5 },
    ]);
    expectValid(out);
    expect(out).toBe("6(0,0,1,0,0,1)");
  });

  test("row axis uses brackets", () => {
    const out = measureSplitBySpan("1", { start: 0, end: 1 }, "row", 4, [
      { a: 0, b: 3 },
    ]);
    expectValid(out);
    expect(out).toMatch(/^4\[/);
  });

  // ── Adjacent groups remain distinct ──

  test("adjacent groups produce separate claimants", () => {
    const out = measureSplitBySpan("1", { start: 0, end: 1 }, "col", 6, [
      { a: 0, b: 2 },
      { a: 3, b: 5 },
    ]);
    expectValid(out);
    expect(countClaimants(out)).toBe(2);
    expect(countChar(out, "-")).toBe(0);
  });

  test("singleton adjacent groups", () => {
    const out = measureSplitBySpan("1", { start: 0, end: 1 }, "col", 2, [
      { a: 0, b: 0 },
      { a: 1, b: 1 },
    ]);
    expectValid(out);
    expect(out).toBe("2(1,1)");
  });

  // ── Gaps ──

  test("disjoint groups produce gap sinks", () => {
    const out = measureSplitBySpan("1", { start: 0, end: 1 }, "col", 8, [
      { a: 1, b: 2 },
      { a: 5, b: 6 },
    ]);
    expectValid(out);
    expect(countClaimants(out)).toBe(2);
    expect(countChar(out, "-")).toBe(3); // gaps: [0], [3..4], [7]
  });

  // ── Overlap normalization ──

  test("overlapping ranges merge into one claimant", () => {
    const out = measureSplitBySpan("1", { start: 0, end: 1 }, "col", 10, [
      { a: 1, b: 4 },
      { a: 3, b: 6 },
    ]);
    expectValid(out);
    expect(countClaimants(out)).toBe(1);
  });

  // ── Overlay preservation ──

  test("preserves overlay on replaced tile", () => {
    // "1{1}" → 1=0,{=1,1=2,}=3 — body span [0,1)
    const out = measureSplitBySpan("1{1}", { start: 0, end: 1 }, "col", 4, [
      { a: 1, b: 2 },
    ]);
    expectValid(out);
    expect(out).toContain("{");
  });

  // ── Error cases ──

  test("throws on passthrough target", () => {
    // "3(1,0,1)" — 0 at span [4,5)
    expect(() =>
      measureSplitBySpan("3(1,0,1)", { start: 4, end: 5 }, "col", 4, [{ a: 0, b: 1 }]),
    ).toThrow(/rendered frame/i);
  });

  test("throws on multi-char span", () => {
    expect(() =>
      measureSplitBySpan("2(1,1)", { start: 0, end: 6 }, "col", 4, [{ a: 0, b: 1 }]),
    ).toThrow(/single primitive/i);
  });

  test("throws on N < 2", () => {
    expect(() =>
      measureSplitBySpan("1", { start: 0, end: 1 }, "col", 1, [{ a: 0, b: 0 }]),
    ).toThrow();
  });

  test("throws on empty ranges", () => {
    expect(() =>
      measureSplitBySpan("1", { start: 0, end: 1 }, "col", 4, []),
    ).toThrow();
  });

  test("throws on out-of-bounds range", () => {
    expect(() =>
      measureSplitBySpan("1", { start: 0, end: 1 }, "col", 4, [{ a: 0, b: 4 }]),
    ).toThrow();
  });

  test("throws on invalid input string", () => {
    expect(() =>
      measureSplitBySpan("invalid!", { start: 0, end: 1 }, "col", 4, [{ a: 0, b: 1 }]),
    ).toThrow(/invalid input/i);
  });
});
