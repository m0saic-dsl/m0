/**
 * Binary grid → validated bitmap m0 string.
 *
 * Emits the canonical "explicit bitmap" form: `H[W(c,c,…),W(…),…]` where each
 * cell token is `1` (ON) or `-` (OFF). One cell per pixel — no compression,
 * no rect packing. This is the form the canonical 272² brand bitmap
 * (`packages/docs/png-to-bitmap-mosaic/examples/m33/m33.m0`) uses.
 *
 * Validates the result through `toM0String` so callers always get a canonical
 * branded `M0String` back (per §9 DSL integrity rule).
 */

import type { M0String } from "@m0saic/dsl";
import { toM0String } from "../../constructors/toM0String";
import type { BinaryGrid } from "./types";

export function binaryGridToM0(grid: BinaryGrid): M0String {
  const height = grid.length;
  if (height === 0) {
    throw new Error("binaryGridToM0: grid must have at least one row");
  }
  const width = grid[0].length;
  if (width === 0) {
    throw new Error("binaryGridToM0: grid rows must have at least one cell");
  }
  for (let y = 0; y < height; y++) {
    if (grid[y].length !== width) {
      throw new Error(
        `binaryGridToM0: row ${y} has length ${grid[y].length}, expected ${width}`,
      );
    }
  }

  const rowFragments: string[] = new Array(height);
  for (let y = 0; y < height; y++) {
    const cells: string[] = new Array(width);
    for (let x = 0; x < width; x++) {
      cells[x] = grid[y][x] ? "1" : "-";
    }
    rowFragments[y] = `${width}(${cells.join(",")})`;
  }
  return toM0String(`${height}[${rowFragments.join(",")}]`, "binaryGridToM0");
}
