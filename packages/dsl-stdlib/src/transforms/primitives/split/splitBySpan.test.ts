import { splitBySpan } from "./splitBySpan";

describe("splitBySpan", () => {
  // ── Basic splits ──

  test("splits first tile in a 3-split", () => {
    // "3(1,0,1)" → 3=0,(=1,1=2,,=3,0=4,,=5,1=6,)=7
    expect(splitBySpan("3(1,0,1)", { start: 2, end: 3 }, "col", 2)).toBe(
      "3(2(1,1),0,1)",
    );
  });

  test("splits last tile in a 3-split", () => {
    expect(splitBySpan("3(1,0,1)", { start: 6, end: 7 }, "row", 3)).toBe(
      "3(1,0,3[1,1,1])",
    );
  });

  test("splits bare root tile", () => {
    expect(splitBySpan("1", { start: 0, end: 1 }, "col", 2)).toBe("2(1,1)");
  });

  test("splits into rows", () => {
    expect(splitBySpan("2(1,1)", { start: 2, end: 3 }, "row", 2)).toBe(
      "2(2[1,1],1)",
    );
  });

  // ── Weighted splits ──

  test("weighted split uses optimized encoding by default", () => {
    const result = splitBySpan("1", { start: 0, end: 1 }, "col", 2, [60, 40]);
    // GCD(60,40) = 20, reduced to [3,2], total = 5
    expect(result).toBe("5(0,0,1,0,1)");
  });

  test("weighted split falls back to uniform when weights length mismatches", () => {
    expect(
      splitBySpan("1", { start: 0, end: 1 }, "col", 3, [50, 50]),
    ).toBe("3(1,1,1)");
  });

  // ── Overlay preservation ──

  test("preserves overlay on split tile", () => {
    // "1{1}" → 1=0,{=1,1=2,}=3 — split body at [0,1)
    expect(splitBySpan("1{1}", { start: 0, end: 1 }, "col", 2)).toBe(
      "2(1,1){1}",
    );
  });

  test("preserves nested overlay content", () => {
    // "1{2(1,1)}" — split body at [0,1)
    expect(splitBySpan("1{2(1,1)}", { start: 0, end: 1 }, "row", 3)).toBe(
      "3[1,1,1]{2(1,1)}",
    );
  });

  // ── Canonicalization ──

  test("canonicalizes F in input", () => {
    // "2(F,F)" → canonical "2(1,1)" — span [2,3) is first tile
    expect(splitBySpan("2(F,F)", { start: 2, end: 3 }, "col", 2)).toBe(
      "2(2(1,1),1)",
    );
  });

  // ── Pretty output ──

  test("opts.output = pretty returns pretty-printed string", () => {
    const result = splitBySpan("2(1,1)", { start: 2, end: 3 }, "col", 2, undefined, {
      output: "pretty",
    });
    expect(result).toContain("F");
  });

  // ── Error cases ──

  test("throws on passthrough target", () => {
    // "3(1,0,1)" — 0 at span [4,5)
    expect(() =>
      splitBySpan("3(1,0,1)", { start: 4, end: 5 }, "col", 2),
    ).toThrow(/rendered frame/i);
  });

  test("throws on null target", () => {
    // "2(1,-)" — - at span [4,5)
    // canonical "2(1,-)" → 2=0,(=1,1=2,,=3,-=4,)=5
    expect(() =>
      splitBySpan("2(1,-)", { start: 4, end: 5 }, "col", 2),
    ).toThrow(/rendered frame/i);
  });

  test("throws on multi-char span", () => {
    expect(() =>
      splitBySpan("2(1,1)", { start: 0, end: 6 }, "col", 2),
    ).toThrow(/single primitive/i);
  });

  test("throws on count < 2", () => {
    expect(() =>
      splitBySpan("2(1,1)", { start: 2, end: 3 }, "col", 1),
    ).toThrow(/count/i);
  });

  test("throws on out-of-bounds span", () => {
    expect(() =>
      splitBySpan("2(1,1)", { start: 10, end: 11 }, "col", 2),
    ).toThrow(/invalid/i);
  });

  test("throws on invalid input string", () => {
    expect(() =>
      splitBySpan("invalid!", { start: 0, end: 1 }, "col", 2),
    ).toThrow(/invalid input/i);
  });
});
