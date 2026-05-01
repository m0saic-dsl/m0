import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { aspectSafeGrid } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

/**
 * aspectSafeGrid returns a coordinated landscape/portrait pair. Each pair is
 * exercised as TWO goldens — one for each orientation rendered at its design
 * canvas. Cell count is invariant across the pair by construction; the cell
 * aspect ratios match closely (cellAspectLogDelta is small).
 */
describe("aspectSafeGrid goldens", () => {
  test("default 1920x1080 / 1080x1920 pair (no gutter, balanced)", () => {
    const r = aspectSafeGrid({});
    expect(r.landscape.canvasW * r.landscape.canvasH).toBeGreaterThan(0);
    expect(r.cellCount).toBeGreaterThan(0);
    expect(r.landscape.rows * r.landscape.cols).toBe(r.cellCount);
    expect(r.portrait.rows * r.portrait.cols).toBe(r.cellCount);
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);

    assertWireframeGolden({
      id: "aspectsafegrid__default_landscape",
      m0: r.landscape.m0,
      width: r.landscape.canvasW, height: r.landscape.canvasH,
      goldensDir: GOLDENS_DIR,
    });
    assertWireframeGolden({
      id: "aspectsafegrid__default_portrait",
      m0: r.portrait.m0,
      width: r.portrait.canvasW, height: r.portrait.canvasH,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("default with 4% gutter", () => {
    const r = aspectSafeGrid({ gutter: 0.04 });
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);

    assertWireframeGolden({
      id: "aspectsafegrid__g4_landscape",
      m0: r.landscape.m0,
      width: r.landscape.canvasW, height: r.landscape.canvasH,
      goldensDir: GOLDENS_DIR,
    });
    assertWireframeGolden({
      id: "aspectsafegrid__g4_portrait",
      m0: r.portrait.m0,
      width: r.portrait.canvasW, height: r.portrait.canvasH,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("targetCellAspectRatio 1.5 biases landscape toward wide cells", () => {
    const r = aspectSafeGrid({
      minCols: 2, maxCols: 6,
      minRows: 2, maxRows: 6,
      targetCellAspectRatio: 1.5,
    });
    // Landscape cell AR should be near the target after biasing.
    expect(r.landscape.cellAspectRatio).toBeGreaterThan(0);
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);

    assertWireframeGolden({
      id: "aspectsafegrid__targetAR15_landscape",
      m0: r.landscape.m0,
      width: r.landscape.canvasW, height: r.landscape.canvasH,
      goldensDir: GOLDENS_DIR,
    });
    assertWireframeGolden({
      id: "aspectsafegrid__targetAR15_portrait",
      m0: r.portrait.m0,
      width: r.portrait.canvasW, height: r.portrait.canvasH,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("letterbox mode opens up the candidate set", () => {
    const r = aspectSafeGrid({
      letterbox: true,
      minCols: 2, maxCols: 6,
      minRows: 2, maxRows: 6,
      targetCellAspectRatio: 1.0,
    });
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);

    assertWireframeGolden({
      id: "aspectsafegrid__letterbox_targetAR1_landscape",
      m0: r.landscape.m0,
      width: r.landscape.canvasW, height: r.landscape.canvasH,
      goldensDir: GOLDENS_DIR,
    });
    assertWireframeGolden({
      id: "aspectsafegrid__letterbox_targetAR1_portrait",
      m0: r.portrait.m0,
      width: r.portrait.canvasW, height: r.portrait.canvasH,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("by-cell-count: target 12 cells with letterbox", () => {
    const r = aspectSafeGrid({
      targetCellCount: 12,
      cellCountTolerance: 2,
      letterbox: true,
      minCols: 2, maxCols: 8,
      minRows: 2, maxRows: 8,
    });
    expect(r.cellCount).toBeGreaterThanOrEqual(10);
    expect(r.cellCount).toBeLessThanOrEqual(14);
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);

    assertWireframeGolden({
      id: "aspectsafegrid__count12_letterbox_landscape",
      m0: r.landscape.m0,
      width: r.landscape.canvasW, height: r.landscape.canvasH,
      goldensDir: GOLDENS_DIR,
    });
    assertWireframeGolden({
      id: "aspectsafegrid__count12_letterbox_portrait",
      m0: r.portrait.m0,
      width: r.portrait.canvasW, height: r.portrait.canvasH,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("custom canvas dims (1280x720 / 720x1280)", () => {
    const r = aspectSafeGrid({
      landscapeW: 1280, landscapeH: 720,
      portraitW: 720, portraitH: 1280,
      gutter: 0.03,
    });
    expect(isValidM0String(r.landscape.m0)).toBe(true);
    expect(isValidM0String(r.portrait.m0)).toBe(true);

    assertWireframeGolden({
      id: "aspectsafegrid__1280x720_g3_landscape",
      m0: r.landscape.m0,
      width: 1280, height: 720,
      goldensDir: GOLDENS_DIR,
    });
    assertWireframeGolden({
      id: "aspectsafegrid__1280x720_g3_portrait",
      m0: r.portrait.m0,
      width: 720, height: 1280,
      goldensDir: GOLDENS_DIR,
    });
  });
});
