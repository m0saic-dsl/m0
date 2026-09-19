import { isValidM0String } from "@m0saic/dsl";
import { getLayerCount } from "./getLayerCount";

/** Assert the example is actually a valid m0 — protects the test from
 *  drifting into nonsense as the grammar evolves. */
function assertValid(m0: string): string {
  if (!isValidM0String(m0)) {
    throw new Error(`test pre-condition: ${JSON.stringify(m0)} must be a valid m0 string`);
  }
  return m0;
}

describe("getLayerCount", () => {
  test("flat layouts (no overlays) → 1 layer (base only)", () => {
    expect(getLayerCount(assertValid("F"))).toBe(1);
    expect(getLayerCount(assertValid("2(F,F)"))).toBe(1);
    expect(getLayerCount(assertValid("3[F,F,F]"))).toBe(1);
  });

  test("single overlay → 2 layers", () => {
    expect(getLayerCount(assertValid("F{F}"))).toBe(2);
    expect(getLayerCount(assertValid("2(F{F},F)"))).toBe(2);
    expect(getLayerCount(assertValid("F{2(F,F)}"))).toBe(2);
  });

  test("nested overlays → count tracks the deepest nesting", () => {
    expect(getLayerCount(assertValid("F{F{F}}"))).toBe(3);
    expect(getLayerCount(assertValid("F{F{F{F}}}"))).toBe(4);
  });

  test("sibling overlays at the same depth count as one layer, not summed", () => {
    // Two F-children each with one overlay → max nesting is still 1.
    expect(getLayerCount(assertValid("2(F{F},F{F})"))).toBe(2);
  });

  test("invalid m0 → null (matches @m0saic/dsl's scan-helper convention)", () => {
    expect(getLayerCount("")).toBeNull();
    expect(getLayerCount("}F{F}")).toBeNull();
    expect(getLayerCount("F{")).toBeNull();
    expect(getLayerCount("not an m0")).toBeNull();
  });
});
