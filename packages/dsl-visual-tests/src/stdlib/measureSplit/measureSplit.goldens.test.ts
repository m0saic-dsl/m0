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
//
// Cases chosen to exercise multi-position groups and irregular spacing —
// avoiding 2-slot half-half reductions (`2(1,-)` style) which currently
// trip a make-wireframe gap-rendering bug. Once that fix lands, additional
// simpler cases can be added back.
// ---------------------------------------------------------------------------

describe("measureSplit goldens", () => {
  // ---- 3-tick ruler at irregular positions ----

  test("col 12 — 3-tick ruler at 0, 5, 11", () => {
    // Three single-position frames spaced unevenly across N=12.
    // Run lengths [1,4,1,5,1] are coprime → DSL stays at N=12.
    const m = measureFromRoot("col", 12, [
      { a: 0, b: 0 },
      { a: 5, b: 5 },
      { a: 11, b: 11 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 12, "ruler_0_5_11"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Header / body / footer (vertical pillar layout) ----

  test("col 12 — pillar/body/pillar at 0, 2-9, 11", () => {
    // Thin frame at 0, 8-wide body at 2-9, thin frame at 11.
    // Run lengths [1,1,8,1,1] coprime → no reduction.
    const m = measureFromRoot("col", 12, [
      { a: 0, b: 0 },
      { a: 2, b: 9 },
      { a: 11, b: 11 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 12, "pillar_body_pillar"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Two unequal columns separated by narrow spacer ----

  test("col 12 — two 5-wide frames with 2-wide spacer", () => {
    // Run lengths [5,2,5] coprime → no reduction.
    const m = measureFromRoot("col", 12, [
      { a: 0, b: 4 },
      { a: 7, b: 11 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 12, "two_5wide_spacer_2"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Vertical 3-zone layout (header / body / footer on row axis) ----

  test("row 20 — header / body / footer asymmetric", () => {
    // 2-wide header, 12-wide body, 2-wide footer with 2-wide gaps between.
    // Run lengths [2,2,12,2,2] reduce by GCD 2 → N=10, runs [1,1,6,1,1].
    const m = measureFromRoot("row", 20, [
      { a: 0, b: 1 },
      { a: 4, b: 15 },
      { a: 18, b: 19 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("row", 20, "header_body_footer"),
      m0: m,
      width: 1080,
      height: 1920,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- High-N dense ruler (eight ticks) ----

  test("col 24 — dense ruler at every 3rd position", () => {
    // 8 frames at 0, 3, 6, 9, 12, 15, 18, 21 with 23 also marked.
    // Mix of run-length 1 (frames) and 2 (gaps), plus a tail variant
    // (positions 21 and 23 with a gap of 1 between) keeps GCD at 1.
    const m = measureFromRoot("col", 24, [
      { a: 0, b: 0 },
      { a: 3, b: 3 },
      { a: 6, b: 6 },
      { a: 9, b: 9 },
      { a: 12, b: 12 },
      { a: 15, b: 15 },
      { a: 18, b: 18 },
      { a: 21, b: 21 },
      { a: 23, b: 23 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 24, "dense_ruler_step3"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Disjoint groups of differing widths ----

  test("col 16 — three groups of widths 4, 2, 5", () => {
    // Frame widths: 4, 2, 5. Gaps: 2, 1, 2. Run lengths [4,2,2,1,5,2].
    // GCD = 1, no reduction → N=16 stays.
    const m = measureFromRoot("col", 16, [
      { a: 0, b: 3 },
      { a: 6, b: 7 },
      { a: 9, b: 13 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 16, "disjoint_4_2_5"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Overlapping ranges merge into a single wide group ----

  test("col 20 — overlapping ranges merge to 0..12", () => {
    // [0..7] ∪ [4..12] ∪ [10..12] → [0..12] (13-wide). Trailing gap [13..19] = 7.
    // Run lengths [13,7], GCD = 1, no reduction.
    const m = measureFromRoot("col", 20, [
      { a: 0, b: 7 },
      { a: 4, b: 12 },
      { a: 10, b: 12 },
    ]);
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: goldenId("col", 20, "overlap_merge_0-12"),
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
