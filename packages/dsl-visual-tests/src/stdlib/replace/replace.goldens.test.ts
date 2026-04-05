import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { replace } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — replace transform
// ---------------------------------------------------------------------------

describe("replace goldens", () => {
  // ---- Replace middle tile with a split ----

  test("replace middle tile with 2-col split", () => {
    // Before: 3(1,1,1) — three equal tiles
    const m = replace("3(1,1,1)", { by: "logicalIndex", index: 1 }, "2(1,1)");
    expect(isValidM0String(m)).toBe(true);
    // After: middle region subdivided, outer tiles unchanged
    expect(m).toBe("3(1,2(1,1),1)");

    assertWireframeGolden({
      id: "replace__mid_tile_with_2col",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Replace first tile with deeper structure ----

  test("replace first tile with 3-col split", () => {
    // Before: 3(1,1,1) — three equal tiles
    const m = replace("3(1,1,1)", { by: "logicalIndex", index: 0 }, "3(1,1,1)");
    expect(isValidM0String(m)).toBe(true);
    // After: first region subdivided into 3 columns
    expect(m).toBe("3(3(1,1,1),1,1)");

    assertWireframeGolden({
      id: "replace__first_tile_with_3col",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Replace nested group with simple tile (collapse) ----

  test("collapse nested group to simple tile via span", () => {
    // Before: 3(1,2(1,1),1) — middle region is a 2-col split
    // The group 2(1,1) spans characters 4..10 in canonical form
    const m = replace("3(1,2(1,1),1)", { by: "span", span: { start: 4, end: 10 } }, "1");
    expect(isValidM0String(m)).toBe(true);
    // After: center collapses back to a simple tile
    expect(m).toBe("3(1,1,1)");

    assertWireframeGolden({
      id: "replace__collapse_nested_to_tile",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Overlay preserved during replace ----

  test("overlay transfers to replacement", () => {
    // Before: 3(1,1{1},1) — middle tile has overlay {1}
    const m = replace("3(1,1{1},1)", { by: "logicalIndex", index: 1 }, "2(1,1)");
    expect(isValidM0String(m)).toBe(true);
    // After: overlay reattached to the replacement group
    expect(m).toBe("3(1,2(1,1){1},1)");

    assertWireframeGolden({
      id: "replace__overlay_preserved",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
