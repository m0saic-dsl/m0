/**
 * Compose every rect shape on an inferred grid into a single validated M0String.
 *
 * Two packing strategies (`SvgToM0Options.packing`):
 *  - "one":   one rect per layer, sequential brace-nested composition.
 *  - "multi": greedy multi-rect packing per layer via a union-grid encoder.
 *
 * Lifted from `packages/docs/svg-to-mosaic/tools/04-generate-rects.ts` and
 * `tools/05-compose.ts`. All helpers are pure functions; this builder does
 * no I/O. The final composed string is canonicalized and validated by
 * `toM0String` before being returned.
 */

import { container } from "../../builders/container";
import { weightedTokens } from "../../builders/weightedTokens";
import { toM0String } from "../../constructors/toM0String";
import type {
  Grid,
  GridShape,
  GridSpan,
  SvgToM0Options,
  SvgToM0Variant,
} from "./types";

// ── quantization (lifted from 04-generate-rects.ts) ──

function quantizeSegments(lines: number[]): { weights: number[]; total: number } {
  const raw: number[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const delta = lines[i + 1] - lines[i];
    if (!(delta > 0)) {
      throw new Error(`rectsToM0: non-positive grid segment at index ${i}: ${delta}`);
    }
    raw.push(delta);
  }
  const total = Math.round(lines[lines.length - 1] - lines[0]);
  const floored = raw.map((v) => Math.max(1, Math.floor(v)));
  let remainder = total - floored.reduce((a, b) => a + b, 0);

  if (remainder > 0) {
    const ranked = raw
      .map((v, i) => ({ i, frac: v - Math.floor(v) }))
      .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; k < remainder; k++) floored[ranked[k].i]++;
  } else if (remainder < 0) {
    const ranked = floored
      .map((v, i) => ({ i, v }))
      .filter((x) => x.v > 1)
      .sort((a, b) => b.v - a.v || a.i - b.i);
    for (let k = 0; k < ranked.length && remainder < 0; k++) {
      const reducible = ranked[k].v - 1;
      const take = Math.min(reducible, -remainder);
      floored[ranked[k].i] -= take;
      remainder += take;
    }
  }

  const finalSum = floored.reduce((a, b) => a + b, 0);
  if (finalSum !== total) {
    throw new Error(
      `rectsToM0: quantizeSegments failed (expected ${total}, got ${finalSum})`,
    );
  }
  return { weights: floored, total };
}

// ── axis helpers (lifted from 04-generate-rects.ts) ──

function gcdArray(nums: number[]): number {
  if (nums.length === 0) return 1;
  const gcd = (a: number, b: number): number => {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  };
  let r = nums[0];
  for (let i = 1; i < nums.length; i++) {
    r = gcd(r, nums[i]);
    if (r === 1) return 1;
  }
  return r;
}

function sumSlice(arr: number[], start: number, end: number): number {
  let s = 0;
  for (let i = start; i < end; i++) s += arr[i];
  return s;
}

// Single-axis split with per-axis GCD reduction. Returns a raw DSL fragment
// (not branded) — the final composed string is validated at the public-API
// boundary.
function buildAxisSection(
  segments: number[],
  claimants: string[],
  axis: "col" | "row",
): string {
  if (segments.length !== claimants.length) {
    throw new Error("rectsToM0: axis-section length mismatch");
  }
  if (segments.length === 0) {
    throw new Error("rectsToM0: empty axis section");
  }
  const d = gcdArray(segments);
  const reduced = segments.map((s) => s / d);
  const tokens: string[] = [];
  for (let i = 0; i < reduced.length; i++) {
    tokens.push(...weightedTokens(reduced[i], claimants[i]));
  }
  return container(tokens, axis);
}

function assertValidSpan(span: GridSpan, cols: number, rows: number): void {
  if (
    span.xStart < 0 ||
    span.xEnd > cols ||
    span.yStart < 0 ||
    span.yEnd > rows ||
    span.xStart >= span.xEnd ||
    span.yStart >= span.yEnd
  ) {
    throw new Error(
      `rectsToM0: invalid gridSpan x=${span.xStart}-${span.xEnd} y=${span.yStart}-${span.yEnd} (cols=${cols} rows=${rows})`,
    );
  }
}

// ── one-rect-per-layer (lifted from 04-generate-rects.ts) ──

