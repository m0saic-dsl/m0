import {
  isValidM0String,
  parseM0StringToRenderFrames,
} from "@m0saic/dsl";
import { aspectSafeGrid } from "./aspectSafeGrid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify zero distortion: all tiles same width, all tiles same height. */
function assertZeroDistortion(m0: string, canvasW: number, canvasH: number) {
  const frames = parseM0StringToRenderFrames(m0, canvasW, canvasH);
  const widths = new Set(frames.map((f) => f.width));
  const heights = new Set(frames.map((f) => f.height));
  expect(widths.size).toBe(1);
  expect(heights.size).toBe(1);
}

// ---------------------------------------------------------------------------
// Core: zero distortion guarantee
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — zero distortion", () => {
  test("no gutter: clean in both 1920x1080 and 1080x1920", () => {
    const r = aspectSafeGrid({ minCols: 2, maxCols: 6, minRows: 2, maxRows: 6 });
    expect(isValidM0String(r.m0)).toBe(true);
    expect(r.cellCount).toBeGreaterThanOrEqual(4);
    assertZeroDistortion(r.m0, 1920, 1080);
    assertZeroDistortion(r.m0, 1080, 1920);
  });

  test("with gutter: clean in both canvases", () => {
    const r = aspectSafeGrid({
      minCols: 2,
      maxCols: 4,
      minRows: 2,
      maxRows: 4,
      gutter: 0.08,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    expect(r.gutterW).toBeGreaterThan(0);
    assertZeroDistortion(r.m0, 1920, 1080);
    assertZeroDistortion(r.m0, 1080, 1920);
  });

  test("with outer gutters: clean in both canvases", () => {
    const r = aspectSafeGrid({
      minCols: 2,
      maxCols: 4,
      minRows: 2,
      maxRows: 4,
      gutter: 0.1,
      outerGutters: true,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    assertZeroDistortion(r.m0, 1920, 1080);
    assertZeroDistortion(r.m0, 1080, 1920);
  });
});

// ---------------------------------------------------------------------------
// Priority modes
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — priorities", () => {
  test("moreCells prefers higher cell count", () => {
    const balanced = aspectSafeGrid({ minCols: 2, maxCols: 6, minRows: 2, maxRows: 6 });
    const more = aspectSafeGrid({
      minCols: 2,
      maxCols: 6,
      minRows: 2,
      maxRows: 6,
      priority: "moreCells",
    });
    expect(more.cellCount).toBeGreaterThanOrEqual(balanced.cellCount);
  });

  test("largerCells prefers fewer, bigger cells", () => {
    const larger = aspectSafeGrid({
      minCols: 2,
      maxCols: 6,
      minRows: 2,
      maxRows: 6,
      priority: "largerCells",
    });
    // With no gutter at 1920x1080/1080x1920, 2x2 gives the largest cells
    expect(larger.rows).toBeLessThanOrEqual(4);
    expect(larger.cols).toBeLessThanOrEqual(4);
    // Still clean
    assertZeroDistortion(larger.m0, 1920, 1080);
    assertZeroDistortion(larger.m0, 1080, 1920);
  });
});

// ---------------------------------------------------------------------------
// Custom canvas pairs
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — custom canvases", () => {
  test("1280x720 and 720x1280", () => {
    const r = aspectSafeGrid({
      landscapeW: 1280,
      landscapeH: 720,
      portraitW: 720,
      portraitH: 1280,
      minCols: 2,
      maxCols: 6,
      minRows: 2,
      maxRows: 6,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    assertZeroDistortion(r.m0, 1280, 720);
    assertZeroDistortion(r.m0, 720, 1280);
  });

  test("square canvases (trivial)", () => {
    const r = aspectSafeGrid({
      landscapeW: 1080,
      landscapeH: 1080,
      portraitW: 1080,
      portraitH: 1080,
      minCols: 2,
      maxCols: 4,
      minRows: 2,
      maxRows: 4,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    assertZeroDistortion(r.m0, 1080, 1080);
  });
});

// ---------------------------------------------------------------------------
// Result metadata
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — metadata", () => {
  test("returns correct chosen parameters", () => {
    const r = aspectSafeGrid({
      minCols: 3,
      maxCols: 3,
      minRows: 3,
      maxRows: 3,
    });
    expect(r.rows).toBe(3);
    expect(r.cols).toBe(3);
    expect(r.cellCount).toBe(9);
    expect(r.cellW).toBeGreaterThanOrEqual(1);
    expect(r.ppwLandscape).toBeGreaterThan(0);
    expect(r.ppwPortrait).toBeGreaterThan(0);
  });

  test("gutterRatio is nonzero when gutter requested", () => {
    const r = aspectSafeGrid({
      minCols: 3,
      maxCols: 3,
      minRows: 3,
      maxRows: 3,
      gutter: 0.1,
    });
    // The exact ratio depends on available divisors — may not match
    // the request closely, but gutters should be present and clean.
    expect(r.gutterW).toBeGreaterThan(0);
    expect(r.gutterRatio).toBeGreaterThan(0);
    assertZeroDistortion(r.m0, 1920, 1080);
    assertZeroDistortion(r.m0, 1080, 1920);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — edge cases", () => {
  test("invalid column range throws", () => {
    expect(() => aspectSafeGrid({ minCols: 5, maxCols: 2 })).toThrow(/invalid column range/);
  });

  test("invalid row range throws", () => {
    expect(() => aspectSafeGrid({ minRows: 5, maxRows: 2 })).toThrow(/invalid row range/);
  });
});
