import { areM0StringsCanonicalEqual, areM0StringsFrameEqual } from "./equality";

// ── Canonical equality ───────────────────────────────────────────

describe("areM0StringsCanonicalEqual", () => {
  test("identical strings are equal", () => {
    expect(areM0StringsCanonicalEqual("2(1,1)", "2(1,1)")).toBe(true);
  });

  test("whitespace differences are normalized away", () => {
    expect(areM0StringsCanonicalEqual("2( 1 , 1 )", "2(1,1)")).toBe(true);
  });

  test("F/1 alias normalized", () => {
    expect(areM0StringsCanonicalEqual("2(F,F)", "2(1,1)")).toBe(true);
  });

  test("> /0 alias normalized", () => {
    expect(areM0StringsCanonicalEqual("3(>,1,1)", "3(0,1,1)")).toBe(true);
  });

  test("mixed aliases and whitespace", () => {
    expect(areM0StringsCanonicalEqual("3( F , > , F )", "3(1,0,1)")).toBe(true);
  });

  test("different structures are not equal", () => {
    expect(areM0StringsCanonicalEqual("2(1,1)", "3(1,1,1)")).toBe(false);
  });

  test("same tokens different nesting not equal", () => {
    expect(areM0StringsCanonicalEqual("2(1,2[1,1])", "2(2[1,1],1)")).toBe(false);
  });

  test("single tile vs split not equal", () => {
    expect(areM0StringsCanonicalEqual("1", "2(1,1)")).toBe(false);
  });

  test("empty strings are canonically equal", () => {
    expect(areM0StringsCanonicalEqual("", "")).toBe(true);
  });
});

// ── Frame/logical equality ───────────────────────────────────────

describe("areM0StringsFrameEqual", () => {
  test("identical strings produce same frames", () => {
    expect(areM0StringsFrameEqual("2(1,1)", "2(1,1)")).toBe(true);
  });

  test("alias differences produce same frames", () => {
    expect(areM0StringsFrameEqual("2(F,F)", "2(1,1)")).toBe(true);
  });

  test("whitespace differences produce same frames", () => {
    expect(areM0StringsFrameEqual("2( 1, 1 )", "2(1,1)")).toBe(true);
  });

  test("single tile equality", () => {
    expect(areM0StringsFrameEqual("1", "1")).toBe(true);
  });

  test("different frame count not equal", () => {
    expect(areM0StringsFrameEqual("2(1,1)", "3(1,1,1)")).toBe(false);
  });

  test("same frame count different geometry not equal", () => {
    // 2(1,1) = two 50% cols; 5(0,0,0,1,1) = one 80% col + one 20% col
    expect(areM0StringsFrameEqual("2(1,1)", "5(0,0,0,1,1)")).toBe(false);
  });

  test("obviously different layouts not equal", () => {
    expect(areM0StringsFrameEqual("2(1,1)", "2[1,1]")).toBe(false);
  });

  test("same visual coverage but different frame ORDER is not equal", () => {
    // 2(1,2[1,1]) has frames: left half, top-right quarter, bottom-right quarter
    // 2(2[1,1],1) has frames: top-left quarter, bottom-left quarter, right half
    // Same rectangles exist but in different order
    expect(areM0StringsFrameEqual("2(1,2[1,1])", "2(2[1,1],1)")).toBe(false);
  });

  test("nested structures with same frame output", () => {
    expect(areM0StringsFrameEqual(
      "2[2(1,1),2(1,1)]",
      "2[2(F,F),2(F,F)]",
    )).toBe(true);
  });

  test("overlay does not change frame geometry equality", () => {
    // 1{1} has 2 frames: base (full canvas) and overlay (full canvas)
    expect(areM0StringsFrameEqual("1{1}", "1{1}")).toBe(true);
  });

  test("overlay vs no overlay not equal (different frame count)", () => {
    expect(areM0StringsFrameEqual("1", "1{1}")).toBe(false);
  });

  // ── The interesting case: canonical != but frame == ──

  test("different passthrough ratios produce different geometry", () => {
    // 3(0,1,1): 2:1 ratio (frame 1 = 67%, frame 2 = 33%)
    // 5(0,0,0,1,1): 4:1 ratio (frame 1 = 80%, frame 2 = 20%)
    // At shared min resolution (5px): 3(0,1,1) gives 3+2, 5(0,0,0,1,1) gives 4+1
    expect(areM0StringsCanonicalEqual("3(0,1,1)", "5(0,0,0,1,1)")).toBe(false);
    expect(areM0StringsFrameEqual("3(0,1,1)", "5(0,0,0,1,1)")).toBe(false);
  });

  test("canonical not equal but frame equal — passthrough encoding variants", () => {
    // 4(0,1,0,1) and 2(1,1) both produce 2 frames.
    // 4(0,1,0,1): frame 1 gets 2/4 = 50%, frame 2 gets 2/4 = 50%
    // 2(1,1): frame 1 gets 50%, frame 2 gets 50%
    // Same geometry! Different canonical form.
    expect(areM0StringsCanonicalEqual("4(0,1,0,1)", "2(1,1)")).toBe(false);
    expect(areM0StringsFrameEqual("4(0,1,0,1)", "2(1,1)")).toBe(true);
  });

  test("canonical not equal but frame equal — row encoding variant", () => {
    // 6[0,0,1,0,0,1] = 2 frames each 50% height
    // 2[1,1] = 2 frames each 50% height
    expect(areM0StringsCanonicalEqual("6[0,0,1,0,0,1]", "2[1,1]")).toBe(false);
    expect(areM0StringsFrameEqual("6[0,0,1,0,0,1]", "2[1,1]")).toBe(true);
  });

  // ── Edge cases ──

  test("complex nested equality", () => {
    expect(areM0StringsFrameEqual(
      "2(3[1,1,1],2[1,1])",
      "2(3[1,1,1],2[1,1])",
    )).toBe(true);
  });

  test("with nulls — same structure", () => {
    expect(areM0StringsFrameEqual("3(1,-,1)", "3(1,-,1)")).toBe(true);
  });

  test("with nulls — null position differs", () => {
    // 3(1,-,1): frame at col 0, gap at col 1, frame at col 2
    // 3(-,1,1): gap at col 0, frame at col 1, frame at col 2
    expect(areM0StringsFrameEqual("3(1,-,1)", "3(-,1,1)")).toBe(false);
  });
});
