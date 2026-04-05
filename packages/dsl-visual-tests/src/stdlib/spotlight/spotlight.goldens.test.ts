import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { spotlight } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("spotlight goldens", () => {
  test("hero + 3 bottom", () => {
    const r = spotlight({ supportCount: 3, arrangement: "bottom" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "spotlight__hero_3bottom",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("hero + 2 right", () => {
    const r = spotlight({ supportCount: 2, arrangement: "right" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "spotlight__hero_2right",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("hero + 4 l-wrap", () => {
    const r = spotlight({ supportCount: 4, arrangement: "l-wrap" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "spotlight__hero_4lwrap",
      m0: r.m0,
      width: 1080, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
