import { getComplexityMetricsFast, isValidM0String } from "@m0saic/dsl";
import { placeRects } from "./placeRects";
import { placeInsetRects } from "./placeInsetRects";
import type { PlaceInsetRectsInset } from "./placeInsetRects";

const prec = (m0: string) => {
  const p = getComplexityMetricsFast(m0).precision;
  return { x: p.maxSplitX, y: p.maxSplitY };
};

/**
 * Replicates the engine's `applyInsetToRect` (core ffmpegCommands.ts): FLOOR
 * per edge, then clamp size. The zero-drift contract is judged under exactly
 * this math.
 */
function engineRecover(
  cell: { x: number; y: number; w: number; h: number },
  inset: PlaceInsetRectsInset | null,
): { x: number; y: number; w: number; h: number } {
  if (!inset) return { ...cell };
  const l = Math.floor(inset.left * cell.w);
  const r = Math.floor(inset.right * cell.w);
  const t = Math.floor(inset.top * cell.h);
  const b = Math.floor(inset.bottom * cell.h);
  return {
    x: cell.x + l,
    y: cell.y + t,
    w: Math.max(1, cell.w - (l + r)),
    h: Math.max(1, cell.h - (t + b)),
  };
}

// A hero-chrome rect set whose coprime edges force 100% precision at exact
// pixels (same shape as the placeOptimizedRects fixture).
const CHROME = [
  { x: 140, y: 66, w: 128, h: 42, claimant: "F" },
  { x: 140, y: 150, w: 980, h: 92, claimant: "F" },
  { x: 142, y: 282, w: 760, h: 34, claimant: "F" },
  { x: 1160, y: 384, w: 290, h: 288, claimant: "F" },
  { x: 140, y: 1006, w: 560, h: 50, claimant: "F" },
  { x: 387, y: 387, w: 590, h: 590, claimant: "F" },
];

