import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { goldenSplit, goldenSpiral, goldenRect } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("golden goldens", () => {
  describe("goldenSplit", () => {
    test("col, dominant first (default 21/13)", () => {
      const m0 = goldenSplit({ axis: "col" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__split_col_dominantfirst",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("col, dominant second (small-then-large)", () => {
      const m0 = goldenSplit({ axis: "col", dominantFirst: false });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__split_col_dominantsecond",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("row, dominant first", () => {
      const m0 = goldenSplit({ axis: "row" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__split_row_dominantfirst",
        m0,
        width: 1080, height: 1620,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("col, precision 13/8 (compact DSL)", () => {
      const m0 = goldenSplit({ axis: "col", precision: "13/8" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__split_col_p13_8",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });
  });

  describe("goldenSpiral", () => {
    test("depth 3, br corner", () => {
      const m0 = goldenSpiral({ depth: 3, direction: "br" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__spiral_d3_br",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("depth 5, br corner", () => {
      const m0 = goldenSpiral({ depth: 5, direction: "br" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__spiral_d5_br",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("depth 4, tl corner", () => {
      const m0 = goldenSpiral({ depth: 4, direction: "tl" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__spiral_d4_tl",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("depth 4, tr corner", () => {
      const m0 = goldenSpiral({ depth: 4, direction: "tr" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__spiral_d4_tr",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("depth 4, bl corner", () => {
      const m0 = goldenSpiral({ depth: 4, direction: "bl" });
      expect(isValidM0String(m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__spiral_d4_bl",
        m0,
        width: 1620, height: 1000,
        goldensDir: GOLDENS_DIR,
      });
    });
  });

  describe("goldenRect", () => {
    test("auto-landscape inside 1920x1080 (height-constrained)", () => {
      const r = goldenRect({ rootW: 1920, rootH: 1080 });
      expect(r.landscape).toBe(true);
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__rect_auto_1920x1080",
        m0: r.m0,
        width: 1920, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("auto-portrait inside 1080x1920", () => {
      const r = goldenRect({ rootW: 1080, rootH: 1920 });
      expect(r.landscape).toBe(false);
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__rect_auto_1080x1920",
        m0: r.m0,
        width: 1080, height: 1920,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("forced landscape inside square 1080x1080 (width-constrained letterbox)", () => {
      const r = goldenRect({ rootW: 1080, rootH: 1080, orientation: "landscape" });
      expect(r.landscape).toBe(true);
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__rect_forced_landscape_square",
        m0: r.m0,
        width: 1080, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("forced portrait inside 1920x1080 (heavy pillarbox)", () => {
      const r = goldenRect({
        rootW: 1920, rootH: 1080,
        orientation: "portrait",
        hAlign: "left", vAlign: "top",
      });
      expect(r.landscape).toBe(false);
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__rect_forced_portrait_in_1920x1080_topleft",
        m0: r.m0,
        width: 1920, height: 1080,
        goldensDir: GOLDENS_DIR,
      });
    });

    test("auto inside 1600x900 canvas (visible pillarbox)", () => {
      // 1600/900 ≈ 1.778 > φ → height-constrained landscape
      // rectW = round(900 × φ) = 1456, rectH = 900 → 144px pillarbox total
      const r = goldenRect({ rootW: 1600, rootH: 900 });
      expect(r.landscape).toBe(true);
      expect(isValidM0String(r.m0)).toBe(true);
      assertWireframeGolden({
        id: "golden__rect_auto_1600x900",
        m0: r.m0,
        width: 1600, height: 900,
        goldensDir: GOLDENS_DIR,
      });
    });
  });
});
