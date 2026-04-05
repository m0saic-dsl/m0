import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { assertWireframeGolden } from "../stdlib/__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");
const W = 1920;
const H = 1080;

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — core DSL parser geometry
//
// These test fundamental parsing behaviors at the DSL layer:
// splits, nesting, passthrough donation, overlays, nulls, remainder
// distribution. If splitEven or overlay stacking changes, these break.
// ---------------------------------------------------------------------------

describe("core DSL parser goldens", () => {
  // ── Basic splits ──

  test("2-col split", () => {
    assertWireframeGolden({
      id: "core__2col",
      m0: "2(1,1)",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("3-row split", () => {
    assertWireframeGolden({
      id: "core__3row",
      m0: "3[1,1,1]",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("4-col split (remainder distribution)", () => {
    // 1920 / 4 = 480 even — no remainder
    assertWireframeGolden({
      id: "core__4col",
      m0: "4(1,1,1,1)",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("7-col split (outside-in remainder)", () => {
    // 1920 / 7 = 274 base, remainder 2 → outside-in: edges get +1
    const m = "7(1,1,1,1,1,1,1)";
    expect(isValidM0String(m)).toBe(true);
    assertWireframeGolden({
      id: "core__7col_remainder",
      m0: m,
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ── Cross-axis nesting (grid) ──

  test("3x3 grid (col then row)", () => {
    assertWireframeGolden({
      id: "core__3x3_grid",
      m0: "3(3[1,1,1],3[1,1,1],3[1,1,1])",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ── Same-axis nesting ──

  test("nested col splits: 2(3(1,1,1),1)", () => {
    assertWireframeGolden({
      id: "core__nested_col",
      m0: "2(3(1,1,1),1)",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ── Passthrough donation ──

  test("passthrough: 3(0,0,1) — all space to last tile", () => {
    assertWireframeGolden({
      id: "core__passthrough_3_0_0_1",
      m0: "3(0,0,1)",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("interleaved passthrough: 4(0,1,0,1)", () => {
    assertWireframeGolden({
      id: "core__passthrough_interleaved",
      m0: "4(0,1,0,1)",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ── Null slots ──

  test("null gap: 3(1,-,1)", () => {
    assertWireframeGolden({
      id: "core__null_gap",
      m0: "3(1,-,1)",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ── Overlays ──

  test("simple overlay: 1{1}", () => {
    assertWireframeGolden({
      id: "core__overlay_simple",
      m0: "1{1}",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("overlay with split: 1{2(1,1)}", () => {
    assertWireframeGolden({
      id: "core__overlay_split",
      m0: "1{2(1,1)}",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("nested overlay: 1{1{1}}", () => {
    assertWireframeGolden({
      id: "core__overlay_nested",
      m0: "1{1{1}}",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  test("overlay on split: 2(1,1){1}", () => {
    assertWireframeGolden({
      id: "core__overlay_on_split",
      m0: "2(1,1){1}",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ── Complex composition ──

  test("mixed: 2(1{3[1,1,1]},3(0,1,1))", () => {
    assertWireframeGolden({
      id: "core__mixed_overlay_passthrough",
      m0: "2(1{3[1,1,1]},3(0,1,1))",
      width: W, height: H,
      goldensDir: GOLDENS_DIR,
    });
  });
});
