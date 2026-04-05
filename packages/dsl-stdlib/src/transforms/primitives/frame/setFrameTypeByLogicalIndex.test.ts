import { setFrameTypeByLogicalIndex } from "./setFrameTypeByLogicalIndex";

describe("setFrameTypeByLogicalIndex (canonical m0saic)", () => {
  test("changes second frame to null", () => {
    expect(setFrameTypeByLogicalIndex("2(1,1)", 1, "-")).toBe("2(1,-)");
  });

  test("changes first frame to passthrough", () => {
    expect(setFrameTypeByLogicalIndex("2(1,1)", 0, "0")).toBe("2(0,1)");
  });

  test("changes nested frame", () => {
    expect(setFrameTypeByLogicalIndex("2(1,2[1,1])", 2, "-")).toBe("2(1,2[1,-])");
  });

  test("no-op when setting same type returns canonical output", () => {
    expect(setFrameTypeByLogicalIndex("2(1,1)", 0, "1")).toBe("2(1,1)");
  });

  test("throws on target not found", () => {
    expect(() => setFrameTypeByLogicalIndex("2(1,1)", 5, "-")).toThrow(/not found/i);
  });

  test("throws on invalid targetLogicalIndex", () => {
    expect(() => setFrameTypeByLogicalIndex("1", -1, "-")).toThrow(/targetLogicalIndex/i);
  });

  test("handles deeply nested structure", () => {
    expect(setFrameTypeByLogicalIndex("2(1,2[1,2(1,1)])", 2, "0")).toBe(
      "2(1,2[1,2(0,1)])"
    );
  });

  // ── Selector alignment: only rendered frames (1/F) are counted ──

  test("skips passthrough when counting — targets second frame across a gap", () => {
    // 3(F,>,F): frames are index 0 = first F, index 1 = second F (> is skipped)
    expect(setFrameTypeByLogicalIndex("3(1,0,1)", 1, "-")).toBe("3(1,0,-)");
  });

  test("skips null when counting — targets second frame across a null", () => {
    // 3(F,-,F): frames are index 0 = first F, index 1 = second F (- is skipped)
    expect(setFrameTypeByLogicalIndex("3(1,-,1)", 1, "-")).toBe("3(1,-,-)");
  });

  test("throws when only non-frame primitives remain beyond frame count", () => {
    // 3(1,0,-): only 1 rendered frame, so index 1 does not exist
    expect(() => setFrameTypeByLogicalIndex("3(1,0,-)", 1, "1")).toThrow(/not found/i);
  });

  test("preserves passthrough and null tokens unchanged in output", () => {
    // Target the first frame (index 0), passthrough and null remain untouched
    expect(setFrameTypeByLogicalIndex("4(1,0,-,1)", 0, "-")).toBe("4(-,0,-,1)");
  });
});
