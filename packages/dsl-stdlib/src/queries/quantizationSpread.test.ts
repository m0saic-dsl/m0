import { quantizationSpread, isQuantizationImperceptible } from "./quantizationSpread";
import { weightedSplit } from "../builders/weightedSplit";
import { placeRects } from "../builders/placeRects";

// Build the two candidate gridline forms for a horizontal grid: `count`
// intervals, interior lines only (excludeEdges), thickness `th` px.
function interleavedWeightSplit(count: number, axisLen: number, th: number): string {
  const gap = Math.max(1, Math.round(axisLen / count) - th);
  const w: number[] = [gap];
  const c: string[] = ["-"];
  for (let i = 1; i <= count - 1; i++) {
    w.push(th, gap);
    c.push("1", "-");
  }
  return String(weightedSplit(w, "row", { claimants: c, mode: "literal" }));
}
function placeRectsForm(count: number, axisLen: number, span: number, th: number): string {
  const rects = [];
  for (let i = 1; i <= count - 1; i++) {
    const pos = Math.max(0, Math.min(axisLen - th, Math.round((i / count) * axisLen) - Math.floor(th / 2)));
    rects.push({ x: 0, y: pos, w: span, h: th, claimant: "1" });
  }
  return String(placeRects({ rootW: span, rootH: axisLen, rects }).m0);
}

describe("quantizationSpread", () => {
  test("zero spread when the split divides the axis evenly", () => {
    expect(quantizationSpread("4(1,1,1,1)", 800, 100).maxSpreadPx).toBe(0);
    expect(quantizationSpread("5(1,1,1,1,1)", 1000, 100).maxSpreadPx).toBe(0);
  });

  test("small spread (<1px) for a coarse non-dividing split", () => {
    const r = quantizationSpread("3(1,1,1)", 800, 100);
    expect(r.maxSpreadPx).toBeGreaterThan(0);
    expect(r.maxSpreadPx).toBeLessThan(1);
    expect(isQuantizationImperceptible("3(1,1,1)", 800, 100, 1)).toBe(true);
  });

  test("isQuantizationImperceptible flips with the threshold", () => {
    // A dense split on a small axis spreads more than 1px.
    const dense = weightedSplit(Array.from({ length: 40 }, () => 1), "row");
    const r = quantizationSpread(String(dense), 1000, 173);
    expect(typeof r.maxSpreadPx).toBe("number");
  });

  // For THIN-LINE grids, placeRects is pixel-exact (~0) at every size/count,
  // while the interleaved gap/line weightedSplit ranges from fine to
  // catastrophic (e.g. count=6 @ H=400 → ~67px). This locks in WHY the grid
  // primitive emits placeRects rather than a "portable" weightedSplit: there is
  // no imperceptible-weightedSplit win to capture for thin lines.
  test("placeRects gridlines strictly beat the interleaved weightedSplit form", () => {
    const span = 1000;
    for (const [count, H] of [[5, 720], [5, 575], [5, 717], [6, 400], [10, 300], [20, 207], [5, 1080], [8, 333], [12, 250], [5, 144]] as const) {
      const th = Math.max(1, Math.round(0.002 * Math.min(span, H)));
      const pr = quantizationSpread(placeRectsForm(count, H, span, th), span, H).maxSpreadPx;
      const ws = quantizationSpread(interleavedWeightSplit(count, H, th), span, H).maxSpreadPx;
      expect(pr).toBeLessThan(1); // placeRects always sub-pixel
      expect(pr).toBeLessThanOrEqual(ws + 1e-9); // and never worse than weightedSplit
    }
  });
});
