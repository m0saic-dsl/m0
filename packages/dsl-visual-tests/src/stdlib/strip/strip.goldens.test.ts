import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { strip } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — strip builder
// ---------------------------------------------------------------------------

describe("strip goldens", () => {
  // ---- No gutters ----

  test("3 col no gutter", () => {
    const m = strip(3, "col", { cellWeight: 50 });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__col_3__cw50__no_gutter",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("3 row no gutter", () => {
    const m = strip(3, "row", { cellWeight: 50 });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__row_3__cw50__no_gutter",
      m0: m,
      width: 1080,
      height: 1920,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Inner gutters ----

  test("3 col inner gutters", () => {
    const m = strip(3, "col", { cellWeight: 50, gutterWeight: 5 });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__col_3__cw50__gw5__inner",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Outer gutters ----

  test("3 col outer gutters", () => {
    const m = strip(3, "col", {
      cellWeight: 50,
      gutterWeight: 5,
      outerGutters: true,
    });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__col_3__cw50__gw5__outer",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Single cell ----

  test("1 col single cell", () => {
    const m = strip(1, "col", { cellWeight: 50 });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__col_1__cw50",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Large gutter ratio ----

  test("2 col large gutter ratio", () => {
    const m = strip(2, "col", {
      cellWeight: 100,
      gutterWeight: 50,
      outerGutters: true,
    });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__col_2__cw100__gw50__outer",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Tall vertical strip ----

  test("5 row with gutters", () => {
    const m = strip(5, "row", { cellWeight: 20, gutterWeight: 2 });
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "strip__row_5__cw20__gw2__inner",
      m0: m,
      width: 1080,
      height: 1920,
      goldensDir: GOLDENS_DIR,
    });
  });
});
