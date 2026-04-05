import { equalSplit } from "./equalSplit";

describe("equalSplit", () => {
  // ---- Basic cases ----

  test("equalSplit(1, 'col') returns single tile", () => {
    expect(equalSplit(1, "col")).toBe("1");
  });

  test("equalSplit(1, 'row') returns single tile", () => {
    expect(equalSplit(1, "row")).toBe("1");
  });

  test("equalSplit(2, 'col')", () => {
    expect(equalSplit(2, "col")).toBe("2(1,1)");
  });

  test("equalSplit(2, 'row')", () => {
    expect(equalSplit(2, "row")).toBe("2[1,1]");
  });

  test("equalSplit(3, 'col')", () => {
    expect(equalSplit(3, "col")).toBe("3(1,1,1)");
  });

  test("equalSplit(3, 'row')", () => {
    expect(equalSplit(3, "row")).toBe("3[1,1,1]");
  });

  test("equalSplit(4, 'col')", () => {
    expect(equalSplit(4, "col")).toBe("4(1,1,1,1)");
  });

  // ---- Custom claimant ----

  test("custom claimant applied to every slot", () => {
    expect(equalSplit(3, "col", "1{1}")).toBe("3(1{1},1{1},1{1})");
  });

  test("single slot with custom claimant returns claimant directly", () => {
    expect(equalSplit(1, "row", "1{1}")).toBe("1{1}");
  });

  test("nested expression as claimant", () => {
    expect(equalSplit(2, "row", "2(1,1)")).toBe("2[2(1,1),2(1,1)]");
  });

  // ---- Branding ----

  test("result is a string (branded M0String)", () => {
    expect(typeof equalSplit(3, "col")).toBe("string");
  });

  // ---- Invalid inputs ----

  test("count = 0 throws", () => {
    expect(() => equalSplit(0, "col")).toThrow(
      "equalSplit: count must be a positive integer, got 0",
    );
  });

  test("negative count throws", () => {
    expect(() => equalSplit(-2, "row")).toThrow(
      "equalSplit: count must be a positive integer, got -2",
    );
  });

  test("non-integer count throws", () => {
    expect(() => equalSplit(2.5, "col")).toThrow(
      "equalSplit: count must be a positive integer, got 2.5",
    );
  });
});