describe("placeInsetRects", () => {
  it("collapses the precision floor with ZERO visual drift (the laundering contract)", () => {
    const exact = placeRects({ rootW: 1920, rootH: 1080, rects: CHROME }).m0;
    const res = placeInsetRects({ rootW: 1920, rootH: 1080, rects: CHROME, basis: 120 });

    expect(isValidM0String(res.m0)).toBe(true);
    // Exact is pinned to the full canvas; the laundered emit is bounded.
    expect(prec(exact)).toEqual({ x: 1920, y: 1080 });
    expect(res.pitch).toEqual({ x: 16, y: 9 });
    expect(res.basis).toEqual({ x: 120, y: 120 });
    const p = prec(res.m0);
    expect(p.x).toBeLessThanOrEqual(120);
    expect(p.y).toBeLessThanOrEqual(120);
    // Zero drift: every rect recovers EXACTLY under the engine's floor math.
    for (let i = 0; i < CHROME.length; i++) {
      expect(engineRecover(res.cells[i], res.insets[i])).toEqual({
        x: CHROME[i].x,
        y: CHROME[i].y,
        w: CHROME[i].w,
        h: CHROME[i].h,
      });
    }
  });

  // ── Regression: pitch must come from the DIVISORS of the axis ──
  // round(1280/120) = 11 is coprime with 1280 → gcd(11, 1280) = 1 → the whole
  // quantization would silently buy nothing (precision 1280).
  it("picks a divisor pitch, never round(axis/basis) — 1280 @ basis 120 → 16, not 11", () => {
    const res = placeInsetRects({
      rootW: 1280,
      rootH: 720,
      basis: 120,
      rects: [{ x: 141, y: 67, w: 500, h: 300, claimant: "F" }],
    });
    expect(res.pitch.x).toBe(16); // smallest divisor of 1280 ≥ 1280/120 ≈ 10.67
    expect(res.basis.x).toBe(80);
    expect(1280 % res.pitch.x).toBe(0);
    expect(res.pitch.y).toBe(6); // smallest divisor of 720 ≥ 6
    expect(res.basis.y).toBe(120);
    const p = prec(res.m0);
    expect(p.x).toBeLessThanOrEqual(80);
    expect(p.y).toBeLessThanOrEqual(120);
  });

  // ── Regression: the engine FLOORS insets, so fractions are half-pixel-centered ──
  it("half-pixel-centers inset fractions so floor() recovers exact px (canary n=15, W=44)", () => {
    // The naive fraction genuinely loses a pixel — this is WHY the +0.5 exists.
    expect(Math.floor((15 / 44) * 44)).toBe(14);
    expect(Math.floor(((15 + 0.5) / 44) * 44)).toBe(15);

    // Construct that (shrink 15, cellDim 44) pair through the public API. The
    // shrink is WITHIN the 0.49 cap (15/44 ≈ 0.34), so the cap guard leaves the
    // pitch at 44: 132 = 2²·3·11, basis 3 → pitch 44; rect x=59 in cell [44, 88)
    // → left = 15, cellW = 44.
    const res = placeInsetRects({
      rootW: 132,
      rootH: 88,
      basis: 3,
      minFill: 0.01,
      rects: [{ x: 59, y: 11, w: 14, h: 22, claimant: "F" }],
    });
    expect(res.pitch.x).toBe(44);
    expect(res.cells[0]).toEqual({ x: 44, y: 0, w: 44, h: 44 });
    const inset = res.insets[0]!;
    expect(inset.left).toBeCloseTo(15.5 / 44, 12);
    expect(engineRecover(res.cells[0], inset)).toEqual({ x: 59, y: 11, w: 14, h: 22 });
  });

  // ── Regression: no emitted inset may exceed the engine's assertFrac cap ──
  it("cap guard: a thin rect never emits an edge inset over 0.49 (escalates the pitch)", () => {
    // Reproduces the quote-card accent-bar bug: an 8px bar whose 16px target
    // cell (basis 120 on a 1920 axis) would emit (8+0.5)/16 = 0.531 on the
    // aligned edge — which the engine's assertFrac rejects. `minFill` alone
    // passes it (fill 8/16 = 0.5), so the inset-cap guard is what saves it by
    // picking a finer pitch. Recovery stays exact — the guard changes only the
    // pitch, never the recovered bounds.
    const rects = [
      { x: 60, y: 944, w: 960, h: 8, claimant: "F" }, // thin accent bar, edge-aligned in its cell
      { x: 60, y: 200, w: 960, h: 600, claimant: "F" }, // a normal block
    ];
    const res = placeInsetRects({ rootW: 1080, rootH: 1920, rects, basis: 120 });
    const maxEdge = Math.max(
      ...res.insets.flatMap((i) => (i ? [i.top, i.right, i.bottom, i.left] : [0])),
    );
    expect(maxEdge).toBeLessThanOrEqual(0.49);
    for (let i = 0; i < rects.length; i++) {
      const { x, y, w, h } = rects[i];
      expect(engineRecover(res.cells[i], res.insets[i])).toEqual({ x, y, w, h });
    }
  });

  it("recovers every rect exactly under floor math across a deterministic sweep", () => {
    // LCG-seeded fixture — deterministic, no Math.random.
    let seed = 0xdecafbad;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const configs = [
      { rootW: 1280, rootH: 720, basis: 120 },
      { rootW: 1920, rootH: 1080, basis: 120 },
      { rootW: 1080, rootH: 1080, basis: 40 },
      { rootW: 1200, rootH: 900, basis: 12 },
      { rootW: 66, rootH: 46, basis: 6 },
    ];
    for (const { rootW, rootH, basis } of configs) {
      const rects = Array.from({ length: 12 }, () => {
        const w = 1 + Math.floor(rand() * (rootW / 3));
        const h = 1 + Math.floor(rand() * (rootH / 3));
        const x = Math.floor(rand() * (rootW - w));
        const y = Math.floor(rand() * (rootH - h));
        return { x, y, w, h, claimant: "F" };
      });
      // onHostile: "exact" — the cap guard can drive a thin rect on a
      // divisor-poor axis (46 here) down to an exact axis; a valid degradation,
      // and recovery stays exact.
      const res = placeInsetRects({ rootW, rootH, basis, minFill: 0.01, onHostile: "exact", rects });
      expect(rootW % res.pitch.x).toBe(0);
      expect(rootH % res.pitch.y).toBe(0);
      // The cap guard holds across the whole fixture: no emitted inset > 0.49.
      for (const ins of res.insets)
        if (ins) for (const e of [ins.top, ins.right, ins.bottom, ins.left])
          expect(e).toBeLessThanOrEqual(0.49);
      for (let i = 0; i < rects.length; i++) {
        const c = res.cells[i];
        // Cell on the lattice and containing its rect.
        expect(c.x % res.pitch.x).toBe(0);
        expect(c.w % res.pitch.x).toBe(0);
        expect(c.y % res.pitch.y).toBe(0);
        expect(c.h % res.pitch.y).toBe(0);
        expect(c.x).toBeLessThanOrEqual(rects[i].x);
        expect(c.x + c.w).toBeGreaterThanOrEqual(rects[i].x + rects[i].w);
        // Exact recovery — the zero-drift guarantee.
        const { x, y, w, h } = rects[i];
        expect(engineRecover(c, res.insets[i])).toEqual({ x, y, w, h });
      }
    }
  });

  it("emits null insets and a placeRects-identical m0 when rects are lattice-aligned", () => {
    const rects = [
      { x: 160, y: 90, w: 320, h: 180, claimant: "F" },
      { x: 960, y: 540, w: 480, h: 270, claimant: "F" },
    ]; // multiples of 16 (x/w) and 9 (y/h)
    const res = placeInsetRects({ rootW: 1920, rootH: 1080, rects, basis: 120 });
    expect(res.pitch).toEqual({ x: 16, y: 9 });
    expect(res.insets).toEqual([null, null]);
    expect(res.cells).toEqual(rects.map(({ x, y, w, h }) => ({ x, y, w, h })));
    expect(res.m0).toBe(placeRects({ rootW: 1920, rootH: 1080, rects }).m0);
  });

  it("spills quantization-collided cells to separate layers; painted content stays disjoint", () => {
    // pitch.x = 100 (1200 @ basis 12); the 5px gap [90, 95) holds no multiple of 100,
    // so the outward cells overlap and must not share a layer.
    const rects = [
      { x: 0, y: 0, w: 90, h: 100, claimant: "F" },
      { x: 95, y: 0, w: 100, h: 100, claimant: "F" },
    ];
    const res = placeInsetRects({ rootW: 1200, rootH: 100, rects, basis: 12 });
    expect(res.pitch.x).toBe(100);
    expect(res.layers.length).toBe(2);
    const a = engineRecover(res.cells[0], res.insets[0]);
    const b = engineRecover(res.cells[1], res.insets[1]);
    expect(a).toEqual({ x: 0, y: 0, w: 90, h: 100 });
    expect(b).toEqual({ x: 95, y: 0, w: 100, h: 100 });
    expect(a.x + a.w).toBeLessThanOrEqual(b.x); // disjoint after recovery
  });

  it("clamps to a finer divisor when the precision-target pitch would dwarf a small rect", () => {
    // Target pitch 100 gives the 30px rect a 100px cell (fill 0.3 < 0.5); the
    // guard walks down the divisor list to 30 (cell [30, 90), fill 0.5).
    const rects = [
      { x: 35, y: 0, w: 30, h: 100, claimant: "F" },
      { x: 300, y: 0, w: 600, h: 100, claimant: "F" },
    ];
    const res = placeInsetRects({ rootW: 1200, rootH: 100, rects, basis: 12 });
    expect(res.clamped.x).toBe(true);
    expect(res.pitch.x).toBe(30);
    expect(res.basis.x).toBe(40); // above the 12 target — reported, not silent
    for (let i = 0; i < rects.length; i++) {
      const c = res.cells[i];
      expect(rects[i].w / c.w).toBeGreaterThanOrEqual(0.5);
      const { x, y, w, h } = rects[i];
      expect(engineRecover(c, res.insets[i])).toEqual({ x, y, w, h });
    }
  });

  it("throws on a hostile axis instead of silently emitting ~100% precision", () => {
    expect(() =>
      placeInsetRects({
        rootW: 997, // prime — divisors {1, 997}
        rootH: 100,
        basis: 120,
        rects: [{ x: 141, y: 10, w: 50, h: 80, claimant: "F" }],
      }),
    ).toThrow(/self-framed|placeOptimizedRects/);
  });

  it("onHostile: 'exact' degrades a hostile axis to exact placement and reports it", () => {
    const res = placeInsetRects({
      rootW: 997, // prime and hostile for this small rect
      rootH: 720,
      basis: 120,
      onHostile: "exact",
      rects: [{ x: 141, y: 67, w: 50, h: 300, claimant: "F" }],
    });
    expect(res.hostile).toEqual({ x: true, y: false });
    expect(res.pitch.x).toBe(1); // exact on the hostile axis
    expect(res.pitch.y).toBe(6); // the friendly axis still collapses
    expect(res.cells[0].x).toBe(141); // x untouched (exact)
    expect(res.cells[0].w).toBe(50);
    const inset = res.insets[0]!;
    expect(inset.left).toBe(0); // no x recovery needed
    expect(inset.right).toBe(0);
    expect(engineRecover(res.cells[0], inset)).toEqual({ x: 141, y: 67, w: 50, h: 300 });
  });

  it("a near-canvas rect on a prime axis takes the pure-inset endpoint (pitch = axis)", () => {
    // The dial's far end: one slot, the inset does all the placement — precision
    // 1 even on a prime canvas.
    const res = placeInsetRects({
      rootW: 997,
      rootH: 100,
      basis: 120,
      rects: [{ x: 41, y: 10, w: 900, h: 80, claimant: "F" }],
    });
    expect(res.pitch.x).toBe(997);
    expect(res.basis.x).toBe(1);
    expect(engineRecover(res.cells[0], res.insets[0])).toEqual({ x: 41, y: 10, w: 900, h: 80 });
  });

  it("passes a small axis through exact (axisLen ≤ basis is not hostile)", () => {
    const res = placeInsetRects({
      rootW: 96,
      rootH: 54,
      basis: 120,
      rects: [{ x: 13, y: 7, w: 29, h: 31, claimant: "F" }],
    });
    expect(res.pitch).toEqual({ x: 1, y: 1 });
    expect(res.clamped).toEqual({ x: false, y: false });
    expect(res.insets).toEqual([null]);
  });

  it("validates inputs", () => {
    const ok = [{ x: 0, y: 0, w: 10, h: 10, claimant: "F" }];
    expect(() => placeInsetRects({ rootW: 0, rootH: 100, rects: ok })).toThrow();
    expect(() => placeInsetRects({ rootW: 100, rootH: 100, rects: [] })).toThrow();
    expect(() =>
      placeInsetRects({ rootW: 100, rootH: 100, rects: [{ x: 95, y: 0, w: 10, h: 10 }] }),
    ).toThrow(/overflows/);
    expect(() => placeInsetRects({ rootW: 100, rootH: 100, rects: ok, basis: 0 })).toThrow(/basis/);
    expect(() => placeInsetRects({ rootW: 100, rootH: 100, rects: ok, minFill: 0 })).toThrow(/minFill/);
    expect(() => placeInsetRects({ rootW: 100, rootH: 100, rects: ok, minFill: 1.2 })).toThrow(/minFill/);
  });
});
