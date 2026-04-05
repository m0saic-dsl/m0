import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { rankedList } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

describe("rankedList goldens", () => {
  test("3 items steep vertical", () => {
    const r = rankedList({ count: 3, decay: "steep", direction: "vertical" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "rankedList__3_steep_vert",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("5 items gentle horizontal", () => {
    const r = rankedList({ count: 5, decay: "gentle", direction: "horizontal" });
    expect(isValidM0String(r.m0)).toBe(true);
    assertWireframeGolden({
      id: "rankedList__5_gentle_horiz",
      m0: r.m0,
      width: 1920, height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
