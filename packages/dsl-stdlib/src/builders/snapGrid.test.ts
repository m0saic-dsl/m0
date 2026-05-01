import { isValidM0String, getFrameCount } from "@m0saic/dsl";
import { snapGridFit, snapGridEnumerate, snapGridFind } from "./snapGrid";

describe("snapGridFit", () => {
  test("8×6 grid, 10% gutter, in 1920×1080 → safe inner rect 1740×975", () => {
    const r = snapGridFit({
      rootW: 1920,
      rootH: 1080,
      rows: 6,
      cols: 8,
      gutter: 0.1,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    expect(r.rectW).toBe(1740);
    expect(r.rectH).toBe(975);
    expect(getFrameCount(r.m0)).toBe(48);
    expect(r.tileCount).toBe(48);
    expect(r.coverage).toBeCloseTo((1740 * 975) / (1920 * 1080), 5);
  });

  test("exact-fit grid drops the placeRect wrapper", () => {
    // 4×3 no-gutter grid: totals = 4 / 3, divides 1920 / 1080 cleanly
    // safeCanvas returns 1920×1080 exactly, so no wrapper
    const r = snapGridFit({
      rootW: 1920,
      rootH: 1080,
      rows: 3,
      cols: 4,
      gutter: 0,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    expect(r.rectW).toBe(1920);
    expect(r.rectH).toBe(1080);
    expect(r.coverage).toBe(1);
    // No placeRect wrapper means no `-` null tiles in the output
    expect(r.m0.includes("-")).toBe(false);
  });

  test("alignment passes through to placeRect", () => {
    const centered = snapGridFit({
      rootW: 1920,
      rootH: 1080,
      rows: 6,
      cols: 8,
      gutter: 0.1,
      hAlign: "center",
      vAlign: "center",
    });
    const topLeft = snapGridFit({
      rootW: 1920,
      rootH: 1080,
      rows: 6,
      cols: 8,
      gutter: 0.1,
      hAlign: "left",
      vAlign: "top",
    });
    // Same inner rect, different wrapper structure
    expect(centered.rectW).toBe(topLeft.rectW);
    expect(centered.rectH).toBe(topLeft.rectH);
    expect(centered.m0).not.toBe(topLeft.m0);
  });
});

describe("snapGridEnumerate", () => {
  test("returns candidates sorted by fitScore descending", () => {
    const cands = snapGridEnumerate({
      rootW: 1920,
      rootH: 1080,
      minRows: 2,
      maxRows: 6,
      minCols: 2,
      maxCols: 6,
      gutter: 0.1,
    });
    expect(cands.length).toBeGreaterThan(0);
    for (let i = 1; i < cands.length; i++) {
      expect(cands[i - 1].fitScore).toBeGreaterThanOrEqual(cands[i].fitScore);
    }
  });

  test("each candidate has zero-spread cell sizes (quantization-free)", () => {
    const cands = snapGridEnumerate({
      rootW: 1920,
      rootH: 1080,
      minRows: 2,
      maxRows: 4,
      minCols: 2,
      maxCols: 4,
      gutter: 0.1,
    });
    for (const c of cands) {
      // Per-axis: cellPx × count + gutterPx × (count-1) === rectDim, exact.
      const x = c.cellW * c.cols + c.gutterPxX * (c.cols - 1);
      const y = c.cellH * c.rows + c.gutterPxY * (c.rows - 1);
      expect(x).toBe(c.rectW);
      expect(y).toBe(c.rectH);
    }
  });

  test("skips (rows, cols) that don't fit in the canvas", () => {
    // Tiny canvas: most grids won't fit
    const cands = snapGridEnumerate({
      rootW: 100,
      rootH: 100,
      minRows: 1,
      maxRows: 12,
      minCols: 1,
      maxCols: 12,
      gutter: 0.1,
    });
    // Should still produce some valid candidates, just fewer than the full sweep
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.length).toBeLessThan(12 * 12);
  });
});

describe("snapGridFind", () => {
  test("picks the highest-scoring candidate and emits valid DSL", () => {
    const r = snapGridFind({
      rootW: 1920,
      rootH: 1080,
      minRows: 2,
      maxRows: 8,
      minCols: 2,
      maxCols: 8,
      gutter: 0.1,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.tileCount).toBeGreaterThan(0);
  });

  test("throws when no grid fits", () => {
    expect(() =>
      snapGridFind({
        rootW: 5,
        rootH: 5,
        minRows: 10,
        maxRows: 12,
        minCols: 10,
        maxCols: 12,
        gutter: 0.1,
      }),
    ).toThrow(/no grid fits/);
  });
});
