import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import {
  measureSplit,
  type MeasureRange,
} from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goldenId(
  axis: "col" | "row",
  N: number,
  rangeLabel: string,
): string {
  return `measure-split__${axis}_${N}__${rangeLabel}`;
}

/**
 * Build a measure-split golden from a single root tile.
 * Applies measureSplit to "1" at logical index 0.
 */
function measureFromRoot(
  axis: "col" | "row",
  N: number,
  ranges: MeasureRange[],
): string {
  return measureSplit("1", { by: "logicalIndex", index: 0 }, { axis, count: N, ranges });
}

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — measureSplit transform
// ---------------------------------------------------------------------------

describe("measureSplit goldens", () => {
  // ---- Full range (baseline) ----

  test("col 6 — full range kept", () => {
    const m = measureFromRoot("col", 6, [{ a: 0, b: 5 }]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 6, "full"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Left half kept ----

  test("col 6 — left half kept, right gap", () => {
    const m = measureFromRoot("col", 6, [{ a: 0, b: 2 }]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 6, "left_0-2"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Right half kept ----

  test("col 6 — right half kept, left gap", () => {
    const m = measureFromRoot("col", 6, [{ a: 3, b: 5 }]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 6, "right_3-5"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Middle range — gaps on both sides ----

  test("col 6 — middle range, gaps on both sides", () => {
    const m = measureFromRoot("col", 6, [{ a: 1, b: 4 }]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 6, "mid_1-4"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Two disjoint groups ----

  test("col 8 — two disjoint groups", () => {
    const m = measureFromRoot("col", 8, [
      { a: 0, b: 1 },
      { a: 4, b: 5 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 8, "disjoint_0-1_4-5"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Overlapping ranges merged ----

  test("col 8 — overlapping ranges merge", () => {
    const m = measureFromRoot("col", 8, [
      { a: 0, b: 3 },
      { a: 2, b: 5 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 8, "overlap_0-3_2-5"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Vertical axis ----

  test("row 4 — single-slot group", () => {
    const m = measureFromRoot("row", 4, [{ a: 0, b: 0 }]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("row", 4, "single_0"),
      m0: m,
      width: 1080,
      height: 1920,
      goldensDir: GOLDENS_DIR,
    });
  });
});
