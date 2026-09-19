import { reduceSplitCounts } from "./reduceSplitCounts";
import {
  isValidM0String,
  parseM0StringToRenderFrames,
} from "@m0saic/dsl";

/** Max per-edge pixel drift between two documents' rendered frames. */
function drift(a: string, b: string, w: number, h: number): number {
  const fa = parseM0StringToRenderFrames(a, w, h);
  const fb = parseM0StringToRenderFrames(b, w, h);
  if (fa.length !== fb.length) return Infinity;
  let mx = 0;
  for (let i = 0; i < fa.length; i++) {
    mx = Math.max(
      mx,
      Math.abs(fa[i].x - fb[i].x),
      Math.abs(fa[i].y - fb[i].y),
      Math.abs(fa[i].x + fa[i].width - (fb[i].x + fb[i].width)),
      Math.abs(fa[i].y + fa[i].height - (fb[i].y + fb[i].height)),
    );
  }
  return mx;
}

describe("reduceSplitCounts", () => {
  const ORIG = "10(0,1,0,0,0,0,0,0,0,1)"; // weights [2,8]

  // ── Headline reduction ──────────────────────────────────────

  test("reduces 10-split [2,8] to 5-split [1,4] at a dividing canvas", () => {
    const r = reduceSplitCounts(ORIG, { width: 1000, height: 100 });
    expect(r.m0).toBe("5(1,0,0,0,1)");
    expect(r.reduced).toEqual([{ stableKey: "r", from: 10, to: 5 }]);
    expect(r.skipped).toEqual([]);
    expect(r.maxDriftPx).toBe(0);
    expect(isValidM0String(r.m0)).toBe(true);
  });

  test("output is lossless: identical render at many canvas sizes when count divides", () => {
    const reduced = reduceSplitCounts(ORIG, { width: 1000, height: 100 }).m0;
    for (const W of [10, 20, 100, 1000, 1080, 1920]) {
      expect(drift(ORIG, reduced, W, 50)).toBe(0);
    }
  });

  // ── Strict-lossless gate (default) ──────────────────────────

  test("strict mode SKIPS a reduction that would shift a pixel boundary", () => {
    // W=13 does not divide 10 → the 5-split lands ~1px off the 10-split.
    const r = reduceSplitCounts(ORIG, { width: 13, height: 100 });
    expect(r.m0).toBe(ORIG); // unchanged
    expect(r.reduced).toEqual([]);
    expect(r.skipped).toEqual([{ stableKey: "r", from: 10, gcd: 2 }]);
  });

  test("the skipped reduction really would have drifted ~1px", () => {
    expect(drift(ORIG, "5(1,0,0,0,1)", 13, 50)).toBe(1);
  });

  // ── Drift-budget opt-in ─────────────────────────────────────

  test("budget mode reduces where strict skips, reporting the actual drift", () => {
    const r = reduceSplitCounts(ORIG, { width: 13, height: 100, maxDriftPx: 1 });
    expect(r.m0).toBe("5(1,0,0,0,1)");
    expect(r.reduced).toHaveLength(1);
    expect(r.maxDriftPx).toBe(1);
  });

  test("budget too small to cover the drift still skips", () => {
    // budget 0.5 < 1px actual drift
    const r = reduceSplitCounts(ORIG, { width: 13, height: 100, maxDriftPx: 0.5 });
    expect(r.m0).toBe(ORIG);
    expect(r.reduced).toEqual([]);
  });

  // ── No-op cases ─────────────────────────────────────────────

  test("uniform split (gcd 1) is untouched even at awkward sizes", () => {
    const r = reduceSplitCounts("3(1,1,1)", { width: 999, height: 100 });
    expect(r.m0).toBe("3(1,1,1)");
    expect(r.reduced).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  test("idempotent — reducing twice changes nothing the second time", () => {
    const once = reduceSplitCounts(ORIG, { width: 1000, height: 100 }).m0;
    const twice = reduceSplitCounts(once, { width: 1000, height: 100 }).m0;
    expect(twice).toBe(once);
  });

  test("single-cell split is NOT reduced (would be an invalid count-1 split)", () => {
    const r = reduceSplitCounts("4(0,0,0,1)", { width: 1000, height: 100 });
    expect(r.m0).toBe("4(0,0,0,1)");
    expect(r.reduced).toEqual([]);
    expect(r.skipped).toEqual([]); // not even a candidate
  });

  // ── Axes / nesting / overlays ───────────────────────────────

  test("reduces a row split", () => {
    const r = reduceSplitCounts("6[0,1,0,1,0,1]", { width: 100, height: 600 });
    expect(r.m0).toBe("3[1,1,1]");
    expect(isValidM0String(r.m0)).toBe(true);
  });

  test("reduces a nested inner split, leaving an unreducible outer intact", () => {
    const r = reduceSplitCounts("2(6(0,1,0,0,0,1),1)", { width: 1200, height: 120 });
    expect(r.m0).toBe("2(3(1,0,1),1)");
    expect(r.reduced).toHaveLength(1);
    expect(isValidM0String(r.m0)).toBe(true);
  });

  test("preserves a claimant's overlay through reduction", () => {
    const r = reduceSplitCounts("4(0,1{2(1,1)},0,1)", { width: 1000, height: 100 });
    expect(r.m0).toBe("2(1{2(1,1)},1)");
    expect(isValidM0String(r.m0)).toBe(true);
  });

  test("does not reduce when a passthrough carries an overlay (would drop paint)", () => {
    // `0{1}` is a passthrough whose overlay paints; reducing would drop it.
    const m0 = "4(0{1},1,0{1},1)";
    const r = reduceSplitCounts(m0, { width: 1000, height: 100, maxDriftPx: 9999 });
    expect(r.m0).toBe(m0);
    expect(r.reduced).toEqual([]);
  });

  // ── Validation ──────────────────────────────────────────────

  test("rejects non-integer canvas dims", () => {
    expect(() => reduceSplitCounts(ORIG, { width: 0, height: 100 })).toThrow();
    expect(() => reduceSplitCounts(ORIG, { width: 100, height: 1.5 })).toThrow();
  });

  test("rejects negative drift budget", () => {
    expect(() =>
      reduceSplitCounts(ORIG, { width: 100, height: 100, maxDriftPx: -1 }),
    ).toThrow();
  });
});
