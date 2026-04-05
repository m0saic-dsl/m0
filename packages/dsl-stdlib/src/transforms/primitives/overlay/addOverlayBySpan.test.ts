import { addOverlayBySpan } from "./addOverlayBySpan";

describe("addOverlayBySpan", () => {
  test("adds overlay to the first tile", () => {
    // "2(1,1)" — first 1 is at span [2,3)
    expect(addOverlayBySpan("2(1,1)", { start: 2, end: 3 })).toBe("2(1{1},1)");
  });

  test("adds overlay to the second tile", () => {
    // "2(1,1)" — second 1 is at span [4,5)
    expect(addOverlayBySpan("2(1,1)", { start: 4, end: 5 })).toBe("2(1,1{1})");
  });

  test("no-op when tile already has overlay", () => {
    // "2(1{1},1)" — first 1 at span [2,3) already followed by {
    expect(addOverlayBySpan("2(1{1},1)", { start: 2, end: 3 })).toBe("2(1{1},1)");
  });

  test("adds overlay to a passthrough", () => {
    // "3(1,0,1)" — passthrough 0 at span [4,5)
    expect(addOverlayBySpan("3(1,0,1)", { start: 4, end: 5 })).toBe("3(1,0{1},1)");
  });

  test("adds overlay to a null tile", () => {
    // "3(1,-,1)" — null at span [4,5)
    expect(addOverlayBySpan("3(1,-,1)", { start: 4, end: 5 })).toBe("3(1,-{1},1)");
  });

  test("adds overlay to single tile", () => {
    expect(addOverlayBySpan("1", { start: 0, end: 1 })).toBe("1{1}");
  });

  test("throws on invalid span (start >= end)", () => {
    expect(() => addOverlayBySpan("1", { start: 1, end: 1 })).toThrow(/invalid/i);
  });

  test("throws on out-of-bounds span", () => {
    expect(() => addOverlayBySpan("1", { start: 0, end: 5 })).toThrow(/invalid/i);
  });

  test("throws on negative span", () => {
    expect(() => addOverlayBySpan("1", { start: -1, end: 0 })).toThrow(/invalid/i);
  });

  test("throws on invalid m0saic input", () => {
    expect(() => addOverlayBySpan("((", { start: 0, end: 1 })).toThrow();
  });
});
