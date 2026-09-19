import { isValidM0String } from "@m0saic/dsl";
import { bakeInsets } from "./bakeInsets";
import type { BakeInsetsInset } from "./bakeInsets";
import { queryFrames } from "../queries/queryFrames";

/**
 * Replicates the engine's `applyInsetToRect` (core ffmpegCommands.ts): FLOOR
 * per edge on the integer cell, then clamp size. `bakeInsets` must produce
 * exactly these rects, or the baked m0 would not render byte-identically to the
 * original m0 + fiber insets.
 */
function engineRecover(
  cell: { x: number; y: number; w: number; h: number },
  inset: BakeInsetsInset,
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

const roundRect = (f: { x: number; y: number; width: number; height: number }) => ({
  x: Math.max(0, Math.round(f.x)),
  y: Math.max(0, Math.round(f.y)),
  w: Math.max(1, Math.round(f.width)),
  h: Math.max(1, Math.round(f.height)),
});

/** Multiset of rendered rects of an m0 at (w,h), sorted for stable comparison. */
const renderedRects = (m0: string, w: number, h: number) =>
  queryFrames(m0, { width: w, height: h })
    .render()
    .map(roundRect)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h);

const uniform = (f: number): BakeInsetsInset => ({ top: f, right: f, bottom: f, left: f });

describe("bakeInsets", () => {
  test("bakes a per-cell inset into geometry, byte-matching the engine floor math", () => {
    const m0 = "2(1,1)";
    const W = 1000;
    const H = 1000;
    const inFrames = queryFrames(m0, { width: W, height: H }).render().map(roundRect);
    // Inset only the last cell.
    const insets: BakeInsetsInset[] = inFrames.map((_, i) =>
      i === inFrames.length - 1 ? uniform(0.1) : null,
    );

    const res = bakeInsets({ m0, width: W, height: H, insets });

    expect(isValidM0String(res.m0)).toBe(true);
    // Every baked rect equals the engine's applyInsetToRect on the original cell.
    res.rects.forEach((r, i) => {
      expect(r).toEqual(engineRecover(inFrames[i], insets[i]));
    });
    expect(res.meta.frameCount).toBe(inFrames.length);
    expect(res.meta.insetCount).toBe(1);
    // The baked (inset-free) m0 renders exactly the baked rects.
    expect(renderedRects(res.m0, W, H)).toEqual(
      [...res.rects].sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h),
    );
  });

  test("the inset-test grid case: a 6% inset becomes visible gutter geometry", () => {
    // Same shape as the committed inset-test fixture.
    const m0 = "1{2[2(1,1),2(1,1)]}";
    const W = 1024;
    const H = 1024;
    const inFrames = queryFrames(m0, { width: W, height: H }).render().map(roundRect);
    // Inset one grid cell (skip the full-canvas base at index 0).
    const target = inFrames.length - 1;
    const insets: BakeInsetsInset[] = inFrames.map((_, i) => (i === target ? uniform(0.06) : null));

    const res = bakeInsets({ m0, width: W, height: H, insets });

    expect(isValidM0String(res.m0)).toBe(true);
    // The inset cell shrank; its baked rect matches the engine.
    expect(res.rects[target]).toEqual(engineRecover(inFrames[target], insets[target]));
    // A real inset means the cell is strictly smaller than the original.
    expect(res.rects[target].w).toBeLessThan(inFrames[target].w);
    expect(res.rects[target].h).toBeLessThan(inFrames[target].h);
    // Absolute rebuild → "significantly longer".
    expect(res.meta.dslLengthAfter).toBeGreaterThan(res.meta.dslLengthBefore);
    expect(renderedRects(res.m0, W, H)).toEqual(
      [...res.rects].sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h),
    );
  });

  test("throws when the insets length does not match the frame count exactly", () => {
    const m0 = "2(1,1)";
    const n = queryFrames(m0, { width: 100, height: 100 }).render().length;
    expect(() => bakeInsets({ m0, width: 100, height: 100, insets: new Array(n - 1).fill(null) })).toThrow(
      /must equal the render-frame count/,
    );
    expect(() => bakeInsets({ m0, width: 100, height: 100, insets: new Array(n + 1).fill(null) })).toThrow(
      /must equal the render-frame count/,
    );
  });

  test("all-null insets preserves geometry (identity bake)", () => {
    const m0 = "3(1,1,1)";
    const W = 900;
    const H = 600;
    const inFrames = queryFrames(m0, { width: W, height: H }).render().map(roundRect);
    const res = bakeInsets({ m0, width: W, height: H, insets: inFrames.map(() => null) });

    expect(isValidM0String(res.m0)).toBe(true);
    expect(res.meta.insetCount).toBe(0);
    expect(res.rects).toEqual(inFrames);
    expect(renderedRects(res.m0, W, H)).toEqual(
      [...inFrames].sort((a, b) => a.y - b.y || a.x - b.x || a.w - b.w || a.h - b.h),
    );
  });

  test("overlapping frames: an inset on a stacked frame keeps both, on separate layers", () => {
    // 1{1}: full-canvas base overlaid with a full-canvas top frame (they overlap).
    const m0 = "1{1}";
    const W = 400;
    const H = 400;
    const inFrames = queryFrames(m0, { width: W, height: H }).render().map(roundRect);
    expect(inFrames.length).toBe(2);
    // Inset the top frame only.
    const insets: BakeInsetsInset[] = inFrames.map((_, i) => (i === 1 ? uniform(0.1) : null));

    const res = bakeInsets({ m0, width: W, height: H, insets });

    expect(isValidM0String(res.m0)).toBe(true);
    // Both rects survive; the top one shrank.
    expect(res.rects[0]).toEqual(inFrames[0]);
    expect(res.rects[1]).toEqual(engineRecover(inFrames[1], insets[1]));
    // Overlap forces the top frame onto a higher layer (z preserved).
    expect(res.meta.layersAfter).toBeGreaterThanOrEqual(2);
  });

  test("validates width/height as positive integers", () => {
    const m0 = "2(1,1)";
    expect(() => bakeInsets({ m0, width: 0, height: 100, insets: [null, null] })).toThrow(/width/);
    expect(() => bakeInsets({ m0, width: 100, height: 1.5, insets: [null, null] })).toThrow(/height/);
  });
});
