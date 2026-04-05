import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { equalSplit } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests
// ---------------------------------------------------------------------------

describe("equalSplit goldens", () => {
  test("2 col", () => {
    const m = equalSplit(2, "col");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-equal-split-m0saic__col_2__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("2 row", () => {
    const m = equalSplit(2, "row");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-equal-split-m0saic__row_2__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("3 col", () => {
    const m = equalSplit(3, "col");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-equal-split-m0saic__col_3__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("3 row", () => {
    const m = equalSplit(3, "row");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-equal-split-m0saic__row_3__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("4 col", () => {
    const m = equalSplit(4, "col");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-equal-split-m0saic__col_4__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("4 row", () => {
    const m = equalSplit(4, "row");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-equal-split-m0saic__row_4__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
