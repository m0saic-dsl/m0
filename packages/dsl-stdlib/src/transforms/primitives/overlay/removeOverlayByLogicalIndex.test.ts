import { removeOverlayByLogicalIndex } from "./removeOverlayByLogicalIndex";

describe("removeOverlayByLogicalIndex (canonical m0saic)", () => {
  test("removes overlay from single tile", () => {
    expect(removeOverlayByLogicalIndex("1{1}", 0)).toBe("1");
  });

  test("removes overlay from second tile in horizontal split", () => {
    expect(removeOverlayByLogicalIndex("2(1,1{1})", 1)).toBe("2(1,1)");
  });

  test("removes overlay from first tile in horizontal split", () => {
    expect(removeOverlayByLogicalIndex("2(1{1},1)", 0)).toBe("2(1,1)");
  });

  test("no-op when tile has no overlay", () => {
    expect(removeOverlayByLogicalIndex("1", 0)).toBe("1");
  });

  test("no-op when tile in split has no overlay", () => {
    expect(removeOverlayByLogicalIndex("2(1,1)", 0)).toBe("2(1,1)");
  });

  test("removes complex overlay", () => {
    expect(removeOverlayByLogicalIndex("1{2(1,1)}", 0)).toBe("1");
  });

  test("removes overlay from nested tile", () => {
    expect(removeOverlayByLogicalIndex("2(1,2[1,1{1}])", 2)).toBe("2(1,2[1,1])");
  });

  test("skips null tile — targets second F across a gap", () => {
    // 3(F,-,F{F}): tiles are index 0 = first F, index 1 = second F (- is skipped)
    expect(removeOverlayByLogicalIndex("3(1,-,1{1})", 1)).toBe("3(1,-,1)");
  });

  test("skips passthrough — targets second F across a passthrough", () => {
    // 3(F,>,F{F}): tiles are index 0 = first F, index 1 = second F (> is skipped)
    expect(removeOverlayByLogicalIndex("3(1,0,1{1})", 1)).toBe("3(1,0,1)");
  });

  test("returns null when targeting beyond tile count (null/passthrough not counted)", () => {
    // 2(1,-): only 1 tile, index 1 does not exist
    expect(removeOverlayByLogicalIndex("2(1,-)", 1)).toBeNull();
  });

  test("removes overlay inside existing overlay content (counts overlay tiles)", () => {
    // 1{1{1}}: outer tile = index 0, overlay inner tile = index 1 (has overlay)
    expect(removeOverlayByLogicalIndex("1{1{1}}", 1)).toBe("1{1}");
  });

  test("preserves other tiles overlays when targeting later tile", () => {
    // 2(1{1},1{1}): tile 0 = outer 1, tile 1 = overlay inner, tile 2 = second outer (has overlay)
    expect(removeOverlayByLogicalIndex("2(1{1},1{1})", 2)).toBe("2(1{1},1)");
  });

  test("returns null on target not found", () => {
    expect(removeOverlayByLogicalIndex("2(1,1)", 4)).toBeNull();
  });

  test("returns null on invalid targetLogicalIndex", () => {
    expect(removeOverlayByLogicalIndex("1", -1)).toBeNull();
  });

  test("handles deeply nested structure", () => {
    expect(removeOverlayByLogicalIndex("2(1,2[1,2(1,1{1})])", 3)).toBe(
      "2(1,2[1,2(1,1)])",
    );
  });
});