function buildHorizontalPlacement(span: GridSpan, colWeights: number[]): string {
  const cols = colWeights.length;
  const leftSum = sumSlice(colWeights, 0, span.xStart);
  const rectSum = sumSlice(colWeights, span.xStart, span.xEnd);
  const rightSum = sumSlice(colWeights, span.xEnd, cols);

  const segments: number[] = [];
  const claimants: string[] = [];
  if (leftSum > 0) {
    segments.push(leftSum);
    claimants.push("-");
  }
  segments.push(rectSum);
  claimants.push("F");
  if (rightSum > 0) {
    segments.push(rightSum);
    claimants.push("-");
  }
  return buildAxisSection(segments, claimants, "col");
}

function buildSingleRectM0(
  span: GridSpan,
  colWeights: number[],
  rowWeights: number[],
): string {
  assertValidSpan(span, colWeights.length, rowWeights.length);
  const inner = buildHorizontalPlacement(span, colWeights);

  const rows = rowWeights.length;
  const topSum = sumSlice(rowWeights, 0, span.yStart);
  const rectSum = sumSlice(rowWeights, span.yStart, span.yEnd);
  const bottomSum = sumSlice(rowWeights, span.yEnd, rows);

  const segments: number[] = [];
  const claimants: string[] = [];
  if (topSum > 0) {
    segments.push(topSum);
    claimants.push("-");
  }
  segments.push(rectSum);
  claimants.push(inner);
  if (bottomSum > 0) {
    segments.push(bottomSum);
    claimants.push("-");
  }
  return buildAxisSection(segments, claimants, "row");
}

// ── multi-rect packing (lifted from 05-compose.ts) ──

// Two rects overlap iff their grid-INDEX intervals overlap on both axes.
// IMPORTANT: index space, not pixel space — two grid lines that round to the
// same pixel value are still DISTINCT indices. Phase-2 mlogo bug (2026-04-11)
// traced to using pixel-space compat.
function rectsOverlap(a: GridSpan, b: GridSpan): boolean {
  if (a.xEnd <= b.xStart || b.xEnd <= a.xStart) return false;
  if (a.yEnd <= b.yStart || b.yEnd <= a.yStart) return false;
  return true;
}

// Two rects are y-band-compatible iff their y INDEX ranges are either fully
// disjoint or exactly equal. Required so the union-grid encoder produces ONE
// leaf per rect.
function yBandsCompatible(a: GridSpan, b: GridSpan): boolean {
  if (a.yStart === b.yStart && a.yEnd === b.yEnd) return true;
  if (a.yEnd <= b.yStart || b.yEnd <= a.yStart) return true;
  return false;
}

function packGreedy<T extends { gridSpan: GridSpan }>(rects: T[]): T[][] {
  const layers: T[][] = [];
  for (const rect of rects) {
    let placed = false;
    for (const layer of layers) {
      const conflicts = layer.some((existing) => {
        if (rectsOverlap(existing.gridSpan, rect.gridSpan)) return true;
        if (!yBandsCompatible(existing.gridSpan, rect.gridSpan)) return true;
        return false;
      });
      if (!conflicts) {
        layer.push(rect);
        placed = true;
        break;
      }
    }
    if (!placed) layers.push([rect]);
  }
  return layers;
}

function buildMultiRectLayer(
  rectsInLayer: Array<{ gridSpan: GridSpan }>,
  colWeights: number[],
  rowWeights: number[],
): string {
  if (rectsInLayer.length === 0) {
    throw new Error("rectsToM0: empty layer in multi-rect packing");
  }
  const cols = colWeights.length;
  const rows = rowWeights.length;

  const ySet = new Set<number>([0, rows]);
  for (const r of rectsInLayer) {
    ySet.add(r.gridSpan.yStart);
    ySet.add(r.gridSpan.yEnd);
  }
  const yBoundaries = [...ySet].sort((a, b) => a - b);

  const rowSegments: number[] = [];
  const rowClaimants: string[] = [];

  for (let i = 0; i < yBoundaries.length - 1; i++) {
    const yTop = yBoundaries[i];
    const yBot = yBoundaries[i + 1];
    const bandH = sumSlice(rowWeights, yTop, yBot);
    if (bandH <= 0) continue;

    const bandRects = rectsInLayer.filter(
      (r) => r.gridSpan.yStart <= yTop && r.gridSpan.yEnd >= yBot,
    );

    if (bandRects.length === 0) {
      rowSegments.push(bandH);
      rowClaimants.push("-");
      continue;
    }

    const xSet = new Set<number>([0, cols]);
    for (const r of bandRects) {
      xSet.add(r.gridSpan.xStart);
      xSet.add(r.gridSpan.xEnd);
    }
    const xBoundaries = [...xSet].sort((a, b) => a - b);

    const colSegments: number[] = [];
    const colClaimants: string[] = [];

    for (let j = 0; j < xBoundaries.length - 1; j++) {
      const xLeft = xBoundaries[j];
      const xRight = xBoundaries[j + 1];
      const cellW = sumSlice(colWeights, xLeft, xRight);
      if (cellW <= 0) continue;

      const occupied = bandRects.some(
        (r) => r.gridSpan.xStart <= xLeft && r.gridSpan.xEnd >= xRight,
      );
      colSegments.push(cellW);
      colClaimants.push(occupied ? "1" : "-");
    }

    const colExpr = buildAxisSection(colSegments, colClaimants, "col");
    rowSegments.push(bandH);
    rowClaimants.push(colExpr);
  }

  return buildAxisSection(rowSegments, rowClaimants, "row");
}

