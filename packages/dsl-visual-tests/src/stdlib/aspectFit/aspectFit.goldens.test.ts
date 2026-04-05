import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { aspectFit } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("aspectFit goldens", () => {
  test("16:9 in 1920x1080 (exact fit)", () => {
    const r = aspectFit({ rootW: 1920, rootH: 1080, target: { w: 16, h: 9 } });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "aspectFit__16x9_in_1920x1080",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("1:1 square in 1920x1080 (pillarbox)", () => {
    const r = aspectFit({ rootW: 1920, rootH: 1080, target: { w: 1, h: 1 } });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "aspectFit__1x1_in_1920x1080",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("21:9 ultrawide in 1080x1080 (letterbox)", () => {
    const r = aspectFit({ rootW: 1080, rootH: 1080, target: { w: 21, h: 9 } });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "aspectFit__21x9_in_1080x1080",
      m0: r.m0,
      width: 1080, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
