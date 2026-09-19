import { getComplexityMetricsFast, isValidM0String } from "@m0saic/dsl";
import { placeRects } from "./placeRects";
import { placeOptimizedRects } from "./placeOptimizedRects";

const prec = (m0: string) => {
  const p = getComplexityMetricsFast(m0).precision;
  return { x: p.maxSplitX, y: p.maxSplitY };
};

// A hero-chrome rect set whose coprime edges force 100% precision at exact pixels.
const CHROME = [
  { x: 140, y: 66, w: 128, h: 42, claimant: "F" },
  { x: 140, y: 150, w: 980, h: 92, claimant: "F" },
  { x: 142, y: 282, w: 760, h: 34, claimant: "F" },
  { x: 1160, y: 384, w: 290, h: 288, claimant: "F" },
  { x: 140, y: 1006, w: 560, h: 50, claimant: "F" },
  { x: 387, y: 387, w: 590, h: 590, claimant: "F" }, // "arc" region (coprime edges)
];

describe("placeOptimizedRects", () => {
  it("with zero drift is byte-identical to placeRects", () => {
    const a = placeOptimizedRects({ rootW: 1920, rootH: 1080, rects: CHROME }).m0;
    const b = placeRects({ rootW: 1920, rootH: 1080, rects: CHROME }).m0;
    expect(a).toBe(b);
  });

  it("collapses the precision floor + m0 length within a small drift budget", () => {
    const exact = placeRects({ rootW: 1920, rootH: 1080, rects: CHROME }).m0;
    const opt = placeOptimizedRects({ rootW: 1920, rootH: 1080, rects: CHROME, driftPercent: 0.5 });

    expect(isValidM0String(opt.m0)).toBe(true);
    // Exact is pinned to the full canvas; optimized collapses hard.
    expect(prec(exact)).toEqual({ x: 1920, y: 1080 });
    expect(opt.basis.x).toBeLessThan(1920);
    expect(opt.basis.y).toBeLessThan(1080);
    expect(prec(opt.m0)).toEqual({ x: opt.basis.x, y: opt.basis.y }); // reported basis == parsed
    expect(opt.m0.length).toBeLessThan(exact.length / 2); // >2× leaner
    // Per-edge budget ~5px → size drift can reach 2× (both edges).
    expect(opt.driftMaxPx).toBeLessThanOrEqual(2 * Math.round((0.5 / 100) * 1080));
  });

  it("a locked rect with coprime edges pins the whole layout to full precision", () => {
    const locked = CHROME.map((r, i) => (i === 5 ? { ...r, driftPx: 0 } : r));
    const opt = placeOptimizedRects({ rootW: 1920, rootH: 1080, rects: locked, driftPercent: 0.5 });
    expect(opt.pitch).toEqual({ x: 1, y: 1 });
    expect(prec(opt.m0)).toEqual({ x: 1920, y: 1080 });
  });

  it("collapses even WITH a locked rect when its edges share factors with the canvas", () => {
    // Locked arc on a grid-friendly rect (384..960 share 24 with 1080; 384..1344.. keep X friendly too).
    const rects = [
      { x: 480, y: 240, w: 960, h: 600, claimant: "F", driftPx: 0 }, // locked, aligned
      { x: 137, y: 151, w: 806, h: 93, claimant: "F" }, // coprime chrome, flexible
    ];
    const opt = placeOptimizedRects({ rootW: 1920, rootH: 1080, rects, driftPercent: 1 });
    expect(opt.pitch.x).toBeGreaterThan(1);
    expect(opt.pitch.y).toBeGreaterThan(1);
    // The locked rect never moved.
    expect(opt.rects[0]).toEqual({ x: 480, y: 240, w: 960, h: 600 });
  });

  it("never places a zero-size rect or one out of bounds", () => {
    // A thin 3px-wide rect with a generous budget must not collapse to 0.
    const rects = [
      { x: 101, y: 200, w: 3, h: 800, claimant: "F" },
      { x: 500, y: 100, w: 900, h: 700, claimant: "F" },
    ];
    const opt = placeOptimizedRects({ rootW: 1920, rootH: 1080, rects, driftPercent: 2 });
    expect(isValidM0String(opt.m0)).toBe(true);
    for (const r of opt.rects) {
      expect(r.w).toBeGreaterThanOrEqual(1);
      expect(r.h).toBeGreaterThanOrEqual(1);
      expect(r.x + r.w).toBeLessThanOrEqual(1920);
      expect(r.y + r.h).toBeLessThanOrEqual(1080);
    }
  });

  it("validates inputs", () => {
    expect(() => placeOptimizedRects({ rootW: 0, rootH: 100, rects: CHROME })).toThrow();
    expect(() => placeOptimizedRects({ rootW: 100, rootH: 100, rects: [] })).toThrow();
    expect(() =>
      placeOptimizedRects({ rootW: 100, rootH: 100, rects: [{ x: 0, y: 0, w: 200, h: 10 }] }),
    ).toThrow();
    expect(() =>
      placeOptimizedRects({ rootW: 100, rootH: 100, rects: [{ x: 0, y: 0, w: 10, h: 10, driftPx: -1 }] }),
    ).toThrow();
  });
});
