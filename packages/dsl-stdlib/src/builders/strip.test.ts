import { strip } from "./strip";

describe("strip", () => {
  // ---- Basic: no gutters ----

  test("single cell, weight 1", () => {
    expect(strip(1, "col", { cellWeight: 1 })).toBe("1");
  });

  test("single cell, weight 1, row axis", () => {
    expect(strip(1, "row", { cellWeight: 1 })).toBe("1");
  });

  test("3 cells, weight 1, col axis", () => {
    expect(strip(3, "col", { cellWeight: 1 })).toBe("3(1,1,1)");
  });

  test("3 cells, weight 1, row axis", () => {
    expect(strip(3, "row", { cellWeight: 1 })).toBe("3[1,1,1]");
  });

  test("2 cells, weight 3 — passthrough expansion", () => {
    expect(strip(2, "col", { cellWeight: 3 })).toBe("6(0,0,1,0,0,1)");
  });

  test("4 cells, weight 1", () => {
    expect(strip(4, "row", { cellWeight: 1 })).toBe("4[1,1,1,1]");
  });

  // ---- Gutters: inner only ----

  test("3 cells with inner gutters, weight 1", () => {
    expect(strip(3, "col", { cellWeight: 1, gutterWeight: 1 })).toBe(
      "5(1,-,1,-,1)",
    );
  });

  test("2 cells with inner gutters, row axis", () => {
    expect(strip(2, "row", { cellWeight: 1, gutterWeight: 1 })).toBe(
      "3[1,-,1]",
    );
  });

  test("single cell with inner gutters — no gutters emitted", () => {
    // With count=1, there are no inner gutters (nothing between a single cell)
    expect(strip(1, "col", { cellWeight: 1, gutterWeight: 5 })).toBe("1");
  });

  test("3 cells, weighted cells and gutters", () => {
    // cellWeight=2, gutterWeight=1 → 2 cells @ 2, 2 gutters @ 1 = 8 total
    expect(strip(3, "col", { cellWeight: 2, gutterWeight: 1 })).toBe(
      "8(0,1,-,0,1,-,0,1)",
    );
  });

  // ---- Gutters: outer ----

  test("2 cells with outer gutters", () => {
    expect(
      strip(2, "col", { cellWeight: 1, gutterWeight: 1, outerGutters: true }),
    ).toBe("5(-,1,-,1,-)");
  });

  test("single cell with outer gutters", () => {
    expect(
      strip(1, "col", { cellWeight: 1, gutterWeight: 1, outerGutters: true }),
    ).toBe("3(-,1,-)");
  });

  test("3 cells, row axis, with outer gutters", () => {
    expect(
      strip(3, "row", { cellWeight: 1, gutterWeight: 1, outerGutters: true }),
    ).toBe("7[-,1,-,1,-,1,-]");
  });

  test("outer gutters ignored when gutterWeight is 0", () => {
    expect(
      strip(3, "col", { cellWeight: 1, gutterWeight: 0, outerGutters: true }),
    ).toBe("3(1,1,1)");
  });

  // ---- Custom claimant ----

  test("custom claimant", () => {
    expect(strip(2, "col", { cellWeight: 1, claimant: "1{1}" })).toBe(
      "2(1{1},1{1})",
    );
  });

  test("nested expression as claimant", () => {
    expect(strip(2, "row", { cellWeight: 1, claimant: "2(1,1)" })).toBe(
      "2[2(1,1),2(1,1)]",
    );
  });

  test("claimant with weighted cells", () => {
    expect(strip(2, "col", { cellWeight: 3, claimant: "1{1}" })).toBe(
      "6(0,0,1{1},0,0,1{1})",
    );
  });

  test("claimant with gutters", () => {
    expect(
      strip(2, "row", { cellWeight: 1, gutterWeight: 1, claimant: "1{1}" }),
    ).toBe("3[1{1},-,1{1}]");
  });

  // ---- Branding ----

  test("result is a string (branded M0String)", () => {
    expect(typeof strip(3, "col", { cellWeight: 1 })).toBe("string");
  });

  // ---- Realistic usage ----

  test("magazine sidebar pattern: 2 tiles, row, weighted, with gutter", () => {
    const result = strip(2, "row", { cellWeight: 50, gutterWeight: 5 });
    // 2 cells @ 50 + 1 gutter @ 5 = 105 total
    expect(result).toMatch(/^105\[/);
    expect(result).toMatch(/\]$/);
  });

  test("magazine bottom strip: 3 tiles, col, weighted, with gutter", () => {
    const result = strip(3, "col", { cellWeight: 50, gutterWeight: 5 });
    // 3 cells @ 50 + 2 gutters @ 5 = 160 total
    expect(result).toMatch(/^160\(/);
    expect(result).toMatch(/\)$/);
  });

  test("grid row pattern: 4 cells, col, with gutter and outer gutters", () => {
    const result = strip(4, "col", {
      cellWeight: 10,
      gutterWeight: 2,
      outerGutters: true,
    });
    // 4 cells @ 10 + 5 gutters @ 2 = 50 total
    expect(result).toMatch(/^50\(/);
  });

  // ---- Invalid inputs ----

  test("count = 0 throws", () => {
    expect(() => strip(0, "col", { cellWeight: 1 })).toThrow(
      /count must be a positive integer/,
    );
  });

  test("negative count throws", () => {
    expect(() => strip(-1, "col", { cellWeight: 1 })).toThrow(
      /count must be a positive integer/,
    );
  });

  test("non-integer count throws", () => {
    expect(() => strip(2.5, "col", { cellWeight: 1 })).toThrow(
      /count must be a positive integer/,
    );
  });

  test("cellWeight = 0 throws", () => {
    expect(() => strip(2, "col", { cellWeight: 0 })).toThrow(
      /cellWeight must be a positive integer/,
    );
  });

  test("negative cellWeight throws", () => {
    expect(() => strip(2, "col", { cellWeight: -5 })).toThrow(
      /cellWeight must be a positive integer/,
    );
  });

  test("non-integer cellWeight throws", () => {
    expect(() => strip(2, "col", { cellWeight: 1.5 })).toThrow(
      /cellWeight must be a positive integer/,
    );
  });

  test("negative gutterWeight throws", () => {
    expect(() => strip(2, "col", { cellWeight: 1, gutterWeight: -1 })).toThrow(
      /gutterWeight must be a non-negative integer/,
    );
  });

  test("non-integer gutterWeight throws", () => {
    expect(() =>
      strip(2, "col", { cellWeight: 1, gutterWeight: 0.5 }),
    ).toThrow(/gutterWeight must be a non-negative integer/);
  });
});
