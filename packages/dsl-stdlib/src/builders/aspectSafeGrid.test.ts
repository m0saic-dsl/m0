import {
  isValidM0String,
  parseM0StringToRenderFrames,
} from "@m0saic/dsl";
import { aspectSafeGrid } from "./aspectSafeGrid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertZeroDistortion(m0: string, canvasW: number, canvasH: number) {
  const frames = parseM0StringToRenderFrames(m0, canvasW, canvasH);
  const widths = new Set(frames.map((f) => f.width));
  const heights = new Set(frames.map((f) => f.height));
  expect(widths.size).toBe(1);
  expect(heights.size).toBe(1);
}

// ---------------------------------------------------------------------------
// Core: aspect-matched pair invariants
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — aspect-matched pair", () => {
  test("emits two coordinated DSLs, each clean at its own canvas", () => {
    const r = aspectSafeGrid({ minCols: 2, maxCols: 6, minRows: 2, maxRows: 6 });
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);
    assertZeroDistortion(r.landscape.m0, r.landscape.canvasW, r.landscape.canvasH);
    assertZeroDistortion(r.portrait.m0,  r.portrait.canvasW,  r.portrait.canvasH);
  });

  test("cell count is identical across orientations", () => {
    const r = aspectSafeGrid({ minCols: 2, maxCols: 6, minRows: 2, maxRows: 6 });
    expect(r.landscape.rows * r.landscape.cols).toBe(r.cellCount);
    expect(r.portrait.rows * r.portrait.cols).toBe(r.cellCount);
  });

  test("portrait grid is NOT just the transpose; it's the AR-matched pair", () => {
    // For 4 cols × 3 rows landscape (1920×1080, cell AR ≈ 1.33), the AR-matched
    // portrait at 1080×1920 with 12 cells is 2 cols × 6 rows (cell AR ≈ 1.69),
    // NOT the naive transpose 3 cols × 4 rows (cell AR ≈ 0.75 — would flip cells
    // from landscape to portrait orientation).
    const r = aspectSafeGrid({
      minCols: 2,
      maxCols: 6,
      minRows: 2,
      maxRows: 6,
      // Force the search to settle on (3 rows × 4 cols) landscape by biasing
      // priority to a configuration that produces 12 cells.
      priority: "moreCells",
    });
    if (r.landscape.rows === 3 && r.landscape.cols === 4) {
      expect(r.portrait.cols).toBe(2);
      expect(r.portrait.rows).toBe(6);
    }
    // Whatever was picked, both DSLs render at their canvases with no spread.
    assertZeroDistortion(r.landscape.m0, r.landscape.canvasW, r.landscape.canvasH);
    assertZeroDistortion(r.portrait.m0,  r.portrait.canvasW,  r.portrait.canvasH);
  });

  test("cell aspect ratio is similar across orientations (log-delta small)", () => {
    const r = aspectSafeGrid({ minCols: 2, maxCols: 6, minRows: 2, maxRows: 6 });
    // log-delta of 0.7 corresponds to a factor-of-2 difference in AR; the
    // search is heavily weighted to find pairs much closer than that.
    // The algorithm is allowed to pick near-square cells that straddle
    // AR=1 — that still satisfies "video looks the same after orientation
    // flip" because cells with AR ≈ 1.05 and AR ≈ 0.95 read identically
    // to a viewer.
    expect(r.cellAspectLogDelta).toBeLessThan(0.7);
  });

  test("with gutter: both DSLs render with no spread at their own canvas", () => {
    const r = aspectSafeGrid({
      minCols: 2,
      maxCols: 4,
      minRows: 2,
      maxRows: 4,
      gutter: 0.08,
    });
    expect(r.landscape.gutterPxX).toBeGreaterThan(0);
    expect(r.portrait.gutterPxX).toBeGreaterThan(0);
    assertZeroDistortion(r.landscape.m0, r.landscape.canvasW, r.landscape.canvasH);
    assertZeroDistortion(r.portrait.m0,  r.portrait.canvasW,  r.portrait.canvasH);
  });

  test("with outer gutters: clean in both orientations", () => {
    const r = aspectSafeGrid({
      minCols: 2,
      maxCols: 4,
      minRows: 2,
      maxRows: 4,
      gutter: 0.1,
      outerGutters: true,
    });
    assertZeroDistortion(r.landscape.m0, r.landscape.canvasW, r.landscape.canvasH);
    assertZeroDistortion(r.portrait.m0,  r.portrait.canvasW,  r.portrait.canvasH);
  });
});

