import { weightedTokens } from "./weightedTokens";

describe("weightedTokens", () => {
  // ---- Basic behaviour ----

  test("weight=1 returns only the claimant", () => {
    expect(weightedTokens(1, "1")).toEqual(["1"]);
    expect(weightedTokens(1, "-")).toEqual(["-"]);
    expect(weightedTokens(1, "1{1}")).toEqual(["1{1}"]);
  });

  test("weight=2 returns one zero then claimant", () => {
    expect(weightedTokens(2, "1")).toEqual(["0", "1"]);
  });

  test("weight=3 returns two zeros then claimant", () => {
    expect(weightedTokens(3, "1")).toEqual(["0", "0", "1"]);
  });

  test("weight=5 with complex claimant", () => {
    expect(weightedTokens(5, "1{1}")).toEqual(["0", "0", "0", "0", "1{1}"]);
  });

  test("weight=5 with spacer claimant", () => {
    expect(weightedTokens(5, "-")).toEqual(["0", "0", "0", "0", "-"]);
  });

  // ---- Output structure ----

  test("returned array length equals weight", () => {
    for (const w of [1, 2, 3, 5, 10, 50]) {
      expect(weightedTokens(w, "x")).toHaveLength(w);
    }
  });

  test("all elements except last are '0', last is the claimant", () => {
    const result = weightedTokens(6, "bar");
    expect(result.slice(0, -1)).toEqual(["0", "0", "0", "0", "0"]);
    expect(result[result.length - 1]).toBe("bar");
  });

  // ---- Edge / defensive: fractional & sub-1 weights ----

  test("fractional weight is floored", () => {
    expect(weightedTokens(3.7, "1")).toEqual(["0", "0", "1"]);
    expect(weightedTokens(1.9, "1")).toEqual(["1"]);
  });

  test("weight=0 is clamped to 1", () => {
    expect(weightedTokens(0, "1")).toEqual(["1"]);
  });

  test("negative weight is clamped to 1", () => {
    expect(weightedTokens(-5, "1")).toEqual(["1"]);
  });

  test("weight=0.5 floors to 0 then clamps to 1", () => {
    expect(weightedTokens(0.5, "-")).toEqual(["-"]);
  });

  // ---- Purity: no mutation between calls ----

  test("successive calls are independent", () => {
    const a = weightedTokens(3, "A");
    const b = weightedTokens(2, "B");
    expect(a).toEqual(["0", "0", "A"]);
    expect(b).toEqual(["0", "B"]);
  });
});