// ── composition ──

function composeLayouts(layouts: string[]): string {
  if (layouts.length === 0) {
    throw new Error("rectsToM0: expected at least one layer to compose");
  }
  let result = layouts[layouts.length - 1];
  for (let i = layouts.length - 2; i >= 0; i--) {
    result = `${layouts[i]}{${result}}`;
  }
  return result;
}

function sortShapesReadingOrder(shapes: GridShape[]): GridShape[] {
  return [...shapes].sort((a, b) => {
    if (a.gridSpan.yStart !== b.gridSpan.yStart) {
      return a.gridSpan.yStart - b.gridSpan.yStart;
    }
    if (a.gridSpan.xStart !== b.gridSpan.xStart) {
      return a.gridSpan.xStart - b.gridSpan.xStart;
    }
    if (a.gridSpan.yEnd !== b.gridSpan.yEnd) {
      return a.gridSpan.yEnd - b.gridSpan.yEnd;
    }
    if (a.gridSpan.xEnd !== b.gridSpan.xEnd) {
      return a.gridSpan.xEnd - b.gridSpan.xEnd;
    }
    return a.index - b.index;
  });
}

// ── public API ──

const DEFAULT_OPTIONS: Required<SvgToM0Options> = {
  driftPercent: 0,
  driftMode: "gcd-snap",
  packing: "multi",
};

/**
 * Compose every rect shape on an inferred {@link Grid} into a single
 * validated `M0String`. Pure, deterministic, no I/O.
 *
 * @example
 * const grid = inferGrid(shapes, { driftPercent: 0.5 });
 * const variant = rectsToM0(grid, { packing: "multi" });
 * variant.m0; // validated M0String composing all rects
 */
export function rectsToM0(grid: Grid, opts: SvgToM0Options = {}): SvgToM0Variant {
  if (!Array.isArray(grid.xLines) || grid.xLines.length < 2) {
    throw new Error("rectsToM0: invalid grid — xLines must have at least 2 entries");
  }
  if (!Array.isArray(grid.yLines) || grid.yLines.length < 2) {
    throw new Error("rectsToM0: invalid grid — yLines must have at least 2 entries");
  }
  if (!Array.isArray(grid.shapes) || grid.shapes.length === 0) {
    throw new Error("rectsToM0: invalid grid — shapes must be non-empty");
  }

  // Coalesce per-key so callers forwarding `undefined` (e.g. svgToM0 passing
  // an unset prop through) don't shadow the defaults.
  const merged: Required<SvgToM0Options> = {
    driftPercent: opts.driftPercent ?? DEFAULT_OPTIONS.driftPercent,
    driftMode: opts.driftMode ?? DEFAULT_OPTIONS.driftMode,
    packing: opts.packing ?? DEFAULT_OPTIONS.packing,
  };

  const colWeights = quantizeSegments(grid.xLines).weights;
  const rowWeights = quantizeSegments(grid.yLines).weights;

  const sorted = sortShapesReadingOrder(grid.shapes);

  let layerStrings: string[];
  let layerCount: number;

  if (merged.packing === "one") {
    layerStrings = sorted.map((s) =>
      buildSingleRectM0(s.gridSpan, colWeights, rowWeights),
    );
    layerCount = layerStrings.length;
  } else {
    const layers = packGreedy(sorted);
    layerStrings = layers.map((layer) =>
      buildMultiRectLayer(layer, colWeights, rowWeights),
    );
    layerCount = layers.length;
  }

  const composed = composeLayouts(layerStrings);
  const m0 = toM0String(composed, "rectsToM0");

  return {
    m0,
    charLen: composed.length,
    rectCount: sorted.length,
    layerCount,
    gridDims: { cols: colWeights.length, rows: rowWeights.length },
    options: merged,
  };
}
