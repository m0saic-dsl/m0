import { addOverlayToAllFrames } from "./addOverlayToAllFrames";

describe("addOverlayToAllFrames", () => {
  // ---- Basic: single frame ----

  test("single frame gets overlay", () => {
    expect(addOverlayToAllFrames("1")).toBe("1{1}");
  });

  test("single frame (pretty form) gets overlay", () => {
    expect(addOverlayToAllFrames("F")).toBe("1{1}");
  });

  test("single frame already with overlay — preserved as-is", () => {
    expect(addOverlayToAllFrames("1{1}")).toBe("1{1}");
  });

  // ---- Multiple frames ----

  test("3 cols, no overlays → all get overlays", () => {
    expect(addOverlayToAllFrames("3(1,1,1)")).toBe("3(1{1},1{1},1{1})");
  });

  test("2 rows, no overlays", () => {
    expect(addOverlayToAllFrames("2[1,1]")).toBe("2[1{1},1{1}]");
  });

  test("mixed: some frames already have overlays", () => {
    expect(addOverlayToAllFrames("2[1{1},1]")).toBe("2[1{1},1{1}]");
  });

  test("all frames already have overlays — no change", () => {
    expect(addOverlayToAllFrames("2(1{1},1{1})")).toBe("2(1{1},1{1})");
  });

  // ---- Passthrough and null tokens ----

  test("passthroughs skipped, only frames get overlays", () => {
    expect(addOverlayToAllFrames("3(1,0,1)")).toBe("3(1{1},0,1{1})");
  });

  test("null tokens skipped", () => {
    expect(addOverlayToAllFrames("3(1,-,1)")).toBe("3(1{1},-,1{1})");
  });

  test("pretty passthrough form normalized", () => {
    expect(addOverlayToAllFrames("3(F,>,F)")).toBe("3(1{1},0,1{1})");
  });

  // ---- Group overlays preserved ----

  test("group overlay preserved, child frames get overlays", () => {
    expect(addOverlayToAllFrames("2(1,1){1}")).toBe("2(1{1},1{1}){1}");
  });

  test("group overlay with existing child overlays — all preserved", () => {
    expect(addOverlayToAllFrames("2(1{1},1){1}")).toBe("2(1{1},1{1}){1}");
  });

  // ---- Nested structures (classifiers) ----

  test("nested split — frames at all structural levels get overlays", () => {
    expect(addOverlayToAllFrames("2(1,2[1,1])")).toBe(
      "2(1{1},2[1{1},1{1}])",
    );
  });

  test("deeply nested classifiers", () => {
    expect(addOverlayToAllFrames("2[2(1,1),2(1,1)]")).toBe(
      "2[2(1{1},1{1}),2(1{1},1{1})]",
    );
  });

  // ---- Overlay bodies are NOT recursed into ----

  test("existing overlay body preserved verbatim — no recursion", () => {
    // 1{1} — root frame already has overlay, entire thing preserved
    expect(addOverlayToAllFrames("1{1}")).toBe("1{1}");
  });

  test("existing overlay with complex body preserved verbatim", () => {
    // 1{2(1,1)} — root frame has overlay, body not modified
    expect(addOverlayToAllFrames("1{2(1,1)}")).toBe("1{2(1,1)}");
  });

  test("nested overlay depth preserved verbatim", () => {
    expect(addOverlayToAllFrames("1{1{1}}")).toBe("1{1{1}}");
  });

  test("group overlay body not recursed into", () => {
    // 2(1,1){2(1,1)} — group overlay body preserved
    expect(addOverlayToAllFrames("2(1,1){2(1,1)}")).toBe(
      "2(1{1},1{1}){2(1,1)}",
    );
  });

  // ---- Weighted / passthrough-heavy ----

  test("weighted split frames get overlays", () => {
    expect(addOverlayToAllFrames("5(0,0,1,0,1)")).toBe("5(0,0,1{1},0,1{1})");
  });

  // ---- Pretty output ----

  test("pretty output option", () => {
    expect(addOverlayToAllFrames("2(1,1)", { output: "pretty" })).toBe(
      "2(F{F},F{F})",
    );
  });

  // ---- Edge cases ----

  test("frame with complex overlay content preserved verbatim", () => {
    // First frame's overlay body is preserved; second frame gets a new overlay
    expect(addOverlayToAllFrames("2(1{2(1,1)},1)")).toBe(
      "2(1{2(1,1)},1{1})",
    );
  });

  // ---- Invalid input ----

  test("invalid input throws", () => {
    expect(() => addOverlayToAllFrames("(")).toThrow(/invalid input/i);
  });

  test("empty string throws", () => {
    expect(() => addOverlayToAllFrames("")).toThrow(/invalid input/i);
  });
});
