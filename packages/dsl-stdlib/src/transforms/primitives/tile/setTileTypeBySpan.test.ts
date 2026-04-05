import { setTileTypeBySpan } from "./setTileTypeBySpan";

describe("setTileTypeBySpan", () => {
  // ── Basic replacements ──
  // Positions:  "3(1,0,1)" → 3=0, (=1, 1=2, ,=3, 0=4, ,=5, 1=6, )=7

  test("changes a passthrough to null", () => {
    expect(setTileTypeBySpan("3(1,0,1)", { start: 4, end: 5 }, "-")).toBe("3(1,-,1)");
  });

  test("changes a tile to passthrough", () => {
    // "3(1,1,1)" → 3=0,(=1,1=2,,=3,1=4,,=5,1=6,)=7
    // Change first tile to passthrough — remaining tiles claim space
    expect(setTileTypeBySpan("3(1,1,1)", { start: 2, end: 3 }, ">")).toBe("3(0,1,1)");
  });

  test("changes a null to tile", () => {
    // "3(1,-,1)" → 3=0, (=1, 1=2, ,=3, -=4, ,=5, 1=6, )=7
    expect(setTileTypeBySpan("3(1,-,1)", { start: 4, end: 5 }, "F")).toBe("3(1,1,1)");
  });

  test("changes a tile to null", () => {
    // "2(1,1)" → first 1 at index 2
    expect(setTileTypeBySpan("2(1,1)", { start: 2, end: 3 }, "-")).toBe("2(-,1)");
  });

  // ── Canonicalization ──

  test("canonicalizes input before applying span", () => {
    // "2(F,F)" canonicalizes to "2(1,1)" — span refers to canonical positions
    expect(setTileTypeBySpan("2(F,F)", { start: 2, end: 3 }, ">")).toBe("2(0,1)");
  });

  // ── Nested structures ──

  test("replaces inside nested structure", () => {
    // "2(1,2[1,1])" → 2=0,(=1,1=2,,=3,2=4,[=5,1=6,,=7,1=8,]=9,)=10
    expect(setTileTypeBySpan("2(1,2[1,1])", { start: 8, end: 9 }, "-")).toBe("2(1,2[1,-])");
  });

  // ── Overlay targets ──

  test("replaces inside an overlay body", () => {
    // "1{2(1,1)}" → 1=0,{=1,2=2,(=3,1=4,,=5,1=6,)=7,}=8
    expect(setTileTypeBySpan("1{2(1,1)}", { start: 6, end: 7 }, "-")).toBe("1{2(1,-)}");
  });

  // ── Error cases ──

  test("throws on span wider than 1", () => {
    expect(() => setTileTypeBySpan("2(1,1)", { start: 0, end: 2 }, "F")).toThrow(
      /single primitive/i,
    );
  });

  test("throws on out-of-bounds span", () => {
    expect(() => setTileTypeBySpan("2(1,1)", { start: 10, end: 11 }, "F")).toThrow(
      /invalid.*string length/i,
    );
  });

  test("throws on non-primitive character at span", () => {
    // "2(1,1)" — '(' is at index 1
    expect(() => setTileTypeBySpan("2(1,1)", { start: 1, end: 2 }, "F")).toThrow(
      /leaf primitive/i,
    );
  });

  test("throws on invalid input string", () => {
    expect(() => setTileTypeBySpan("invalid!", { start: 0, end: 1 }, "F")).toThrow(
      /invalid input/i,
    );
  });

  test("throws when replacement produces invalid m0saic", () => {
    // "1" (bare tile) → changing to "-" makes it a bare null, which is invalid
    expect(() => setTileTypeBySpan("1", { start: 0, end: 1 }, "-")).toThrow();
  });
});
