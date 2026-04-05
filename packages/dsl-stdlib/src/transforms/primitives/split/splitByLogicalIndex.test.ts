import { splitByLogicalIndex } from "./splitByLogicalIndex";

describe("splitByLogicalIndex (canonical m0saic)", () => {
  test("splits the 0th tile into cols", () => {
    expect(splitByLogicalIndex("1", 0, "col", 2)).toBe("2(1,1)");
  });

  test("splits the 1st tile in a flat list", () => {
    expect(splitByLogicalIndex("2(1,1)", 1, "row", 3)).toBe("2(1,3[1,1,1])");
  });

  test("counts tiles inside {} overlays (matches editor order)", () => {
    // orders: outer 1 = #0, inside overlay 1 = #1
    expect(splitByLogicalIndex("1{1}", 1, "col", 2)).toBe("1{2(1,1)}");
  });

  test("throws if targetIndex not found", () => {
    expect(() => splitByLogicalIndex("2(1,1)", 2, "col", 2)).toThrow(/not found/i);
  });

  test("throws on invalid count", () => {
    expect(() => splitByLogicalIndex("1", 0, "col", 1)).toThrow(/count/i);
  });
});

describe("splitByLogicalIndex (more cases) (canonical m0saic)", () => {
  test("preserves behavior with whitespace by stripping it", () => {
    expect(splitByLogicalIndex(" 2( 1 , 1 ) ", 1, "col", 2)).toBe("2(1,2(1,1))");
  });

  test("does not split multi-digit numbers (e.g. 10(...))", () => {
    // orders: only the inner 1's count, "10" itself is not a leaf "1"
    expect(splitByLogicalIndex("10(1,1,1,1,1,1,1,1,1,1)", 9, "row", 2)).toBe(
      "10(1,1,1,1,1,1,1,1,1,2[1,1])"
    );
  });

  test("can split when target is inside nested overlay inside container", () => {
    // order #0 = outer 1, #1 = container second child 1, #2 = overlay inner 1
    expect(splitByLogicalIndex("2(1,1{1})", 2, "col", 3)).toBe("2(1,1{3(1,1,1)})");
  });

  test("does not change punctuation/structure besides the replaced leaf", () => {
    // canonical uses 0 (not >)
    expect(splitByLogicalIndex("3[1,0,1]", 1, "col", 2)).toBe("3[1,0,2(1,1)]");
  });

  test("throws on invalid targetIndex", () => {
    expect(() => splitByLogicalIndex("1", -1, "col", 2)).toThrow(/targetIndex/i);
  });
});

// ── Optimized weighted (default) ─────────────────────────────────

describe("splitByLogicalIndex weighted optimized (default)", () => {
  it("[60,40] reduces to [3,2] → 5 slots", () => {
    const out = splitByLogicalIndex("1", 0, "col", 2, [60, 40]);
    // GCD(60,40) = 20, reduced to [3,2], total = 5
    expect(out).toBe("5(0,0,1,0,1)");
  });

  it("[50,50] reduces to equal split", () => {
    const out = splitByLogicalIndex("1", 0, "col", 2, [50, 50]);
    expect(out).toBe("2(1,1)");
  });

  it("[20,30,50] reduces by GCD=10 → [2,3,5]", () => {
    const out = splitByLogicalIndex("1", 0, "row", 3, [20, 30, 50]);
    // GCD=10, reduced to [2,3,5], total=10
    const expectedInner = [
      "0", "1",           // 2
      "0", "0", "1",      // 3
      "0", "0", "0", "0", "1",  // 5
    ].join(",");
    expect(out).toBe(`10[${expectedInner}]`);
  });

  it("[33,33,34] stays unchanged (GCD=1)", () => {
    const out = splitByLogicalIndex("1", 0, "col", 3, [33, 33, 34]);
    expect(out.startsWith("100(")).toBe(true);
  });

  it("falls back to uniform if weights length mismatches count", () => {
    const out = splitByLogicalIndex("1", 0, "col", 3, [50, 50]);
    expect(out).toBe("3(1,1,1)");
  });

  it("uniform split still works", () => {
    const out = splitByLogicalIndex("1", 0, "col", 3);
    expect(out).toBe("3(1,1,1)");
  });
});

// ── Literal weighted (opt-in) ────────────────────────────────────

describe("splitByLogicalIndex weighted literal", () => {
  it("[60,40] stays literal 100 slots", () => {
    const out = splitByLogicalIndex("1", 0, "col", 2, [60, 40], { weightMode: "literal" });
    expect(out.startsWith("100(")).toBe(true);
    const expectedInner = [
      ...Array(59).fill("0"),
      "1",
      ...Array(39).fill("0"),
      "1",
    ].join(",");
    expect(out).toBe(`100(${expectedInner})`);
  });

  it("[50,50] stays literal 100 slots", () => {
    const out = splitByLogicalIndex("1", 0, "col", 2, [50, 50], { weightMode: "literal" });
    expect(out.startsWith("100(")).toBe(true);
  });

  it("[20,30,50] stays literal 100 slots", () => {
    const out = splitByLogicalIndex("1", 0, "row", 3, [20, 30, 50], { weightMode: "literal" });
    const expectedInner = [
      ...Array(19).fill("0"),
      "1",
      ...Array(29).fill("0"),
      "1",
      ...Array(49).fill("0"),
      "1",
    ].join(",");
    expect(out).toBe(`100[${expectedInner}]`);
  });
});
