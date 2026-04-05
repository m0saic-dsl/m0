import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { placeRect } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("placeRect goldens", () => {
  test("centered rect", () => {
    const r = placeRect({ rootW: 1920, rootH: 1080, rectW: 1280, rectH: 720 });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "placeRect__centered_1280x720",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("small rect top-left", () => {
    const r = placeRect({ rootW: 1920, rootH: 1080, rectW: 480, rectH: 270, hAlign: "left", vAlign: "top" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "placeRect__small_topleft",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
