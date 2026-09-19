/**
 * Visual sidecar emitters for bitmap-style MO.
 *
 * Mirrors the three text outputs of the canonical
 * `packages/docs/png-to-bitmap-mosaic/tools/02-bitmap-to-visual.ts` CLI tool,
 * but operates directly on the in-memory `BinaryGrid` / `BitmapAreaMap` —
 * callers (the wizard, the CLI tool itself) can skip a DSL re-parse round-trip.
 *
 * Three views, all newline-terminated:
 *
 *   binaryGridToVisualDsl     — pretty DSL: one `W(c,c,…)` row per line, valid
 *                               m0 with whitespace.
 *   binaryGridToVisualArt     — block art: one char per cell (default `█`/` `).
 *                               Zoom out in your editor to see the silhouette.
 *   areaMapToVisualLabels     — area labels: cycling glyphs (`A`,`B`,…) per
 *                               connected component, space for OFF cells.
 */

import type { BinaryGrid, BitmapAreaMap, VisualGlyphs } from "./types";

const DEFAULT_ON_CHAR = "█"; // █
const DEFAULT_OFF_CHAR = " ";
const DEFAULT_AREA_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*+=~";

export function binaryGridToVisualDsl(grid: BinaryGrid): string {
  const height = grid.length;
  if (height === 0) return "0[\n]\n";
  const width = grid[0].length;

  const rowLines = grid.map((row) => {
    const cells = row.map((v) => (v ? "1" : "-")).join(",");
    return `${width}(${cells})`;
  });
  return `${height}[\n${rowLines.join(",\n")}\n]\n`;
}

export function binaryGridToVisualArt(
  grid: BinaryGrid,
  opts: VisualGlyphs = {},
): string {
  const onChar = opts.onChar ?? DEFAULT_ON_CHAR;
  const offChar = opts.offChar ?? DEFAULT_OFF_CHAR;
  if (grid.length === 0) return "\n";

  const lines = grid.map((row) =>
    row.map((v) => (v ? onChar : offChar)).join(""),
  );
  return lines.join("\n") + "\n";
}

export function areaMapToVisualLabels(
  areaMap: BitmapAreaMap,
  opts: VisualGlyphs = {},
): string {
  const glyphs = opts.areaGlyphs ?? DEFAULT_AREA_GLYPHS;
  if (glyphs.length === 0) {
    throw new Error("areaMapToVisualLabels: areaGlyphs must be non-empty");
  }
  if (areaMap.height === 0) return "\n";

  const lines = areaMap.map.map((row) =>
    row.map((id) => (id < 0 ? " " : glyphs[id % glyphs.length])).join(""),
  );
  return lines.join("\n") + "\n";
}
