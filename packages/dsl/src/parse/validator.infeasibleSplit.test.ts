import { parseM0StringComplete } from "./m0StringParser";

describe("SPLIT_EXCEEDS_AXIS — infeasible splits at given dimensions", () => {
  test("3(1,1,1) at 1x1 produces 0-size frames and returns error", () => {
    // 3 children along 1px axis: sizes = [1,0,0] → two 0-size frames
    const r = parseM0StringComplete("3(1,1,1)", 1, 1);
    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("SPLIT_EXCEEDS_AXIS");
    expect(r.error.kind).toBe("ANTIPATTERN");
  });

  test("error includes width/height and precision in details", () => {
    const r = parseM0StringComplete("3(1,1,1)", 1, 1);
    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.details).toEqual({
      width: 1,
      height: 1,
      maxSplitX: 3,
      maxSplitY: 1,
    });
  });

  test("2(1,1) at 1x1 col-split: 1px → sizes [1,0] → infeasible", () => {
    // col split: width=1 splits into [1,0] → second child has width=0
    const r = parseM0StringComplete("2(1,1)", 1, 1);
    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("SPLIT_EXCEEDS_AXIS");
  });

  test("2[1,1] at 1x1 row-split: 1px height → sizes [1,0] → infeasible", () => {
    const r = parseM0StringComplete("2[1,1]", 1, 1);
    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("SPLIT_EXCEEDS_AXIS");
  });

  test("no error when split is feasible: 2(1,1) at 100x100", () => {
    const r = parseM0StringComplete("2(1,1)", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.renderFrames.length).toBe(2);
  });

  test("no error for simple tile: 1 at 1x1", () => {
    const r = parseM0StringComplete("1", 1, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.renderFrames.length).toBe(1);
  });

  test("deeply nested infeasible: 2(2(1,1),1) at 1x1", () => {
    // outer col split: [1,0] → second child 0-size
    const r = parseM0StringComplete("2(2(1,1),1)", 1, 1);
    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("SPLIT_EXCEEDS_AXIS");
  });

  test("invalid string returns specific error code (validation catches it first)", () => {
    const r = parseM0StringComplete("invalid", 100, 100);
    expect(r.ok).toBe(false);
    if (!("error" in r)) return;
    expect(r.error.code).toBe("INVALID_CHAR");
  });
});
