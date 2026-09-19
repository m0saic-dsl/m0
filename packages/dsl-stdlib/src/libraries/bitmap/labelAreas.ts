/**
 * 8-connected component labeling for binary grids.
 *
 * Walks the ON cells of the grid and assigns each connected component a
 * sequential integer id (0-based, scan order). Pure flood-fill (iterative,
 * stack-based to avoid recursion-depth issues on large grids).
 *
 * The returned `map[y][x]` is the area id for ON cells and -1 for OFF cells.
 */

import type { BinaryGrid, BitmapArea, BitmapAreaMap } from "./types";

export function labelAreas(grid: BinaryGrid): BitmapAreaMap {
  const height = grid.length;
  if (height === 0) {
    return { width: 0, height: 0, areaCount: 0, areas: [], map: [] };
  }
  const width = grid[0].length;

  // Sentinels: -1 = OFF cell, -2 = ON cell, not yet labeled.
  const labels: number[][] = grid.map((row) => row.map((v) => (v ? -2 : -1)));
  const areas: BitmapArea[] = [];
  let nextId = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (labels[y][x] !== -2) continue;
      areas.push(fill(labels, width, height, x, y, nextId));
      nextId++;
    }
  }

  return { width, height, areaCount: areas.length, areas, map: labels };
}

function fill(
  labels: number[][],
  width: number,
  height: number,
  startX: number,
  startY: number,
  id: number,
): BitmapArea {
  const stack: number[] = [startX, startY];
  labels[startY][startX] = id;
  let count = 0;
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;

  while (stack.length > 0) {
    const cy = stack.pop() as number;
    const cx = stack.pop() as number;
    count++;
    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (
          nx >= 0 &&
          nx < width &&
          ny >= 0 &&
          ny < height &&
          labels[ny][nx] === -2
        ) {
          labels[ny][nx] = id;
          stack.push(nx, ny);
        }
      }
    }
  }

  return {
    id,
    pixelCount: count,
    bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}
