import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { grid } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goldenId(
  rows: number,
  cols: number,
  gutter: number,
  outerGutters: boolean
): string {
  const g = String(gutter).replace(".", "p");
  return `build-grid-m0saic__${rows}x${cols}__gutter_${g}__outer_${outerGutters}`;
}

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests
// ---------------------------------------------------------------------------

describe("grid goldens", () => {
  test("2x2 inner gutters", () => {
    const opts = {
      rows: 2,
      cols: 2,
      gutter: 0.02,
      outerGutters: false,
    } as const;

    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, opts.gutter, opts.outerGutters),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("2x2 outer gutters", () => {
    const opts = {
      rows: 2,
      cols: 2,
      gutter: 0.02,
      outerGutters: true,
    } as const;

    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, opts.gutter, opts.outerGutters),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("6x3 hero-style outer gutters", () => {
    const opts = {
      rows: 6,
      cols: 3,
      gutter: 0.02,
      outerGutters: true,
    } as const;

    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, opts.gutter, opts.outerGutters),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("2x2 grid with gutter=0 (no gutters)", () => {
    const opts = { rows: 2, cols: 2, gutter: 0, outerGutters: true } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, opts.gutter, opts.outerGutters),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("inner gutters only (outerGutters=false)", () => {
    const opts = { rows: 2, cols: 3, gutter: 0.02, outerGutters: false } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, opts.gutter, opts.outerGutters),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("custom cellWeightBase", () => {
    const opts = {
      rows: 2,
      cols: 2,
      gutter: 0.1,
      outerGutters: true,
      cellWeightBase: 10,
    } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, opts.gutter, opts.outerGutters),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("1x1 grid produces valid string", () => {
    const opts = { rows: 1, cols: 1 } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, 0, false),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("undefined gutter treated as no gutter", () => {
    const opts = { rows: 2, cols: 2 } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: goldenId(opts.rows, opts.cols, 0, false),
      m0: r.m0,
      width: r.totalX * 20,
      height: r.totalY * 20,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("13x15 auto-scaled square output", () => {
    const opts = {
      rows: 13,
      cols: 15,
      gutter: 0.01,
      outputWidth: 1080,
      outputHeight: 1080,
    } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: `build-grid-m0saic__13x15__gutter_0p01__1080x1080`,
      m0: r.m0,
      width: 1080,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("8x3 portrait output equal gaps", () => {
    const opts = {
      rows: 8,
      cols: 3,
      gutter: 0.02,
      outputWidth: 920,
      outputHeight: 1300,
    } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: `build-grid-m0saic__8x3__gutter_0p02__920x1300`,
      m0: r.m0,
      width: 920,
      height: 1300,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("4x4 landscape 1920x1080", () => {
    const opts = {
      rows: 4,
      cols: 4,
      gutter: 0.02,
      outputWidth: 1920,
      outputHeight: 1080,
    } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: `build-grid-m0saic__4x4__gutter_0p02__1920x1080`,
      m0: r.m0,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("10x10 high-count auto-scaled 1080x1080", () => {
    const opts = {
      rows: 10,
      cols: 10,
      gutter: 0.02,
      outputWidth: 1080,
      outputHeight: 1080,
    } as const;
    const r = grid(opts);
    expect(isValidM0String(r.m0)).toBe(true);

    assertWireframeGolden({
      id: `build-grid-m0saic__10x10__gutter_0p02__1080x1080`,
      m0: r.m0,
      width: 1080,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
