import {
  isValidM0String,
  parseM0StringToRenderFrames,
} from "@m0saic/dsl";
import { grid } from "./grid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertGrid(
  opts: Parameters<typeof grid>[0],
  expectedTiles: number
) {
  const result = grid(opts);

  // Must pass the canonical validator
  expect(isValidM0String(result.m0)).toBe(true);

  // Rendered frame count must match rows*cols
  const frames = parseM0StringToRenderFrames(result.m0, 1920, 1080);
  expect(frames.length).toBe(expectedTiles);

  // Order array must be row-major
  expect(result.order).toEqual(
    Array.from({ length: expectedTiles }, (_, i) => i)
  );
}

// ---------------------------------------------------------------------------
// Unit tests (DSL validity + structure)
// ---------------------------------------------------------------------------

describe("grid", () => {
  // ── Simple path: no gutter, compact DSL ────────────────

  test("2x2 no gutter emits compact equal splits", () => {
    const r = grid({ rows: 2, cols: 2 });
    expect(r.m0).toBe("2[2(1,1),2(1,1)]");
    expect(r.totalX).toBe(2);
    expect(r.totalY).toBe(2);
    expect(r.cellW).toBe(1);
    expect(r.gutterW).toBe(0);
    assertGrid({ rows: 2, cols: 2 }, 4);
  });

  test("3x3 no gutter emits compact equal splits", () => {
    const r = grid({ rows: 3, cols: 3 });
    expect(r.m0).toBe("3[3(1,1,1),3(1,1,1),3(1,1,1)]");
    assertGrid({ rows: 3, cols: 3 }, 9);
  });

  test("4x4 no gutter emits compact equal splits", () => {
    const r = grid({ rows: 4, cols: 4 });
    expect(r.m0).toBe("4[4(1,1,1,1),4(1,1,1,1),4(1,1,1,1),4(1,1,1,1)]");
    assertGrid({ rows: 4, cols: 4 }, 16);
  });

  test("3x2 no gutter", () => {
    const r = grid({ rows: 2, cols: 3 });
    expect(r.m0).toBe("2[3(1,1,1),3(1,1,1)]");
    assertGrid({ rows: 2, cols: 3 }, 6);
  });

  test("1x1 no gutter", () => {
    const r = grid({ rows: 1, cols: 1 });
    expect(r.m0).toBe("1");
    assertGrid({ rows: 1, cols: 1 }, 1);
  });

  test("1x3 no gutter (single row)", () => {
    const r = grid({ rows: 1, cols: 3 });
    expect(r.m0).toBe("3(1,1,1)");
    assertGrid({ rows: 1, cols: 3 }, 3);
  });

  test("simple path not used when cellWeightBase is set", () => {
    const r = grid({ rows: 2, cols: 2, cellWeightBase: 50 });
    // Should use the weighted path (cellW=50, not 1)
    expect(r.cellW).toBe(50);
    expect(r.totalX).toBe(100);
  });

  test("simple path not used when outputWidth is set", () => {
    const r = grid({ rows: 2, cols: 2, outputWidth: 1920, outputHeight: 1080 });
    expect(r.cellW).toBe(50);
  });

  // ── Weighted path: gutters ─────────────────────────────

  test("6x3 grid with gutter and outerGutters", () => {
    const opts = { rows: 6, cols: 3, gutter: 0.02, outerGutters: true };
    assertGrid(opts, 6 * 3);

    const r = grid(opts);
    expect(r.cellW).toBe(50);
    expect(r.gutterW).toBe(1);
    expect(r.totalX).toBe(3 * 50 + 4 * 1); // 154
    expect(r.totalY).toBe(6 * 50 + 7 * 1); // 307
  });

  test("2x2 grid with gutter and outerGutters", () => {
    const opts = { rows: 2, cols: 2, gutter: 0.02, outerGutters: true };
    assertGrid(opts, 2 * 2);

    const r = grid(opts);
    expect(r.cellW).toBe(50);
    expect(r.gutterW).toBe(1);
    expect(r.totalX).toBe(2 * 50 + 3 * 1); // 103
    expect(r.totalY).toBe(2 * 50 + 3 * 1); // 103
  });

  test("2x2 grid with gutter=0 (no gutters)", () => {
    const opts = { rows: 2, cols: 2, gutter: 0, outerGutters: true };
    assertGrid(opts, 2 * 2);

    const r = grid(opts);
    expect(r.cellW).toBe(50);
    expect(r.gutterW).toBe(0);
    expect(r.totalX).toBe(2 * 50); // 100
    expect(r.totalY).toBe(2 * 50); // 100
  });

  test("inner gutters only (outerGutters=false)", () => {
    const opts = { rows: 2, cols: 3, gutter: 0.02, outerGutters: false };
    assertGrid(opts, 2 * 3);

    const r = grid(opts);
    expect(r.gutterW).toBe(1);
    expect(r.totalX).toBe(3 * 50 + 2 * 1); // 152
    expect(r.totalY).toBe(2 * 50 + 1 * 1); // 101
  });

  test("custom cellWeightBase", () => {
    const opts = {
      rows: 2,
      cols: 2,
      gutter: 0.1,
      outerGutters: true,
      cellWeightBase: 10,
    };
    assertGrid(opts, 4);

    const r = grid(opts);
    expect(r.cellW).toBe(10);
    expect(r.gutterW).toBe(1); // round(10*0.1)=1
    expect(r.totalX).toBe(2 * 10 + 3 * 1); // 23
    expect(r.totalY).toBe(2 * 10 + 3 * 1); // 23
  });

  test("1x1 grid produces valid string", () => {
    assertGrid({ rows: 1, cols: 1 }, 1);
  });

  test("undefined gutter treated as no gutter", () => {
    const r = grid({ rows: 2, cols: 2 });
    expect(r.gutterW).toBe(0);
    expect(isValidM0String(r.m0)).toBe(true);
  });

  test("cellH equals cellW when no output dimensions", () => {
    const r = grid({ rows: 3, cols: 4, gutter: 0.02 });
    expect(r.cellH).toBe(r.cellW);
  });

  test("output dimensions adjust cellH for equal pixel gaps", () => {
    // 3 cols, 8 rows in a 920x1300 (portrait) output
    const opts = { rows: 8, cols: 3, gutter: 0.02, outputWidth: 920, outputHeight: 1300 };
    const r = grid(opts);

    assertGrid(opts, 8 * 3);

    // cellH should be smaller than cellW (portrait → tiles wider than tall)
    expect(r.cellH).toBeLessThan(r.cellW);

    // Pixel-per-weight should be nearly equal on both axes
    const ppwX = 920 / r.totalX;
    const ppwY = 1300 / r.totalY;
    expect(Math.abs(ppwX - ppwY)).toBeLessThan(0.5);
  });

  test("square output with square grid keeps cellH=cellW", () => {
    const r = grid({
      rows: 4, cols: 4, gutter: 0.02, outputWidth: 1080, outputHeight: 1080,
    });
    expect(r.cellH).toBe(r.cellW);
  });

  test("landscape output adjusts cellH for equal gaps", () => {
    // 4 cols, 2 rows in 1920x1080
    const r = grid({
      rows: 2, cols: 4, gutter: 0.02, outputWidth: 1920, outputHeight: 1080,
    });

    assertGrid({ rows: 2, cols: 4, gutter: 0.02, outputWidth: 1920, outputHeight: 1080 }, 8);

    // Tiles are tall relative to wide → cellH should be larger than cellW
    expect(r.cellH).toBeGreaterThan(r.cellW);

    const ppwX = 1920 / r.totalX;
    const ppwY = 1080 / r.totalY;
    expect(Math.abs(ppwX - ppwY)).toBeLessThan(0.5);
  });

  test("auto-scales cellW down for high grid counts", () => {
    // 15 cols at 1080px: without auto-scaling, totalX=764 for 1080px (1.4 px/weight).
    // With auto-scaling, cellW should be reduced so px/weight ≥ 4.
    const r = grid({
      rows: 13, cols: 15, gutter: 0.01, outputWidth: 1080, outputHeight: 1080,
    });

    assertGrid({ rows: 13, cols: 15, gutter: 0.01, outputWidth: 1080, outputHeight: 1080 }, 13 * 15);

    // cellW should be < 50 (auto-scaled down)
    expect(r.cellW).toBeLessThan(50);
    // At least 4 px per weight on both axes
    expect(1080 / r.totalX).toBeGreaterThanOrEqual(3.5);
    expect(1080 / r.totalY).toBeGreaterThanOrEqual(3.5);
  });

  test("auto-scaling does not trigger for low grid counts", () => {
    // 4 cols at 1920px: totalX with cellW=50 is only 203 for 1920px.
    // px/weight = 9.5, no need to scale down.
    const r = grid({
      rows: 4, cols: 4, gutter: 0.02, outputWidth: 1920, outputHeight: 1080,
    });

    expect(r.cellW).toBe(50);
  });

  test("explicit cellWeightBase overrides auto-scaling", () => {
    const r = grid({
      rows: 13, cols: 15, gutter: 0.01, cellWeightBase: 50,
      outputWidth: 1080, outputHeight: 1080,
    });

    expect(r.cellW).toBe(50);
  });
});
