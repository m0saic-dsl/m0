import { getComplexityMetricsFast } from "@m0saic/dsl";
import { snapRectPrecision } from "./snapRectPrecision";

// Precision basis on each axis == the parsed maxSplit of the emitted m0. This
// ties the helper's gcd math to the real DSL metric.
function parsedPrecision(m0: string): { x: number; y: number } {
  const p = getComplexityMetricsFast(m0).precision;
  return { x: p.maxSplitX, y: p.maxSplitY };
}

describe("snapRectPrecision — the generator's 975 case", () => {
  const opts = { rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975 } as const;

  it("reports the exact request at 100% precision (coprime on Y)", () => {
    const { exact } = snapRectPrecision(opts);
    expect(exact.rect).toEqual({ x: 90, y: 52, w: 1740, h: 975 });
    expect(exact.totalDeltaPx).toBe(0);
    expect(exact.basisY).toBe(1080); // gcd(52,975,53)=1 → full precision
    expect(exact.precisionPctY).toBe(100);
    // X was already fine: gcd(90,1740,90)=30 → basis 64.
    expect(exact.basisX).toBe(64);
  });

  it("a 1px nudge drops it to 25% (h 975→976, gcd 4)", () => {
    const { best } = snapRectPrecision({ ...opts, maxPrecisionPct: 25 });
    expect(best).not.toBeNull();
    expect(best!.rect.h).toBe(976);
    expect(best!.totalDeltaPx).toBe(1);
    expect(best!.deltaPx).toEqual({ x: 0, y: 0, w: 0, h: 1 });
    expect(best!.basisY).toBe(270);
    expect(best!.precisionPct).toBeLessThanOrEqual(25);
  });

  it("the emitted m0's parsed precision matches the reported basis", () => {
    const { exact, best } = snapRectPrecision({ ...opts, maxPrecisionPct: 25 });
    expect(parsedPrecision(exact.m0)).toEqual({ x: exact.basisX, y: exact.basisY });
    expect(parsedPrecision(best!.m0)).toEqual({ x: best!.basisX, y: best!.basisY });
  });

  it("frontier starts at the exact request and strictly lowers precision as delta grows", () => {
    const { exact, frontier } = snapRectPrecision(opts);
    expect(frontier[0].totalDeltaPx).toBe(exact.totalDeltaPx);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].totalDeltaPx).toBeGreaterThan(frontier[i - 1].totalDeltaPx);
      expect(frontier[i].precisionPct).toBeLessThan(frontier[i - 1].precisionPct);
    }
  });
});

describe("snapRectPrecision — nudge mask + budgets", () => {
  it("honors a nudge mask that locks everything but height", () => {
    const { best } = snapRectPrecision({
      rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975,
      maxPrecisionPct: 30, nudge: { x: false, y: false, w: false },
    });
    expect(best).not.toBeNull();
    // Only h may move; x/y/w stay put.
    expect(best!.deltaPx.x).toBe(0);
    expect(best!.deltaPx.y).toBe(0);
    expect(best!.deltaPx.w).toBe(0);
    expect(best!.deltaPx.h).not.toBe(0);
  });

  it("returns best=null when nothing clears the ceiling within maxDeltaPx", () => {
    // Coprime on Y, and a 0px search radius can't move anything.
    const { best, exact } = snapRectPrecision({
      rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975, maxPrecisionPct: 25, maxDeltaPx: 0,
    });
    expect(best).toBeNull();
    expect(exact.precisionPctY).toBe(100);
  });

  it("best === exact when the request is already under the ceiling", () => {
    // 1740×960: gcd(90,1740,90)=30 (X), gcd(60,960,60)=60 (Y) → both well under 50%.
    const { exact, best } = snapRectPrecision({
      rootW: 1920, rootH: 1080, rectW: 1740, rectH: 960, maxPrecisionPct: 50,
    });
    expect(best).not.toBeNull();
    expect(best!.totalDeltaPx).toBe(0);
    expect(best!.rect).toEqual(exact.rect);
  });
});

describe("snapRectPrecision — validation", () => {
  it("throws on non-positive / oversized dims", () => {
    expect(() => snapRectPrecision({ rootW: 0, rootH: 1080, rectW: 10, rectH: 10 })).toThrow();
    expect(() => snapRectPrecision({ rootW: 100, rootH: 100, rectW: 200, rectH: 10 })).toThrow();
    expect(() => snapRectPrecision({ rootW: 100, rootH: 100, rectW: 10, rectH: 10, maxDeltaPx: -1 })).toThrow();
  });
});
