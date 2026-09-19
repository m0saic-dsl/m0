import { wrapBelowByLogicalIndex } from "./wrapBelowByLogicalIndex";
import { addOverlayByLogicalIndex } from "./addOverlayByLogicalIndex";

describe("wrapBelowByLogicalIndex (canonical m0saic)", () => {
  test("wraps single tile", () => {
    expect(wrapBelowByLogicalIndex("1", 0)).toBe("1{1}");
  });

  test("wraps second tile in horizontal split", () => {
    expect(wrapBelowByLogicalIndex("2(1,1)", 1)).toBe("2(1,1{1})");
  });

  test("wraps first tile in horizontal split", () => {
    expect(wrapBelowByLogicalIndex("2(1,1)", 0)).toBe("2(1{1},1)");
  });

  test("target with overlay: leaf AND overlay move inside the wrap (not a no-op)", () => {
    // Unlike addOverlayByLogicalIndex — below-wrap must still work on an
    // overlay-carrying tile; the wrap swallows the attached overlay so
    // it keeps painting above the target (never the chain `1{1}{1}`).
    expect(wrapBelowByLogicalIndex("1{1}", 0)).toBe("1{1{1}}");
  });

  test("target with complex overlay keeps the overlay intact inside the wrap", () => {
    expect(wrapBelowByLogicalIndex("1{2(1,1)}", 0)).toBe("1{1{2(1,1)}}");
  });

  test("wraps nested tile", () => {
    expect(wrapBelowByLogicalIndex("2(1,2[1,1])", 2)).toBe("2(1,2[1,1{1}])");
  });

  test("counts overlay tiles: targets the leaf INSIDE an overlay body", () => {
    // 1{1}: outer tile = index 0, overlay inner tile = index 1 — same
    // parse-order vocabulary as addOverlayByLogicalIndex and the
    // sources-array mapping in Compose.
    expect(wrapBelowByLogicalIndex("1{1}", 1)).toBe("1{1{1}}");
  });

  test("stays aligned when an overlay leaf precedes the target", () => {
    // 3(1{1},1,1): index 0 = first leaf, 1 = its overlay leaf,
    // 2 = second group leaf, 3 = third. Target 2 must hit the SECOND
    // group leaf, not drift onto the third.
    expect(wrapBelowByLogicalIndex("3(1{1},1,1)", 2)).toBe("3(1{1},1{1},1)");
  });

  test("group-attached + root overlays: full Compose-doc shape", () => {
    // Root overlay `{1{1}}` and a frame overlay both present; target 4 is
    // the frame-attached overlay leaf.
    expect(wrapBelowByLogicalIndex("2(2[1,1],2[1,1{1}]){1{1}}", 4)).toBe(
      "2(2[1,1],2[1,1{1{1}}]){1{1}}",
    );
  });

  test("skips null tile — targets second F across a gap", () => {
    expect(wrapBelowByLogicalIndex("3(1,-,1)", 1)).toBe("3(1,-,1{1})");
  });

  test("skips passthrough — targets second F across a passthrough", () => {
    expect(wrapBelowByLogicalIndex("3(1,0,1)", 1)).toBe("3(1,0,1{1})");
  });

  test("returns null when targeting beyond tile count", () => {
    expect(wrapBelowByLogicalIndex("2(1,-)", 1)).toBeNull();
  });

  test("returns null on target not found", () => {
    expect(wrapBelowByLogicalIndex("2(1,1)", 4)).toBeNull();
  });

  test("returns null on invalid targetLogicalIndex", () => {
    expect(wrapBelowByLogicalIndex("1", -1)).toBeNull();
  });

  test("handles deeply nested structure", () => {
    expect(wrapBelowByLogicalIndex("2(1,2[1,2(1,1)])", 3)).toBe(
      "2(1,2[1,2(1,1{1})])",
    );
  });

  test("index vocabulary matches addOverlayByLogicalIndex on overlay-free targets", () => {
    // On a target with no overlay the two transforms emit the same
    // string — only the caller's source-array bookkeeping differs
    // (below inserts at index, above at index+1).
    // Index 0 carries an overlay and is deliberately excluded — that's
    // the one case the transforms differ (above no-ops, below wraps).
    const m0 = "2(1{1},2[1,1])";
    for (const idx of [1, 2, 3]) {
      expect(wrapBelowByLogicalIndex(m0, idx)).toBe(
        addOverlayByLogicalIndex(m0, idx),
      );
    }
  });
});
