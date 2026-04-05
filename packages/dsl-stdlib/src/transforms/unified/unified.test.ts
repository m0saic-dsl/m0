import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { split } from "./split";
import { replace } from "./replace";
import { addOverlay } from "./addOverlay";
import { removeOverlay } from "./removeOverlay";
import { setTileType } from "./setTileType";
import { measureSplit } from "./measureSplit";
import { swapFrames } from "./swapFrames";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the stableKey of the Nth frame in DFS order. */
function stableKeyAt(m0: string, index: number): string {
  const frames = parseM0StringToFullGraph(m0, 1920, 1080);
  const frame = frames.filter((f) => f.kind === "frame")[index];
  if (!frame) throw new Error(`No frame at index ${index}`);
  return String(frame.meta.stableKey);
}

/** Get the span of the Nth frame in DFS order. */
function spanAt(m0: string, index: number): { start: number; end: number } {
  const frames = parseM0StringToFullGraph(m0, 1920, 1080);
  const frame = frames.filter((f) => f.kind === "frame")[index];
  if (!frame?.meta.span) throw new Error(`No span at index ${index}`);
  return frame.meta.span;
}

// ---------------------------------------------------------------------------
// split
// ---------------------------------------------------------------------------

describe("split (unified)", () => {
  test("by logicalIndex", () => {
    expect(split("1", { by: "logicalIndex", index: 0 }, { axis: "col", count: 2 })).toBe("2(1,1)");
  });

  test("by span", () => {
    const m0 = "2(1,1)";
    const span = spanAt(m0, 1);
    expect(split(m0, { by: "span", span }, { axis: "row", count: 3 })).toBe("2(1,3[1,1,1])");
  });

  test("by stableKey", () => {
    const m0 = "2(1,1)";
    const key = stableKeyAt(m0, 0);
    expect(split(m0, { by: "stableKey", key }, { axis: "col", count: 2 })).toBe("2(2(1,1),1)");
  });

  test("throws on invalid logicalIndex", () => {
    expect(() => split("1", { by: "logicalIndex", index: 99 }, { axis: "col", count: 2 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// replace
// ---------------------------------------------------------------------------

describe("replace (unified)", () => {
  test("by logicalIndex", () => {
    expect(replace("3(1,1,1)", { by: "logicalIndex", index: 1 }, "2(1,1)")).toBe("3(1,2(1,1),1)");
  });

  test("by span", () => {
    const m0 = "3(1,1,1)";
    const span = spanAt(m0, 1);
    expect(replace(m0, { by: "span", span }, "-")).toBe("3(1,-,1)");
  });

  test("by stableKey", () => {
    const m0 = "3(1,1,1)";
    const key = stableKeyAt(m0, 2);
    expect(replace(m0, { by: "stableKey", key }, "2[1,1]")).toBe("3(1,1,2[1,1])");
  });

  test("throws on invalid logicalIndex", () => {
    expect(() => replace("1", { by: "logicalIndex", index: 5 }, "1")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// addOverlay
// ---------------------------------------------------------------------------

describe("addOverlay (unified)", () => {
  test("by logicalIndex", () => {
    expect(addOverlay("2(1,1)", { by: "logicalIndex", index: 0 })).toBe("2(1{1},1)");
  });

  test("by span", () => {
    const m0 = "2(1,1)";
    const span = spanAt(m0, 1);
    expect(addOverlay(m0, { by: "span", span })).toBe("2(1,1{1})");
  });

  test("by stableKey", () => {
    const m0 = "2(1,1)";
    const key = stableKeyAt(m0, 0);
    expect(addOverlay(m0, { by: "stableKey", key })).toBe("2(1{1},1)");
  });

  test("throws on invalid logicalIndex", () => {
    expect(() => addOverlay("1", { by: "logicalIndex", index: 10 })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// removeOverlay
// ---------------------------------------------------------------------------

describe("removeOverlay (unified)", () => {
  test("by logicalIndex", () => {
    expect(removeOverlay("2(1{1},1)", { by: "logicalIndex", index: 0 })).toBe("2(1,1)");
  });

  test("by span", () => {
    const m0 = "2(1,1{1})";
    const span = spanAt(m0, 1);
    expect(removeOverlay(m0, { by: "span", span })).toBe("2(1,1)");
  });

  test("by stableKey", () => {
    const m0 = "2(1{1},1)";
    const key = stableKeyAt(m0, 0);
    expect(removeOverlay(m0, { by: "stableKey", key })).toBe("2(1,1)");
  });

  test("no-op when no overlay present", () => {
    expect(removeOverlay("2(1,1)", { by: "logicalIndex", index: 0 })).toBe("2(1,1)");
  });
});

// ---------------------------------------------------------------------------
// setTileType
// ---------------------------------------------------------------------------

describe("setTileType (unified)", () => {
  test("by logicalIndex — frame to passthrough", () => {
    expect(setTileType("3(1,1,1)", { by: "logicalIndex", index: 0 }, ">")).toBe("3(0,1,1)");
  });

  test("by span — frame to null", () => {
    const m0 = "3(1,1,1)";
    const span = spanAt(m0, 1);
    expect(setTileType(m0, { by: "span", span }, "-")).toBe("3(1,-,1)");
  });

  test("by stableKey — frame to null", () => {
    const m0 = "3(1,1,1)";
    const key = stableKeyAt(m0, 2);
    expect(setTileType(m0, { by: "stableKey", key }, "-")).toBe("3(1,1,-)");
  });
});

// ---------------------------------------------------------------------------
// measureSplit
// ---------------------------------------------------------------------------

describe("measureSplit (unified)", () => {
  test("by logicalIndex", () => {
    const result = measureSplit("1", { by: "logicalIndex", index: 0 }, {
      axis: "col", count: 4, ranges: [{ a: 0, b: 1 }],
    });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(1);
  });

  test("by span", () => {
    const m0 = "2(1,1)";
    const span = spanAt(m0, 0);
    const result = measureSplit(m0, { by: "span", span }, {
      axis: "row", count: 3, ranges: [{ a: 0, b: 2 }],
    });
    expect(typeof result).toBe("string");
  });

  test("by stableKey", () => {
    const m0 = "2(1,1)";
    const key = stableKeyAt(m0, 1);
    const result = measureSplit(m0, { by: "stableKey", key }, {
      axis: "col", count: 2, ranges: [{ a: 0, b: 1 }],
    });
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// swapFrames
// ---------------------------------------------------------------------------

describe("swapFrames (unified)", () => {
  test("swaps two tiles", () => {
    expect(swapFrames("3(1{1},1,1)", 0, 2)).toBe("3(1,1,1{1})");
  });

  test("no-op when indices are the same", () => {
    expect(swapFrames("2(1,1)", 0, 0)).toBe("2(1,1)");
  });
});
