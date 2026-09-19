import { despeckleGrid } from "./despeckleGrid";

describe("despeckleGrid", () => {
  test("isolated ON pixel surrounded by OFF gets flipped", () => {
    // Single ON pixel in the middle of a 3×3 of OFF — 0 like-neighbors → flips.
    const grid = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ];
    const { grid: out, flipped } = despeckleGrid(grid);
    expect(out[1][1]).toBe(false);
    expect(flipped).toBeGreaterThanOrEqual(1);
  });

  test("2×2 ON cluster does not flip its interior", () => {
    // Each pixel in the 2×2 sees its 3 cluster-mates as like-neighbors → keeps.
    const grid = [
      [false, false, false, false],
      [false, true, true, false],
      [false, true, true, false],
      [false, false, false, false],
    ];
    const { grid: out } = despeckleGrid(grid);
    expect(out[1][1]).toBe(true);
    expect(out[1][2]).toBe(true);
    expect(out[2][1]).toBe(true);
    expect(out[2][2]).toBe(true);
  });

  test("empty grid → empty grid, 0 flips", () => {
    expect(despeckleGrid([])).toEqual({ grid: [], flipped: 0 });
  });

  test("does not mutate input grid", () => {
    const grid = [
      [false, true, false],
      [false, false, false],
    ];
    const snapshot = grid.map((r) => [...r]);
    despeckleGrid(grid);
    expect(grid).toEqual(snapshot);
  });

  test("order-independent — uses snapshot, not cascading flips", () => {
    // Two ON pixels diagonally placed → each is its own neighbor under 8-conn.
    // Each has exactly 1 like-neighbor (the other), so both should flip
    // independently — order-independent because we snapshot first.
    const grid = [
      [true, false, false],
      [false, false, false],
      [false, false, true],
    ];
    const { grid: out, flipped } = despeckleGrid(grid);
    expect(out[0][0]).toBe(false);
    expect(out[2][2]).toBe(false);
    expect(flipped).toBeGreaterThanOrEqual(2);
  });
});
