import { replaceNodeByLogicalIndex } from "./replaceNodeByLogicalIndex";

describe("replaceNodeByLogicalIndex", () => {
  // ── Spec examples ──

  test("replace second rendered frame (skipping passthrough)", () => {
    // "3(F,>,F)" canonical "3(1,0,1)" — logical 0=first 1, logical 1=second 1
    expect(replaceNodeByLogicalIndex("3(F,>,F)", 1, "2(F,F)")).toBe(
      "3(1,0,2(1,1))",
    );
  });

  test("replace tile with overlay — overlay preserved", () => {
    // "F{F}" canonical "1{1}" — logical 0 is the base tile
    expect(replaceNodeByLogicalIndex("F{F}", 0, "2(F,F)")).toBe("2(1,1){1}");
  });

  test("out-of-range index returns null", () => {
    expect(replaceNodeByLogicalIndex("3(F,>,F)", 5, "F")).toBeNull();
  });

  // ── Basic replacements ──

  test("replace first tile in a split", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", 0, "3[1,1,1]")).toBe(
      "2(3[1,1,1],1)",
    );
  });

  test("replace second tile in a split", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", 1, "3[1,1,1]")).toBe(
      "2(1,3[1,1,1])",
    );
  });

  test("replace sole root tile", () => {
    expect(replaceNodeByLogicalIndex("1", 0, "2(1,1)")).toBe("2(1,1)");
  });

  test("replace with passthrough", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", 0, ">")).toBe("2(0,1)");
  });

  test("replace with null", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", 0, "-")).toBe("2(-,1)");
  });

  // ── Passthrough / null skipping ──

  test("passthroughs are not counted", () => {
    // "3(1,0,1)" — logical 0=first 1, logical 1=last 1
    expect(replaceNodeByLogicalIndex("3(1,0,1)", 0, "2(1,1)")).toBe(
      "3(2(1,1),0,1)",
    );
  });

  test("nulls are not counted", () => {
    // "3(1,-,1)" — logical 0=first 1, logical 1=last 1
    expect(replaceNodeByLogicalIndex("3(1,-,1)", 1, "2(1,1)")).toBe(
      "3(1,-,2(1,1))",
    );
  });

  // ── Nested structures ──

  test("replace tile inside nested group", () => {
    // "2(1,2[1,1])" — logical 0=outer 1, logical 1=inner first 1, logical 2=inner second 1
    expect(replaceNodeByLogicalIndex("2(1,2[1,1])", 2, "F")).toBe(
      "2(1,2[1,1])",
    );
  });

  test("replace deep nested tile", () => {
    // "2(2(1,1),1)" — logical 0=first inner, 1=second inner, 2=outer last
    expect(replaceNodeByLogicalIndex("2(2(1,1),1)", 1, "3(1,1,1)")).toBe(
      "2(2(1,3(1,1,1)),1)",
    );
  });

  // ── Overlay handling ──

  test("overlay on non-target tiles left intact", () => {
    // "2(1{1},1)" — logical 0=base 1, logical 1=overlay 1, logical 2=second child 1
    expect(replaceNodeByLogicalIndex("2(1{1},1)", 2, "2(1,1)")).toBe(
      "2(1{1},2(1,1))",
    );
  });

  test("overlay inside overlay body — tile counting works", () => {
    // "1{2(1,1)}" — base is logical 0, overlay tiles are logical 1 and 2
    expect(replaceNodeByLogicalIndex("1{2(1,1)}", 1, "3(1,1,1)")).toBe(
      "1{2(3(1,1,1),1)}",
    );
  });

  // ── Canonicalization ──

  test("F in input is canonicalized", () => {
    expect(replaceNodeByLogicalIndex("2(F,F)", 0, "1")).toBe("2(1,1)");
  });

  test("F in replacement is canonicalized", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", 0, "F")).toBe("2(1,1)");
  });

  test("> in replacement is canonicalized to 0", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", 0, ">")).toBe("2(0,1)");
  });

  // ── Pretty output ──

  test("opts.output = pretty returns pretty-printed string", () => {
    const result = replaceNodeByLogicalIndex("2(1,1)", 0, "2[1,1]", {
      output: "pretty",
    });
    expect(result).not.toBeNull();
    expect(result!).toContain("F");
  });

  // ── Edge / error cases ──

  test("negative index returns null", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", -1, "1")).toBeNull();
  });

  test("NaN index returns null", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", NaN, "1")).toBeNull();
  });

  test("Infinity index returns null", () => {
    expect(replaceNodeByLogicalIndex("2(1,1)", Infinity, "1")).toBeNull();
  });

  test("throws on invalid input string", () => {
    expect(() =>
      replaceNodeByLogicalIndex("invalid!", 0, "1"),
    ).toThrow(/invalid input/i);
  });

  test("throws when replacement produces invalid m0saic", () => {
    expect(() => replaceNodeByLogicalIndex("2(1,1)", 0, "((")).toThrow();
  });
});
