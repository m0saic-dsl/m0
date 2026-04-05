import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import {
  addOverlayToAllFrames,
  addOverlay,
} from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — overlay attachment
// ---------------------------------------------------------------------------

describe("overlay goldens", () => {
  // ---- Simple: all tiles in a 2-tile layout ----

  test("addOverlayToAllFrames — simple 2-col", () => {
    const m = addOverlayToAllFrames("2(1,1)");
    expect(isValidM0String(m)).toBe(true);
    // Expected: "2(1{1},1{1})"
    expect(m).toBe("2(1{1},1{1})");

    assertWireframeGolden({
      id: "overlay__all__2-col",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Passthrough + null skipped ----

  test("addOverlayToAllFrames — passthrough and null skipped", () => {
    // 4 slots: rendered, passthrough, null, rendered
    const m = addOverlayToAllFrames("4(1,0,-,1)");
    expect(isValidM0String(m)).toBe(true);
    // Only the two rendered tiles get overlays
    expect(m).toBe("4(1{1},0,-,1{1})");

    assertWireframeGolden({
      id: "overlay__all__skip_passthrough_null",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Preserve existing child overlay ----

  test("addOverlayToAllFrames — preserve existing child overlay", () => {
    // First child already overlaid, second is bare
    const m = addOverlayToAllFrames("2(1{1},1)");
    expect(isValidM0String(m)).toBe(true);
    // Existing overlay preserved, bare tile gets one
    expect(m).toBe("2(1{1},1{1})");

    assertWireframeGolden({
      id: "overlay__all__preserve_existing",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Group overlay preserved, children also get overlays ----

  test("addOverlayToAllFrames — group overlay preserved", () => {
    const m = addOverlayToAllFrames("2(1,1){1}");
    expect(isValidM0String(m)).toBe(true);
    // Group overlay untouched, child tiles get overlays
    expect(m).toBe("2(1{1},1{1}){1}");

    assertWireframeGolden({
      id: "overlay__all__group_overlay_preserved",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Nested layout — all rendered leaves get overlays ----

  test("addOverlayToAllFrames — nested 3 leaves", () => {
    // 2(2(1,1),1) — 3 rendered leaves across 2 nesting levels
    const m = addOverlayToAllFrames("2(2(1,1),1)");
    expect(isValidM0String(m)).toBe(true);
    // All 3 rendered leaves get overlays
    expect(m).toBe("2(2(1{1},1{1}),1{1})");

    assertWireframeGolden({
      id: "overlay__all__nested_3_leaves",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Single-target overlay via addOverlayByLogicalIndex ----

  test("addOverlay — target tile 1 of 3", () => {
    // 3(1,1,1) — add overlay only to the middle tile (index 1)
    const m = addOverlay("3(1,1,1)", { by: "logicalIndex", index: 1 });
    expect(isValidM0String(m)).toBe(true);
    expect(m).toBe("3(1,1{1},1)");

    assertWireframeGolden({
      id: "overlay__single__target_1_of_3",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });
});
