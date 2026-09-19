import { packDarkCells } from "./packDarkCells";
import { qrToMatrix } from "./qrToMatrix";

function makeEmpty(N: number): boolean[][] {
  return Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
}

describe("packDarkCells — rowwise", () => {
  test("empty matrix → 0 rects", () => {
    const N = 5;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    expect(packDarkCells(modules, suppress, N)).toEqual([]);
  });

  test("single dark cell → 1 rect of w=1 h=1", () => {
    const N = 5;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    modules[2][3] = true;
    expect(packDarkCells(modules, suppress, N)).toEqual([
      { x: 3, y: 2, w: 1, h: 1 },
    ]);
  });

  test("3-cell horizontal run → 1 rect of w=3 h=1", () => {
    const N = 5;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    modules[1][1] = true;
    modules[1][2] = true;
    modules[1][3] = true;
    expect(packDarkCells(modules, suppress, N)).toEqual([
      { x: 1, y: 1, w: 3, h: 1 },
    ]);
  });

  test("two separate runs in same row → 2 rects", () => {
    const N = 7;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    modules[3][0] = true;
    modules[3][1] = true;
    // gap at col 2
    modules[3][3] = true;
    modules[3][4] = true;
    modules[3][5] = true;
    expect(packDarkCells(modules, suppress, N)).toEqual([
      { x: 0, y: 3, w: 2, h: 1 },
      { x: 3, y: 3, w: 3, h: 1 },
    ]);
  });

  test("run continues to last column", () => {
    const N = 4;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    modules[0][2] = true;
    modules[0][3] = true;
    expect(packDarkCells(modules, suppress, N)).toEqual([
      { x: 2, y: 0, w: 2, h: 1 },
    ]);
  });

  test("suppress mask skips suppressed dark cells", () => {
    const N = 5;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    // 3-cell dark run but middle cell is suppressed → 2 rects of w=1.
    modules[2][1] = true;
    modules[2][2] = true;
    modules[2][3] = true;
    suppress[2][2] = true;
    expect(packDarkCells(modules, suppress, N)).toEqual([
      { x: 1, y: 2, w: 1, h: 1 },
      { x: 3, y: 2, w: 1, h: 1 },
    ]);
  });

  test("rejects unknown strategy", () => {
    const N = 5;
    const modules = makeEmpty(N);
    const suppress = makeEmpty(N);
    expect(() =>
      packDarkCells(modules, suppress, N, { strategy: "rect-greedy" as never }),
    ).toThrow(/not implemented/);
  });
});

describe("packDarkCells — frame-count reduction on real QR matrices", () => {
  test("V1-M URL: rect count is meaningfully smaller than dark-cell count", () => {
    const matrix = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "M" });
    const N = matrix.size;
    const suppress = makeEmpty(N);
    let darkCells = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (matrix.modules[r][c]) darkCells++;
      }
    }
    const rects = packDarkCells(matrix.modules, suppress, N);
    // Sanity: at least one rect, fewer rects than dark cells.
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.length).toBeLessThan(darkCells);
    // V1 typically reduces by ~2× on rowwise alone.
    expect(rects.length).toBeLessThan(darkCells * 0.75);
  });

  test("visual identity: packed rects cover exactly the dark unsuppressed cells", () => {
    const matrix = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "M" });
    const N = matrix.size;
    const suppress = makeEmpty(N);
    const rects = packDarkCells(matrix.modules, suppress, N);

    // Paint a coverage map from the rects; assert it matches the source matrix.
    const covered = makeEmpty(N);
    for (const r of rects) {
      for (let dy = 0; dy < r.h; dy++) {
        for (let dx = 0; dx < r.w; dx++) {
          // Coverage check: no double-coverage either.
          expect(covered[r.y + dy][r.x + dx]).toBe(false);
          covered[r.y + dy][r.x + dx] = true;
        }
      }
    }
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        expect(covered[row][col]).toBe(matrix.modules[row][col]);
      }
    }
  });
});
