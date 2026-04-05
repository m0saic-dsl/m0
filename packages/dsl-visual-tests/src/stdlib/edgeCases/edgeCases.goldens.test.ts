import * as path from "path";
import { isValidM0String } from "@m0saic/dsl";
import { setTileType } from "@m0saic/dsl-stdlib";
import { assertWireframeGolden } from "../__harness__/goldens";

const GOLDENS_DIR = path.join(__dirname, "__goldens__");

// ---------------------------------------------------------------------------
// Golden wireframe PNG tests — geometry edge-case semantics
// ---------------------------------------------------------------------------

describe("edge-case goldens", () => {
  // ---- Passthrough: first tile donates to next claimant ----

  test("first tile -> passthrough (second tile absorbs space)", () => {
    const m = setTileType("3(1,1,1)", { by: "logicalIndex", index: 0 }, ">");
    expect(isValidM0String(m)).toBe(true);
    // Tile 0 becomes passthrough; tile 1 absorbs its space → double-width
    expect(m).toBe("3(0,1,1)");

    assertWireframeGolden({
      id: "edge__passthrough__first_of_3",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Null: middle tile creates empty gap ----

  test("middle tile -> null (center gap)", () => {
    const m = setTileType("3(1,1,1)", { by: "logicalIndex", index: 1 }, "-");
    expect(isValidM0String(m)).toBe(true);
    // Tile 1 becomes null — space consumed as empty gap
    expect(m).toBe("3(1,-,1)");

    assertWireframeGolden({
      id: "edge__null__middle_of_3",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Consecutive passthroughs chain into one claimant ----

  test("two consecutive passthroughs -> third tile absorbs both", () => {
    // Step 1: tile 0 -> passthrough. Rendered indices shift.
    const step1 = setTileType("4(1,1,1,1)", { by: "logicalIndex", index: 0 }, ">");
    // Step 2: logical index 0 now targets original tile 1.
    const m = setTileType(step1, { by: "logicalIndex", index: 0 }, ">");
    expect(isValidM0String(m)).toBe(true);
    // Two passthroughs chain: tile 2 absorbs 3 slots worth of space
    expect(m).toBe("4(0,0,1,1)");

    assertWireframeGolden({
      id: "edge__passthrough__chain_2_of_4",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Non-leading passthrough ----

  test("non-leading passthrough (tile 1 of 4 donates to tile 2)", () => {
    const m = setTileType("4(1,1,1,1)", { by: "logicalIndex", index: 1 }, ">");
    expect(isValidM0String(m)).toBe(true);
    // Tile 0 unchanged; tile 1 donates to tile 2; tile 3 unchanged
    expect(m).toBe("4(1,0,1,1)");

    assertWireframeGolden({
      id: "edge__passthrough__mid_1_of_4",
      m0: m,
      width: 1920,
      height: 1080,
      goldensDir: GOLDENS_DIR,
    });
  });

  // ---- Row-oriented: passthrough in vertical split ----

  test("passthrough in vertical split (row axis)", () => {
    const m = setTileType("3[1,1,1]", { by: "logicalIndex", index: 0 }, ">");
    expect(isValidM0String(m)).toBe(true);
    // Same donation semantics on vertical axis
    expect(m).toBe("3[0,1,1]");

    assertWireframeGolden({
      id: "edge__passthrough__row_first_of_3",
      m0: m,
      width: 1080,
      height: 1920,
      goldensDir: GOLDENS_DIR,
    });
  });
});
