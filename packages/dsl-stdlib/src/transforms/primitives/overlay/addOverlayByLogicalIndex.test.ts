import { addOverlayByLogicalIndex } from "./addOverlayByLogicalIndex";

describe("addOverlayByLogicalIndex (canonical m0saic)", () => {
  test("adds overlay to single tile", () => {
    expect(addOverlayByLogicalIndex("1", 0)).toBe("1{1}");
  });

  test("adds overlay to second tile in horizontal split", () => {
    expect(addOverlayByLogicalIndex("2(1,1)", 1)).toBe("2(1,1{1})");
  });

  test("adds overlay to first tile in horizontal split", () => {
    expect(addOverlayByLogicalIndex("2(1,1)", 0)).toBe("2(1{1},1)");
  });

  test("no-op when tile already has overlay", () => {
    expect(addOverlayByLogicalIndex("1{1}", 0)).toBe("1{1}");
  });

  test("no-op when tile has complex overlay", () => {
    expect(addOverlayByLogicalIndex("1{2(1,1)}", 0)).toBe("1{2(1,1)}");
  });

  test("adds overlay to nested tile", () => {
    expect(addOverlayByLogicalIndex("2(1,2[1,1])", 2)).toBe("2(1,2[1,1{1}])");
  });

  test("skips null tile — targets second F across a gap", () => {
    // 3(F,-,F): tiles are index 0 = first F, index 1 = second F (- is skipped)
    expect(addOverlayByLogicalIndex("3(1,-,1)", 1)).toBe("3(1,-,1{1})");
  });

  test("skips passthrough — targets second F across a passthrough", () => {
    // 3(F,>,F): tiles are index 0 = first F, index 1 = second F (> is skipped)
    expect(addOverlayByLogicalIndex("3(1,0,1)", 1)).toBe("3(1,0,1{1})");
  });

  test("returns null when targeting beyond tile count (null/passthrough not counted)", () => {
    // 2(1,-): only 1 tile, index 1 does not exist
    expect(addOverlayByLogicalIndex("2(1,-)", 1)).toBeNull();
  });

  test("adds overlay inside existing overlay content (counts overlay tiles)", () => {
    // 1{1}: outer tile = index 0, overlay inner tile = index 1
    expect(addOverlayByLogicalIndex("1{1}", 1)).toBe("1{1{1}}");
  });

  test("preserves other tiles overlays when targeting later tile", () => {
    // 2(1{1},1): tile 0 = outer 1, tile 1 = overlay inner 1, tile 2 = second 1
    expect(addOverlayByLogicalIndex("2(1{1},1)", 2)).toBe("2(1{1},1{1})");
  });

  test("returns null on target not found", () => {
    expect(addOverlayByLogicalIndex("2(1,1)", 4)).toBeNull();
  });

  test("returns null on invalid targetLogicalIndex", () => {
    expect(addOverlayByLogicalIndex("1", -1)).toBeNull();
  });

  test("handles deeply nested structure", () => {
    expect(addOverlayByLogicalIndex("2(1,2[1,2(1,1)])", 3)).toBe(
      "2(1,2[1,2(1,1{1})])",
    );
  });
});
