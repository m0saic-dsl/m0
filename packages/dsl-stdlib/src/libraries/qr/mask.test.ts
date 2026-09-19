import { applyMask, chooseBestMask, maskFormula, maskPenalty } from "./mask";
import { initMatrix } from "./matrix";

describe("maskFormula — spec values for representative cells", () => {
  test("mask 0: (r+c) % 2 == 0", () => {
    expect(maskFormula(0, 0, 0)).toBe(true);
    expect(maskFormula(0, 0, 1)).toBe(false);
    expect(maskFormula(0, 1, 1)).toBe(true);
    expect(maskFormula(0, 3, 4)).toBe(false);
  });

  test("mask 1: r % 2 == 0 (horizontal stripes)", () => {
    expect(maskFormula(1, 0, 0)).toBe(true);
    expect(maskFormula(1, 0, 99)).toBe(true);
    expect(maskFormula(1, 1, 0)).toBe(false);
  });

  test("mask 2: c % 3 == 0 (vertical stripes)", () => {
    expect(maskFormula(2, 0, 0)).toBe(true);
    expect(maskFormula(2, 0, 1)).toBe(false);
    expect(maskFormula(2, 5, 6)).toBe(true);
  });

  test("mask 7: ((r+c)%2 + (r*c)%3) % 2 == 0", () => {
    // r=0 c=0: (0+0)%2=0, (0*0)%3=0 → 0 % 2 = 0 → true
    expect(maskFormula(7, 0, 0)).toBe(true);
    // r=1 c=1: (1+1)%2=0, (1*1)%3=1 → 1 % 2 = 1 → false
    expect(maskFormula(7, 1, 1)).toBe(false);
  });

  test("invalid mask throws", () => {
    expect(() => maskFormula(-1, 0, 0)).toThrow(/invalid mask/);
    expect(() => maskFormula(8, 0, 0)).toThrow(/invalid mask/);
  });
});

describe("applyMask — only flips non-reserved cells", () => {
  test("function patterns survive mask application", () => {
    const m = initMatrix(1);
    // Snapshot a few function-pattern cells.
    const finderCenter = m.modules[3][3];
    const darkMod = m.modules[13][8];
    applyMask(m, 0);
    // Function patterns must be unchanged (reserved=true → skipped).
    expect(m.modules[3][3]).toBe(finderCenter);
    expect(m.modules[13][8]).toBe(darkMod);
  });

  test("mask 1 flips every cell in even rows (within the data area)", () => {
    const m = initMatrix(1);
    // Pick a cell in the data area (not reserved).
    // Row 9, col 9 in V1 is non-reserved.
    expect(m.reserved[9][9]).toBe(false);
    const before = m.modules[9][9];
    applyMask(m, 1); // r%2==0 → flips row 0, 2, 4, ... rows. Row 9 stays.
    expect(m.modules[9][9]).toBe(before);
    applyMask(m, 1); // flipping row 9 again is a no-op.
    expect(m.modules[9][9]).toBe(before);
    // But row 10 IS in mask 1's set.
    expect(m.reserved[10][9]).toBe(false);
    const before10 = m.modules[10][9];
    applyMask(m, 1);
    expect(m.modules[10][9]).toBe(!before10);
  });
});

describe("maskPenalty — synthetic cases", () => {
  function emptyGrid(size: number): boolean[][] {
    return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  }

  test("all-light grid: pure N4 penalty (100% light → max imbalance)", () => {
    const size = 21;
    const g = emptyGrid(size);
    const p = maskPenalty(g, size);
    // 100% light: |0-50|/5 = 10 steps → +100.
    // Plus N1 penalty for rows/cols: each row has a run of 21 → 3 + (21-5) = 19 per row, ×21 rows ×2 axes = 798.
    // Plus N2 penalty for 2×2 light blocks: (21-1)² = 400 blocks × 3 = 1200.
    // Total: 19*21*2 + 1200 + 100 = 798 + 1200 + 100 = 2098.
    expect(p).toBe(798 + 1200 + 100);
  });

  test("all-dark grid: same total as all-light (N1+N2+N4 symmetric)", () => {
    const size = 21;
    const g = emptyGrid(size).map((row) => row.map(() => true));
    expect(maskPenalty(g, size)).toBe(maskPenalty(emptyGrid(size), size));
  });

  test("checkerboard: no N1 runs, no N2 blocks, slight N4 from ceil-rounding", () => {
    const size = 21;
    const g = emptyGrid(size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) g[r][c] = (r + c) % 2 === 0;
    }
    // Pure checkerboard: every run is length 1, no 2×2 blocks. N1 = N2 = N3 = 0.
    // 221 dark in 441 cells = 50.11%. qrcode's N4 ceil-formula:
    //   ceil(50.11/5) - 10 = 11 - 10 = 1 → 10.
    expect(maskPenalty(g, size)).toBe(10);
  });
});

describe("chooseBestMask — picks lowest-penalty mask among the 8", () => {
  test("returns a mask in [0, 7] and a non-empty modules grid", () => {
    const m = initMatrix(1);
    // Fill the data area with a fake pattern (alternate rows light/dark) so
    // there's content to mask.
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (!m.reserved[r][c]) m.modules[r][c] = r % 2 === 0;
      }
    }
    const result = chooseBestMask(m, () => {}); // empty stamp-format
    expect(result.mask).toBeGreaterThanOrEqual(0);
    expect(result.mask).toBeLessThanOrEqual(7);
    expect(result.modules.length).toBe(m.size);
  });

  test("deterministic — same input twice picks the same mask", () => {
    const m1 = initMatrix(1);
    const m2 = initMatrix(1);
    for (let r = 0; r < m1.size; r++) {
      for (let c = 0; c < m1.size; c++) {
        if (!m1.reserved[r][c]) {
          m1.modules[r][c] = (r * c) % 3 === 0;
          m2.modules[r][c] = (r * c) % 3 === 0;
        }
      }
    }
    const a = chooseBestMask(m1, () => {});
    const b = chooseBestMask(m2, () => {});
    expect(a.mask).toBe(b.mask);
  });
});