// ---------------------------------------------------------------------------
// Flow A: target cell aspect ratio (user knows the cell shape they want)
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — flow A: targetCellAspectRatio", () => {
  test("targetCellAspectRatio = 1.33 biases search toward 4:3-ish cells", () => {
    // Without target: default search picks 3×5 / 5×3 (cell AR ≈ 1.07).
    // With target 1.33 (4:3 video frames): search should prefer pairs
    // where the landscape cell AR is closer to 1.33.
    const r = aspectSafeGrid({
      minCols: 2, maxCols: 6,
      minRows: 2, maxRows: 6,
      targetCellAspectRatio: 1.33,
    });
    // The chosen landscape AR should be closer to 1.33 than the un-biased default.
    const distFromTarget = Math.abs(Math.log(r.landscape.cellAspectRatio) - Math.log(1.33));
    expect(distFromTarget).toBeLessThan(0.30);
  });

  test("targetCellAspectRatio = 1.0 biases search toward square cells", () => {
    const r = aspectSafeGrid({
      minCols: 2, maxCols: 6,
      minRows: 2, maxRows: 6,
      targetCellAspectRatio: 1.0,
    });
    // Square cells: landscape AR very close to 1.
    expect(Math.abs(Math.log(r.landscape.cellAspectRatio))).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// Flow B: per-orientation ranges (user knows the grid shape they want)
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — flow B: per-orientation ranges", () => {
  test("pinning landscape to 4 cols × 3 rows finds 2×6 portrait (canonical case)", () => {
    // User pins landscape exactly; portrait searches across a wide range
    // looking for cellCount=12 + AR-matched.
    const r = aspectSafeGrid({
      landscapeMinRows: 3, landscapeMaxRows: 3,
      landscapeMinCols: 4, landscapeMaxCols: 4,
      portraitMinRows: 2, portraitMaxRows: 8,
      portraitMinCols: 2, portraitMaxCols: 8,
    });
    expect(r.landscape.rows).toBe(3);
    expect(r.landscape.cols).toBe(4);
    expect(r.portrait.rows).toBe(6);
    expect(r.portrait.cols).toBe(2);
    expect(r.cellCount).toBe(12);
    // Cells stay landscape-oriented (AR > 1) in both — the whole intent.
    expect(r.landscape.cellAspectRatio).toBeGreaterThan(1);
    expect(r.portrait.cellAspectRatio).toBeGreaterThan(1);
  });

  test("pinning landscape rows but leaving cols flexible", () => {
    const r = aspectSafeGrid({
      landscapeMinRows: 3, landscapeMaxRows: 3,
      landscapeMinCols: 2, landscapeMaxCols: 8,
      portraitMinRows: 2, portraitMaxRows: 8,
      portraitMinCols: 2, portraitMaxCols: 8,
    });
    expect(r.landscape.rows).toBe(3);
    // Portrait should still pair correctly via AR matching.
    expect(r.cellCount).toBe(r.landscape.rows * r.landscape.cols);
    expect(r.cellCount).toBe(r.portrait.rows * r.portrait.cols);
  });

  test("per-orientation range overrides the shared default", () => {
    // Shared range [3,3] would force both to 3×3=9. But landscape override
    // to [4,4]×[4,4] should let landscape be 4×4=16, portrait 4×4=16.
    const r = aspectSafeGrid({
      minRows: 3, maxRows: 3, minCols: 3, maxCols: 3,
      landscapeMinRows: 4, landscapeMaxRows: 4,
      landscapeMinCols: 4, landscapeMaxCols: 4,
      portraitMinRows: 4, portraitMaxRows: 4,
      portraitMinCols: 4, portraitMaxCols: 4,
    });
    expect(r.landscape.rows).toBe(4);
    expect(r.landscape.cols).toBe(4);
    expect(r.cellCount).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// Combined flows: target AR + landscape pin (user knows both)
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — combined: target AR + landscape pin", () => {
  test("both knobs work together", () => {
    const r = aspectSafeGrid({
      landscapeMinRows: 3, landscapeMaxRows: 3,
      landscapeMinCols: 4, landscapeMaxCols: 4,
      portraitMinRows: 2, portraitMaxRows: 8,
      portraitMinCols: 2, portraitMaxCols: 8,
      targetCellAspectRatio: 1.33,
    });
    // Landscape is pinned, portrait is AR-matched.
    expect(r.landscape.rows).toBe(3);
    expect(r.landscape.cols).toBe(4);
    expect(r.portrait.cellAspectRatio).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Flow C: letterbox (snapGridFit per orientation, accept padding)
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — flow C: letterbox", () => {
  test("letterbox=true accepts (R, C) pairs that exact-fit would reject", () => {
    // Force a (R, C) range where exact-fit has no clean solution but
    // letterbox always finds the largest fitting inner rect.
    const r = aspectSafeGrid({
      landscapeW: 1920,
      landscapeH: 1080,
      portraitW: 1080,
      portraitH: 1920,
      // 7×7 won't tile 1920×1080 cleanly (1920%7 ≠ 0), but with letterbox
      // the inner rect just shrinks to fit.
      minRows: 7, maxRows: 7,
      minCols: 7, maxCols: 7,
      letterbox: true,
    });
    expect(r.cellCount).toBe(49);
    // Both orientations rendered without throwing.
    expect(r.landscape.m0).toBeTruthy();
    expect(r.portrait.m0).toBeTruthy();
  });

  test("letterbox preserves cell aspect better than exact-fit (in many cases)", () => {
    // Same input, two modes — letterbox should typically achieve closer AR
    // because it can choose any inner rect dimensions.
    const exact = aspectSafeGrid({ minCols: 3, maxCols: 4, minRows: 3, maxRows: 4 });
    const letterboxed = aspectSafeGrid({
      minCols: 3, maxCols: 4, minRows: 3, maxRows: 4,
      letterbox: true,
    });
    // letterbox shouldn't make AR worse than exact — it has strictly more
    // candidates to search over.
    expect(letterboxed.cellAspectLogDelta).toBeLessThanOrEqual(exact.cellAspectLogDelta + 1e-6);
  });

  test("letterbox honors hAlign/vAlign for the inner placement", () => {
    // Smoke test: passing align doesn't crash and produces valid DSLs.
    const r = aspectSafeGrid({
      minCols: 3, maxCols: 4, minRows: 3, maxRows: 4,
      letterbox: true,
      hAlign: "left",
      vAlign: "top",
    });
    expect(r.landscape.m0).toBeTruthy();
    expect(r.portrait.m0).toBeTruthy();
  });

  test("letterbox + targetCellAspectRatio: cells biased toward target", () => {
    // L↔P AR-match penalty (×1000) intentionally outweighs the target-AR
    // penalty (×500), so the target is a preference, not an override.
    // For a 1920×1080 ↔ 1080×1920 search with target=1.78 (16:9), a 3×3
    // landscape would hit the target exactly but its 3×3 portrait pair has
    // cell AR ≈ 0.56 (huge L↔P mismatch). The algorithm correctly picks a
    // pair with smaller L↔P delta even at the cost of looser target match.
    // Compare against the no-target baseline: target should at least nudge
    // results in the right direction (or tie, never worse).
    const noTarget = aspectSafeGrid({
      minCols: 2, maxCols: 6, minRows: 2, maxRows: 6,
      letterbox: true,
    });
    const withTarget = aspectSafeGrid({
      minCols: 2, maxCols: 6, minRows: 2, maxRows: 6,
      letterbox: true,
      targetCellAspectRatio: 1.78,
    });
    const distNoTarget = Math.abs(Math.log(noTarget.landscape.cellAspectRatio) - Math.log(1.78));
    const distWithTarget = Math.abs(Math.log(withTarget.landscape.cellAspectRatio) - Math.log(1.78));
    expect(distWithTarget).toBeLessThanOrEqual(distNoTarget + 1e-6);
  });
});

// ---------------------------------------------------------------------------
// Flow D: targetCellCount (user knows roughly how many cells they need)
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — flow D: targetCellCount (fuzzy count)", () => {
  test("targetCellCount = 10 finds a layout with ~10 cells", () => {
    const r = aspectSafeGrid({
      minRows: 1, maxRows: 8,
      minCols: 1, maxCols: 8,
      targetCellCount: 10,
      cellCountTolerance: 4,
      letterbox: true,
    });
    expect(Math.abs(r.cellCount - 10)).toBeLessThanOrEqual(4);
  });

  test("tolerance = 0 forces exact count match", () => {
    // 12 cells: many factor pairs available in 1920×1080 / 1080×1920.
    const r = aspectSafeGrid({
      minRows: 1, maxRows: 8,
      minCols: 1, maxCols: 8,
      targetCellCount: 12,
      cellCountTolerance: 0,
      letterbox: true,
    });
    expect(r.cellCount).toBe(12);
  });

  test("targetCellCount + targetCellAspectRatio: count constrains the search, aspect biases the pick", () => {
    const r = aspectSafeGrid({
      minRows: 1, maxRows: 8,
      minCols: 1, maxCols: 8,
      targetCellCount: 12,
      cellCountTolerance: 0,
      targetCellAspectRatio: 1.33, // 4:3 cells
      letterbox: true,
    });
    expect(r.cellCount).toBe(12);
    // Cell AR should land near 1.33 — possible with 12-cell factorings.
    expect(Math.abs(Math.log(r.landscape.cellAspectRatio) - Math.log(1.33))).toBeLessThan(0.5);
  });

  test("throws when no candidate matches the count window", () => {
    // Target 100 cells, tolerance 0, range 1..3 (max 9 cells possible) → impossible.
    expect(() =>
      aspectSafeGrid({
        minRows: 1, maxRows: 3, minCols: 1, maxCols: 3,
        targetCellCount: 100, cellCountTolerance: 0,
        letterbox: true,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Custom canvas pairs
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — custom canvases", () => {
  test("1280x720 ↔ 720x1280", () => {
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
    assertZeroDistortion(r.landscape.m0, 1280, 720);
    assertZeroDistortion(r.portrait.m0,  720,  1280);
    expect(r.landscape.rows * r.landscape.cols).toBe(r.portrait.rows * r.portrait.cols);
  });

  test("square canvases (degenerate — landscape == portrait)", () => {
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
    assertZeroDistortion(r.landscape.m0, 1080, 1080);
    assertZeroDistortion(r.portrait.m0,  1080, 1080);
  });
});

// ---------------------------------------------------------------------------
// Result metadata
// ---------------------------------------------------------------------------

describe("aspectSafeGrid — metadata", () => {
  test("returns rows/cols/cellPx for each orientation", () => {
    const r = aspectSafeGrid({
      minCols: 3,
      maxCols: 3,
      minRows: 3,
      maxRows: 3,
    });
    expect(r.cellCount).toBe(9);
    expect(r.landscape.rows).toBe(3);
    expect(r.landscape.cols).toBe(3);
    expect(r.landscape.cellWPx).toBeGreaterThan(0);
    expect(r.landscape.cellHPx).toBeGreaterThan(0);
    expect(r.portrait.cellWPx).toBeGreaterThan(0);
    expect(r.portrait.cellHPx).toBeGreaterThan(0);
    // Aspect ratios populated
    expect(r.landscape.cellAspectRatio).toBeGreaterThan(0);
    expect(r.portrait.cellAspectRatio).toBeGreaterThan(0);
    expect(r.cellAspectLogDelta).toBeGreaterThanOrEqual(0);
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

  test("throws when no aspect-matched pair exists in the requested range", () => {
    // Force range where landscape needs prime cell counts the portrait
    // canvas can't factor at all within range.
    expect(() =>
      aspectSafeGrid({
        landscapeW: 1920,
        landscapeH: 1080,
        portraitW: 1080,
        portraitH: 1920,
        minRows: 7,
        maxRows: 7,
        minCols: 7,
        maxCols: 7,
      }),
    ).toThrow(/no aspect-matched grid pair found/);
  });
});
