import { replaceNodeBySpan } from "./replaceNodeBySpan";

describe("replaceNodeBySpan", () => {
  // ── User examples ──

  test("leaf without overlay — replace passthrough with group", () => {
    // "3(1,0,1)" → 3=0,(=1,1=2,,=3,0=4,,=5,1=6,)=7
    expect(replaceNodeBySpan("3(1,0,1)", { start: 4, end: 5 }, "2(1,1)")).toBe(
      "3(1,2(1,1),1)",
    );
  });

  test("leaf with overlay — overlay preserved", () => {
    // "1{1}" → 1=0,{=1,1=2,}=3
    expect(replaceNodeBySpan("1{1}", { start: 0, end: 1 }, "2(1,1)")).toBe(
      "2(1,1){1}",
    );
  });

  test("group with overlay — overlay preserved", () => {
    // "2(1,1){1}" → 2=0,(=1,1=2,,=3,1=4,)=5,{=6,1=7,}=8
    expect(replaceNodeBySpan("2(1,1){1}", { start: 0, end: 6 }, "1")).toBe(
      "1{1}",
    );
  });

  test("root replacement — no overlay", () => {
    // "2(1,1)" → 2=0,(=1,1=2,,=3,1=4,)=5
    expect(
      replaceNodeBySpan("2(1,1)", { start: 0, end: 6 }, "3(1,1,1)"),
    ).toBe("3(1,1,1)");
  });

  // ── Leaf replacements ──

  test("replace tile with tile (identity-like)", () => {
    // "2(1,1)" — first tile at [2,3)
    expect(replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, "1")).toBe(
      "2(1,1)",
    );
  });

  test("replace tile with passthrough", () => {
    expect(replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, "0")).toBe(
      "2(0,1)",
    );
  });

  test("replace tile with null", () => {
    expect(replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, "-")).toBe(
      "2(-,1)",
    );
  });

  test("replace tile with nested group", () => {
    expect(
      replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, "3[1,1,1]"),
    ).toBe("2(3[1,1,1],1)");
  });

  // ── Nested structures ──

  test("replace inner leaf in nested split", () => {
    // "2(1,2[1,1])" → 2=0,(=1,1=2,,=3,2=4,[=5,1=6,,=7,1=8,]=9,)=10
    expect(
      replaceNodeBySpan("2(1,2[1,1])", { start: 8, end: 9 }, "2(1,1)"),
    ).toBe("2(1,2[1,2(1,1)])");
  });

  test("replace nested group with a leaf", () => {
    // "2(1,2[1,1])" — inner group "2[1,1]" at span [4,10)
    expect(replaceNodeBySpan("2(1,2[1,1])", { start: 4, end: 10 }, "1")).toBe(
      "2(1,1)",
    );
  });

  // ── Overlay preservation ──

  test("overlay preserved when replacing leaf inside overlay body", () => {
    // "2(1{1},1)" → 2=0,(=1,1=2,{=3,1=4,}=5,,=6,1=7,)=8
    // The outer 1 at [2,3) has overlay {1}
    expect(
      replaceNodeBySpan("2(1{1},1)", { start: 2, end: 3 }, "3(1,1,1)"),
    ).toBe("2(3(1,1,1){1},1)");
  });

  test("overlay with nested content preserved", () => {
    // "1{2(1,1)}" → 1=0,{=1,2=2,(=3,1=4,,=5,1=6,)=7,}=8
    expect(
      replaceNodeBySpan("1{2(1,1)}", { start: 0, end: 1 }, "3[1,1,1]"),
    ).toBe("3[1,1,1]{2(1,1)}");
  });

  test("node without overlay — no overlay injected", () => {
    // "2(1,1)" — first tile at [2,3) has no overlay
    expect(replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, "1")).toBe(
      "2(1,1)",
    );
  });

  // ── Canonicalization ──

  test("F in input is canonicalized to 1", () => {
    // "2(F,F)" canonicalizes to "2(1,1)" — spans refer to canonical
    expect(replaceNodeBySpan("2(F,F)", { start: 2, end: 3 }, "1")).toBe(
      "2(1,1)",
    );
  });

  test("F in replacement is canonicalized to 1", () => {
    expect(replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, "F")).toBe(
      "2(1,1)",
    );
  });

  test("> in replacement is canonicalized to 0", () => {
    expect(replaceNodeBySpan("2(1,1)", { start: 2, end: 3 }, ">")).toBe(
      "2(0,1)",
    );
  });

  // ── Pretty output ──

  test("opts.output = pretty returns pretty-printed string", () => {
    const result = replaceNodeBySpan(
      "2(1,1)",
      { start: 2, end: 3 },
      "2[1,1]",
      { output: "pretty" },
    );
    // Pretty output uses F instead of 1
    expect(result).toContain("F");
  });

  // ── Error cases ──

  test("throws on invalid input string", () => {
    expect(() =>
      replaceNodeBySpan("invalid!", { start: 0, end: 1 }, "1"),
    ).toThrow(/invalid input/i);
  });

  test("throws on out-of-bounds span", () => {
    expect(() =>
      replaceNodeBySpan("2(1,1)", { start: 10, end: 12 }, "1"),
    ).toThrow(/invalid/i);
  });

  test("throws on negative span start", () => {
    expect(() =>
      replaceNodeBySpan("2(1,1)", { start: -1, end: 2 }, "1"),
    ).toThrow(/invalid/i);
  });

  test("throws on empty span (start >= end)", () => {
    expect(() =>
      replaceNodeBySpan("2(1,1)", { start: 3, end: 3 }, "1"),
    ).toThrow(/invalid/i);
  });

  test("throws when replacement produces invalid m0saic", () => {
    // Replacing the whole root with an invalid string
    expect(() =>
      replaceNodeBySpan("2(1,1)", { start: 0, end: 6 }, "(("),
    ).toThrow();
  });
});
