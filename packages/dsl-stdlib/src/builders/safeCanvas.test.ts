import { parseM0StringToRenderFrames } from "@m0saic/dsl";
import { safeCanvas } from "./safeCanvas";

describe("safeCanvas", () => {
  test("8x6 gutter 0.1 at 1920x1080 → 1740x975", () => {
    const r = safeCanvas({ rows: 6, cols: 8, gutter: 0.1, maxWidth: 1920, maxHeight: 1080 });
    expect(r.width).toBe(1740);
    expect(r.height).toBe(975);
    expect(r.width % r.totalX).toBe(0);
    expect(r.height % r.totalY).toBe(0);
  });

  test("safe canvas produces zero-distortion grid", () => {
    const r = safeCanvas({ rows: 6, cols: 8, gutter: 0.1, maxWidth: 1920, maxHeight: 1080 });
    const frames = parseM0StringToRenderFrames(r.gridResult.m0, r.width, r.height);
    const widths = new Set(frames.map(f => f.width));
    const heights = new Set(frames.map(f => f.height));
    expect(widths.size).toBe(1);
    expect(heights.size).toBe(1);
  });

  test("no-gutter grid", () => {
    const r = safeCanvas({ rows: 3, cols: 3, maxWidth: 1920, maxHeight: 1080 });
    expect(r.width % r.totalX).toBe(0);
    expect(r.height % r.totalY).toBe(0);
  });

  test("grid too large throws", () => {
    expect(() => safeCanvas({ rows: 100, cols: 100, gutter: 0.1, maxWidth: 100, maxHeight: 100 })).toThrow(/exceeds/);
  });
});
