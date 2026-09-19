import { containedIn } from "./withinBounds";

describe("containedIn", () => {
  const outer = { x: 0, y: 0, width: 100, height: 100 };

  test("inner fully inside outer", () => {
    expect(containedIn({ x: 10, y: 10, width: 20, height: 20 }, outer)).toBe(true);
  });

  test("identical rects count as contained (edge-touching ok)", () => {
    expect(containedIn(outer, outer)).toBe(true);
  });

  test("inner exact-fits one edge of outer", () => {
    expect(containedIn({ x: 0, y: 0, width: 100, height: 50 }, outer)).toBe(true);
    expect(containedIn({ x: 50, y: 0, width: 50, height: 100 }, outer)).toBe(true);
  });

  test("inner extends past outer's right edge", () => {
    expect(containedIn({ x: 50, y: 0, width: 60, height: 100 }, outer)).toBe(false);
  });

  test("inner extends past outer's bottom edge", () => {
    expect(containedIn({ x: 0, y: 50, width: 100, height: 60 }, outer)).toBe(false);
  });

  test("inner starts above outer", () => {
    expect(containedIn({ x: 0, y: -10, width: 100, height: 50 }, outer)).toBe(false);
  });

  test("inner starts left of outer", () => {
    expect(containedIn({ x: -10, y: 0, width: 50, height: 100 }, outer)).toBe(false);
  });

  test("non-overlapping rects are not contained", () => {
    expect(containedIn({ x: 200, y: 200, width: 10, height: 10 }, outer)).toBe(false);
  });

  test("zero-area inner at an outer corner is still contained", () => {
    expect(containedIn({ x: 0, y: 0, width: 0, height: 0 }, outer)).toBe(true);
    expect(containedIn({ x: 100, y: 100, width: 0, height: 0 }, outer)).toBe(true);
  });
});
