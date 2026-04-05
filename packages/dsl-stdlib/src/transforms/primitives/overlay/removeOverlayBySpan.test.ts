import { removeOverlayBySpan } from "./removeOverlayBySpan";

describe("removeOverlayBySpan", () => {
  test("removes overlay from the first tile", () => {
    // "2(1{F},1)" — first 1 is at span [2,3), overlay follows
    expect(removeOverlayBySpan("2(1{F},1)", { start: 2, end: 3 })).toBe("2(1,1)");
  });

  test("removes overlay from the second tile", () => {
    // "2(1,1{F})" — second 1 is at span [4,5)
    expect(removeOverlayBySpan("2(1,1{F})", { start: 4, end: 5 })).toBe("2(1,1)");
  });

  test("no-op when tile has no overlay", () => {
    // "2(1,1)" — first 1 at span [2,3) has no overlay
    expect(removeOverlayBySpan("2(1,1)", { start: 2, end: 3 })).toBe("2(1,1)");
  });

  test("removes overlay from a passthrough", () => {
    // "3(1,0{1},1)" — passthrough 0 at span [4,5)
    expect(removeOverlayBySpan("3(1,0{1},1)", { start: 4, end: 5 })).toBe("3(1,0,1)");
  });

  test("removes overlay from a null tile", () => {
    // "3(1,-{1},1)" — null at span [4,5)
    expect(removeOverlayBySpan("3(1,-{1},1)", { start: 4, end: 5 })).toBe("3(1,-,1)");
  });

  test("removes overlay from single tile", () => {
    expect(removeOverlayBySpan("1{1}", { start: 0, end: 1 })).toBe("1");
  });

  test("removes overlay with nested content", () => {
    // "2(1{2(1,1)},1)" — first 1 at span [2,3), overlay has nested layout
    expect(removeOverlayBySpan("2(1{2(1,1)},1)", { start: 2, end: 3 })).toBe("2(1,1)");
  });

  test("throws on invalid span (start >= end)", () => {
    expect(() => removeOverlayBySpan("1", { start: 1, end: 1 })).toThrow(/invalid/i);
  });

  test("throws on out-of-bounds span", () => {
    expect(() => removeOverlayBySpan("1", { start: 0, end: 5 })).toThrow(/invalid/i);
  });

  test("throws on negative span", () => {
    expect(() => removeOverlayBySpan("1", { start: -1, end: 0 })).toThrow(/invalid/i);
  });

  test("throws on invalid m0saic input", () => {
    expect(() => removeOverlayBySpan("((", { start: 0, end: 1 })).toThrow();
  });
});
