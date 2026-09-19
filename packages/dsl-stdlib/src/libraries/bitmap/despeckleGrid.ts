/**
 * Single-pass speckle removal.
 *
 * Flips any cell whose value differs from at least 7 of its 8 neighbors — i.e.
 * "isolated" pixels with fewer than 2 like-neighbors get flipped. Operates on a
 * snapshot of the input grid so the result is order-independent (the original
 * CLI tool mutated in place; we return a new grid to keep callers pure per §9
 * determinism).
 *
 * Returns the new grid plus a count of cells that flipped.
 */

import type { BinaryGrid } from "./types";

export function despeckleGrid(grid: BinaryGrid): { grid: BinaryGrid; flipped: number } {
  const height = grid.length;
  if (height === 0) return { grid: [], flipped: 0 };
  const width = grid[0].length;

  const snapshot: BinaryGrid = grid.map((row) => [...row]);
  const out: BinaryGrid = grid.map((row) => [...row]);
  let flipped = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = snapshot[y][x];
      let sameCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx >= 0 &&
            nx < width &&
            ny >= 0 &&
            ny < height &&
            snapshot[ny][nx] === val
          ) {
            sameCount++;
          }
        }
      }
      if (sameCount < 2) {
        out[y][x] = !val;
        flipped++;
      }
    }
  }
  return { grid: out, flipped };
}
