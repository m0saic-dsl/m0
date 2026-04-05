import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { swapFrames } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — swap transform
// ---------------------------------------------------------------------------

describe("swap goldens", () => {
  // ---- Overlay travels with its tile ----

  test("overlay moves from first to last tile", () => {
    // Before: 3(1{1},1,1) — only tile 0 has overlay
    const m = swapFrames("3(1{1},1,1)", 0, 2);
    expect(isValidM0String(m)).toBe(true);
    // After: overlay now on tile 2 (last position)
    expect(m).toBe("3(1,1,1{1})");

    assertWireframeGolden({
      id: "swap__overlay_first_to_last",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Both tiles have overlays — overlays exchange ----

  test("both overlays exchange positions", () => {
    // Before: 2(1{1},1{2(1,1)}) — tile 0 has simple overlay, tile 1 has complex overlay
    const m = swapFrames("2(1{1},1{2(1,1)})", 0, 1);
    expect(isValidM0String(m)).toBe(true);
    // After: overlay contents swap
    expect(m).toBe("2(1{2(1,1)},1{1})");

    assertWireframeGolden({
      id: "swap__both_overlays_exchange",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Cross-nesting swap: overlay moves into nested group ----

  test("overlay moves from outer tile into nested group", () => {
    // Before: 2(1{1},2[1,1]) — tile 0 (outer) has overlay; tiles 1,2 (inner) don't
    // Swap tiles 0 and 2: overlay travels to the last leaf inside the nested group
    const m = swapFrames("2(1{1},2[1,1])", 0, 2);
    expect(isValidM0String(m)).toBe(true);
    expect(m).toBe("2(1,2[1,1{1}])");

    assertWireframeGolden({
      id: "swap__overlay_into_nested",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
