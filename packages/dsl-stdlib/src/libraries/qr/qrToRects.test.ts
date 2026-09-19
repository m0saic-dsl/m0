import { qrToMatrix } from "./qrToMatrix";
import { qrToRects } from "./qrToRects";

describe("qrToRects", () => {
  test("returns one rect per dark module in the matrix", () => {
    const url = "https://m0saic.io";
    const matrix = qrToMatrix(url, { errorCorrectionLevel: "M" });
    const rects = qrToRects(url, { errorCorrectionLevel: "M" });

    // Count dark modules in the matrix.
    let darkCount = 0;
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        if (matrix.modules[r][c]) darkCount++;
      }
    }
    expect(rects).toHaveLength(darkCount);
  });

  test("every rect is exactly 1×1 in canonical units", () => {
    const rects = qrToRects("https://m0saic.io");
    for (const r of rects) {
      expect(r.w).toBe(1);
      expect(r.h).toBe(1);
    }
  });

  test("rects' (x, y) match the dark-module positions in the matrix", () => {
    const url = "01234567";
    const matrix = qrToMatrix(url, { errorCorrectionLevel: "M" });
    const rects = qrToRects(url, { errorCorrectionLevel: "M" });
    // Build a set of "x,y" for fast lookup.
    const rectSet = new Set(rects.map((r) => `${r.x},${r.y}`));
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        const has = rectSet.has(`${c},${r}`);
        expect(has).toBe(matrix.modules[r][c]);
      }
    }
  });

  test("default quiet zone of 4 means the corners (0..3) are all light → no rects there", () => {
    const rects = qrToRects("https://m0saic.io");
    for (const r of rects) {
      // Quiet zone is 4 cells per side. No rects in cols 0..3 or rows 0..3.
      expect(r.x).toBeGreaterThanOrEqual(4);
      expect(r.y).toBeGreaterThanOrEqual(4);
    }
  });
});
