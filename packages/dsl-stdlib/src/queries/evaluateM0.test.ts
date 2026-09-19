import { evaluateM0, compareM0 } from "./evaluateM0";
import { weightedSplit } from "../builders/weightedSplit";
import { placeRects } from "../builders/placeRects";

describe("evaluateM0", () => {
  test("bundles the canvas-independent + canvas-dependent stats", () => {
    const e = evaluateM0("4(1,1,1,1)", { width: 800, height: 100 });
    expect(e.frameCount).toBe(4);
    expect(e.dslLength).toBe("4(1,1,1,1)".length);
    expect(e.feasible).toBe(true);
    expect(e.maxSpreadPx).toBe(0); // divides evenly
    expect(e.precision.maxSplitAny).toBeGreaterThanOrEqual(1);
  });

  test("feasibility and precision are distinct floors that can cross", () => {
    // weightedSplit([3,5,2]) literal: 3 frames (feasible at 7px) but a 10-slot
    // basis (precision needs 10px). At 8px it renders but is below precision.
    const m0 = String(weightedSplit([3, 5, 2], "col", { mode: "literal" }));
    const e = evaluateM0(m0, { width: 8, height: 100 });
    expect(e.feasible).toBe(true); // won't error at 8px
    expect(e.meetsPrecision).toBe(false); // but below the looks-right floor (10)
    expect(e.precision.maxSplitX).toBeGreaterThan(e.feasibility.minWidthPx); // precision > feasibility here
    expect(e.recommendedMin.width).toBe(e.precision.maxSplitX); // recommend the higher of the two
    // At >= recommendedMin it both renders and looks right.
    const ok = evaluateM0(m0, { width: e.recommendedMin.width, height: 100 });
    expect(ok.feasible).toBe(true);
    expect(ok.meetsPrecision).toBe(true);
  });

  test("flags infeasible canvases with Infinity spread", () => {
    // 5(...) needs >=5px wide; 3px is below the floor.
    const e = evaluateM0("5(1,1,1,1,1)", { width: 3, height: 100 });
    expect(e.feasible).toBe(false);
    expect(e.maxSpreadPx).toBe(Infinity);
  });

  test("rejects anything that isn't valid m0", () => {
    expect(() => evaluateM0("totally not m0 ((", { width: 100, height: 100 })).toThrow(/not a valid m0/);
    expect(() => evaluateM0("2(1,2)", { width: 100, height: 100 })).toThrow(/not a valid m0/); // "2" is not a cell token
  });
});

describe("compareM0", () => {
  const span = 1000;
  const H = 400;
  // Two ways to express 5 equal columns: a small weighted split vs an exact
  // placeRects of the pixel boundaries.
  const ws = String(weightedSplit([1, 1, 1, 1, 1], "col"));
  const prRects = [0, 200, 400, 600, 800].map((x) => ({ x, y: 0, w: 200, h: H, claimant: "1" }));
  const pr = String(placeRects({ rootW: span, rootH: H, rects: prRects }).m0);

  test("returns per-metric comparison with directions", () => {
    const c = compareM0(ws, pr, { width: span, height: H });
    const byKey = Object.fromEntries(c.metrics.map((m) => [m.key, m]));
    expect(byKey.dslLength.betterWhen).toBe("lower");
    expect(byKey.worstSpreadPx.betterWhen).toBe("context");
    expect(byKey.frameCount.betterWhen).toBe("context");
    // ws is shorter than the placeRects pixel basis here OR equal — never longer.
    expect(byKey.dslLength.a).toBeLessThanOrEqual(byKey.dslLength.b);
  });

  test("flags non-comparable layouts (different frame counts)", () => {
    const c = compareM0("2(1,1)", "3(1,1,1)", { width: 600, height: 100 });
    expect(c.comparable).toBe(false);
    expect(c.notes.join(" ")).toMatch(/frame counts differ/);
  });

  test("detects geometrically-equal layouts and recommends the shorter string", () => {
    // Two spellings of the same two-equal-halves split: the canonical "2(1,1)"
    // vs a literal-basis weightedSplit([5,5]) ("10(...)") that renders identical
    // halves but is much longer.
    const short = "2(1,1)";
    const long = String(weightedSplit([5, 5], "col", { mode: "literal" }));
    expect(long.length).toBeGreaterThan(short.length);
    const c = compareM0(short, long, { width: 800, height: 100 });
    expect(c.geometricallyEqual).toBe(true);
    expect(c.recommendation).toBe("a"); // short has fewer chars
    expect(c.notes.join(" ")).toMatch(/identical frames/);
  });

  test("recommendation is null when layouts differ geometrically", () => {
    // Same frame count (2) but different rects: halves vs 1:3.
    const other = String(weightedSplit([1, 3], "col", { mode: "literal" }));
    const c = compareM0("2(1,1)", other, { width: 900, height: 100 });
    expect(c.geometricallyEqual).toBe(false);
    expect(c.recommendation).toBeNull();
  });

  test("rejects invalid m0 on either side", () => {
    expect(() => compareM0("2(1,1)", "nope ((", { width: 800, height: 100 })).toThrow(/not a valid m0/);
    expect(() => compareM0("bad((", "2(1,1)", { width: 800, height: 100 })).toThrow(/not a valid m0/);
  });

  test("aggregates spread across a canvas set (worst case)", () => {
    const c = compareM0(ws, ws, [
      { width: 1000, height: 400 },
      { width: 1003, height: 401 },
    ]);
    expect(c.a.perCanvas).toHaveLength(2);
    expect(c.a.worstSpreadPx).toBeGreaterThanOrEqual(c.a.perCanvas[0].maxSpreadPx);
  });
});
