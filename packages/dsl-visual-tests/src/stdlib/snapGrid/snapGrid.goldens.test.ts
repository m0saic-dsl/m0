import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { snapGridFit, snapGridFind, snapGridEnumerate } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("snapGrid goldens", () => {
  describe("snapGridFit", () => {
    test("8x6 grid with 10% gutter in 1920x1080 (canonical example, centered)", () => {
      // Per the snapGrid pending-release entry: 8 cols × 6 rows + 10% gutter
      // → totalX = 8*50 + 7*5 = 435; floor(1920/435)*435 = 1740, floor(1080/325)*325 = 975
      const r = snapGridFit({ rootW: 1920, rootH: 1080, rows: 6, cols: 8, gutter: 0.1 });
      expect(isValidM0String(r.m0)).toBe(true);
      expect(r.rectW).toBe(1740);
      expect(r.rectH).toBe(975);
      assertWireframeGolden({
        id: "snapgrid__fit_6x8_g10_centered_1920x1080",
        m0: r.m0,
        width: 1920, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("8x6 grid with 10% gutter, top-left aligned (visible alignment shift)", () => {
      const r = snapGridFit({
        rootW: 1920, rootH: 1080, rows: 6, cols: 8, gutter: 0.1,
        hAlign: "left", vAlign: "top",
      });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__fit_6x8_g10_topleft",
        m0: r.m0,
        width: 1920, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("8x6 grid with 10% gutter, bottom-right aligned", () => {
      const r = snapGridFit({
        rootW: 1920, rootH: 1080, rows: 6, cols: 8, gutter: 0.1,
        hAlign: "right", vAlign: "bottom",
      });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__fit_6x8_g10_bottomright",
        m0: r.m0,
        width: 1920, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("3x4 grid no gutter in 1080x1080 (square canvas)", () => {
      const r = snapGridFit({ rootW: 1080, rootH: 1080, rows: 3, cols: 4 });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__fit_3x4_nog_1080x1080",
        m0: r.m0,
        width: 1080, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("4x4 grid with outer gutters in 1080x1080", () => {
      const r = snapGridFit({
        rootW: 1080, rootH: 1080, rows: 4, cols: 4,
        gutter: 0.05, outerGutters: true,
      });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__fit_4x4_g5_outer_1080x1080",
        m0: r.m0,
        width: 1080, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });
  });

  describe("snapGridFind", () => {
    test("best candidate inside 1920x1080 (search 2..6 rows × 2..8 cols, 5% gutter)", () => {
      const r = snapGridFind({
        rootW: 1920, rootH: 1080,
        minRows: 2, maxRows: 6,
        minCols: 2, maxCols: 8,
        gutter: 0.05,
      });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__find_1920x1080_g5",
        m0: r.m0,
        width: 1920, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("best candidate inside 1080x1920 (portrait, 2..6 × 2..6, no gutter)", () => {
      const r = snapGridFind({
        rootW: 1080, rootH: 1920,
        minRows: 2, maxRows: 6,
        minCols: 2, maxCols: 6,
      });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__find_1080x1920_nog",
        m0: r.m0,
        width: 1080, height: 1920,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("best candidate inside square 1080x1080 (3..6 × 3..6, 8% gutter)", () => {
      const r = snapGridFind({
        rootW: 1080, rootH: 1080,
        minRows: 3, maxRows: 6,
        minCols: 3, maxCols: 6,
        gutter: 0.08,
      });
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "snapgrid__find_1080x1080_g8",
        m0: r.m0,
        width: 1080, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });
  });

  describe("snapGridEnumerate", () => {
    test("enumerates valid candidates ranked by fitScore (smoke)", () => {
      const candidates = snapGridEnumerate({
        rootW: 1920, rootH: 1080,
        minRows: 2, maxRows: 5,
        minCols: 2, maxCols: 5,
        gutter: 0.05,
      });
      expect(candidates.length).toBeGreaterThan(0);
      // Sorted descending by fitScore
      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i - 1].fitScore).toBeGreaterThanOrEqual(candidates[i].fitScore);
      }
      // Top candidate's coverage and tile count are positive
      expect(candidates[0].coverage).toBeGreaterThan(0);
      expect(candidates[0].tileCount).toBeGreaterThan(0);
    });
  });
});
