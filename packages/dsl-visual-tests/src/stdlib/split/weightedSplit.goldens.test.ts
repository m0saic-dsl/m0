import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { weightedSplit } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests
// ---------------------------------------------------------------------------

describe("weightedSplit goldens", () => {
  test("[1,1] col", () => {
    const m = weightedSplit([1, 1], "col");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-weighted-split-m0saic__col_1-1__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("[1,1] row", () => {
    const m = weightedSplit([1, 1], "row");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-weighted-split-m0saic__row_1-1__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("[2,1] col", () => {
    const m = weightedSplit([2, 1], "col");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-weighted-split-m0saic__col_2-1__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("[2,1] row", () => {
    const m = weightedSplit([2, 1], "row");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-weighted-split-m0saic__row_2-1__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("[3,2,1] col", () => {
    const m = weightedSplit([3, 2, 1], "col");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-weighted-split-m0saic__col_3-2-1__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("[3,2,1] row", () => {
    const m = weightedSplit([3, 2, 1], "row");
    expect(isValidM0String(m)).toBe(true);

    assertWireframeGolden({
      id: "build-weighted-split-m0saic__row_3-2-1__1920x1080",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
