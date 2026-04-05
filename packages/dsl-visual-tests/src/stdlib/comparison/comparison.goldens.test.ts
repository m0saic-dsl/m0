import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { comparison } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("comparison goldens", () => {
  test("2 pairs horizontal", () => {
    const r = comparison({ pairs: 2, direction: "horizontal" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "comparison__2pairs_horiz",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("1 pair vertical", () => {
    const r = comparison({ pairs: 1, direction: "vertical" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "comparison__1pair_vert",
      m0: r.m0,
      width: 1080, height: 1920,
      goldensDir: GOLDENS_DIR,
    });
  });
});
