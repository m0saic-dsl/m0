import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { safeCanvas } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("safeCanvas goldens", () => {
  test("8x6 grid with 10% gutter", () => {
    const r = safeCanvas({ rows: 6, cols: 8, gutter: 0.1, maxWidth: 1920, maxHeight: 1080 });
    expect(isValidM0String(r.gridResult.m0)).toBe(true);
    assertWireframeGolden({
      id: "safeCanvas__8x6_gutter10",
      m0: r.gridResult.m0,
      width: r.width, height: r.height,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("4x4 no gutter", () => {
    const r = safeCanvas({ rows: 4, cols: 4, gutter: 0, maxWidth: 1920, maxHeight: 1080 });
    expect(isValidM0String(r.gridResult.m0)).toBe(true);
    assertWireframeGolden({
      id: "safeCanvas__4x4_nogutter",
      m0: r.gridResult.m0,
      width: r.width, height: r.height,
      goldensDir: GOLDENS_DIR,
    });
  });
});
