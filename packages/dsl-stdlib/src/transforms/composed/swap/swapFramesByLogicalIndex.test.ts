import { swapFramesByLogicalIndex } from "./swapFramesByLogicalIndex";

describe("swapFramesByLogicalIndex", () => {
  // ---- Basic swap ----

  test("swap two frames in a simple container", () => {
    // Frames are identical bare frames — result is textually the same
    expect(swapFramesByLogicalIndex("2(1,1)", 0, 1)).toBe("2(1,1)");
  });

  test("swap order does not matter", () => {
    const m0 = "2(1{1},1)";
    expect(swapFramesByLogicalIndex(m0, 0, 1)).toBe(
      swapFramesByLogicalIndex(m0, 1, 0),
    );
  });

  // ---- Overlay travels with frame ----

  test("overlay on first frame moves to second position", () => {
    expect(swapFramesByLogicalIndex("2(1{1},1)", 0, 1)).toBe("2(1,1{1})");
  });

  test("overlay on second frame moves to first position", () => {
    expect(swapFramesByLogicalIndex("2(1,1{1})", 0, 1)).toBe("2(1{1},1)");
  });

  test("both frames have overlays — overlays swap", () => {
    expect(swapFramesByLogicalIndex("2(1{1},1{2(1,1)})", 0, 1)).toBe(
      "2(1{2(1,1)},1{1})",
    );
  });

  test("complex overlay content travels correctly", () => {
    expect(swapFramesByLogicalIndex("2(1{2(1,1)},1)", 0, 1)).toBe(
      "2(1,1{2(1,1)})",
    );
  });

  // ---- Passthroughs and nulls skipped ----

  test("passthroughs not counted in logical index", () => {
    // "3(1,0,1)" — frame 0 is at position 0, frame 1 is at position 2
    // swap overlay from frame 0 to frame 1
    expect(swapFramesByLogicalIndex("3(1{1},0,1)", 0, 1)).toBe(
      "3(1,0,1{1})",
    );
  });

  test("null tokens not counted", () => {
    expect(swapFramesByLogicalIndex("3(1{1},-,1)", 0, 1)).toBe(
      "3(1,-,1{1})",
    );
  });

  // ---- Same index (no-op) ----

  test("same index is a no-op", () => {
    expect(swapFramesByLogicalIndex("2(1{1},1)", 0, 0)).toBe("2(1{1},1)");
  });

  test("same index with no overlays", () => {
    expect(swapFramesByLogicalIndex("3(1,1,1)", 1, 1)).toBe("3(1,1,1)");
  });

  // ---- Nested structures ----

  test("swap frames in nested containers", () => {
    // "2(1{1},2[1,1])" — frame 0 has overlay, frames 1 and 2 don't
    // swap frame 0 and frame 2 (inside nested group)
    expect(swapFramesByLogicalIndex("2(1{1},2[1,1])", 0, 2)).toBe(
      "2(1,2[1,1{1}])",
    );
  });

  test("swap frames across different nesting levels", () => {
    expect(swapFramesByLogicalIndex("2[2(1,1{1}),1]", 1, 2)).toBe(
      "2[2(1,1),1{1}]",
    );
  });

  // ---- Frames inside overlays ----

  test("frames inside overlay bodies are counted and swappable", () => {
    // "1{2(1{1},1)}" — frame 0 is root (has overlay), frame 1 inside overlay has {1}, frame 2 doesn't
    // swap frames 1 and 2 (both inside the overlay body)
    expect(swapFramesByLogicalIndex("1{2(1{1},1)}", 1, 2)).toBe(
      "1{2(1,1{1})}",
    );
  });

  // ---- 3+ frames ----

  test("swap non-adjacent frames", () => {
    expect(swapFramesByLogicalIndex("4(1{1},1,1,1{2(1,1)})", 0, 3)).toBe(
      "4(1{2(1,1)},1,1,1{1})",
    );
  });

  test("swap middle frames", () => {
    expect(swapFramesByLogicalIndex("3(1,1{1},1)", 0, 1)).toBe(
      "3(1{1},1,1)",
    );
  });

  // ---- Pretty output ----

  test("pretty output option", () => {
    expect(
      swapFramesByLogicalIndex("2(1{1},1)", 0, 1, { output: "pretty" }),
    ).toBe("2(F,F{F})");
  });

  // ---- Pretty input ----

  test("pretty input accepted and canonicalized", () => {
    expect(swapFramesByLogicalIndex("2(F{F},F)", 0, 1)).toBe("2(1,1{1})");
  });

  // ---- Group overlay preserved ----

  test("group overlay is not affected by frame swap", () => {
    expect(swapFramesByLogicalIndex("2(1{1},1){1}", 0, 1)).toBe(
      "2(1,1{1}){1}",
    );
  });

  // ---- Error cases ----

  test("throws if indexA out of range", () => {
    expect(() => swapFramesByLogicalIndex("2(1,1)", 0, 5)).toThrow(
      /not found/i,
    );
  });

  test("throws if indexB out of range", () => {
    expect(() => swapFramesByLogicalIndex("2(1,1)", 5, 0)).toThrow(
      /not found/i,
    );
  });

  test("throws on negative indexA", () => {
    expect(() => swapFramesByLogicalIndex("2(1,1)", -1, 0)).toThrow(
      /indexA must be >= 0/,
    );
  });

  test("throws on negative indexB", () => {
    expect(() => swapFramesByLogicalIndex("2(1,1)", 0, -1)).toThrow(
      /indexB must be >= 0/,
    );
  });

  test("throws on invalid input", () => {
    expect(() => swapFramesByLogicalIndex("(", 0, 1)).toThrow(
      /invalid input/i,
    );
  });
});
