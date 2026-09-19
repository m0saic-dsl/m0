/**
 * Generate a `MosaicRankSetFile` from a list of `RankFrame`s using a
 * built-in ordering algorithm.
 *
 * Three deterministic modes:
 *   - "diag":    sort by (x + y), break ties by x, then logicalIndex.
 *   - "cascade": sort by (y, x, logicalIndex) — row-major top-to-bottom,
 *                left-to-right.
 *   - "radial":  sort by Euclidean distance from a reference center
 *                (defaults to the frames' bounding-box center), ascending.
 *
 * Each frame's rank is `pos / (n - 1)` where `pos` is its position in the
 * sorted order. First frame gets 0; last gets 1. Output is aligned with
 * the input array: `ranks[i]` is the rank of `frames[i]`.
 *
 * Pure, deterministic, no I/O.
 */

import type { MosaicRankSetFile } from "../../mirroredTypes";
import type { BuiltInRankMode, RankFrame } from "./types";

export type GenerateRankSetOptions = {
  /**
   * Reference point for radial mode. Ignored by `diag` and `cascade`.
   * Defaults to the centroid of `frames`' bounding box.
   */
  radialCenter?: { x: number; y: number };
};

function centerOf(frame: RankFrame): { x: number; y: number } {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
}

function bboxCenter(frames: readonly RankFrame[]): { x: number; y: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of frames) {
    if (f.x < minX) minX = f.x;
    if (f.y < minY) minY = f.y;
    if (f.x + f.width > maxX) maxX = f.x + f.width;
    if (f.y + f.height > maxY) maxY = f.y + f.height;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

function compareForMode(
  mode: BuiltInRankMode,
  frames: readonly RankFrame[],
  opts: GenerateRankSetOptions,
): (a: number, b: number) => number {
  switch (mode) {
    case "diag":
      return (a, b) => {
        const fa = frames[a], fb = frames[b];
        const sa = fa.x + fa.y;
        const sb = fb.x + fb.y;
        if (sa !== sb) return sa - sb;
        if (fa.x !== fb.x) return fa.x - fb.x;
        return fa.logicalIndex - fb.logicalIndex;
      };
    case "cascade":
      return (a, b) => {
        const fa = frames[a], fb = frames[b];
        if (fa.y !== fb.y) return fa.y - fb.y;
        if (fa.x !== fb.x) return fa.x - fb.x;
        return fa.logicalIndex - fb.logicalIndex;
      };
    case "radial": {
      const ref = opts.radialCenter ?? bboxCenter(frames);
      const distSq = (f: RankFrame): number => {
        const c = centerOf(f);
        const dx = c.x - ref.x;
        const dy = c.y - ref.y;
        return dx * dx + dy * dy;
      };
      return (a, b) => {
        const fa = frames[a], fb = frames[b];
        const da = distSq(fa);
        const db = distSq(fb);
        if (da !== db) return da - db;
        return fa.logicalIndex - fb.logicalIndex;
      };
    }
  }
}

/**
 * Run a built-in ordering algorithm and return a `MosaicRankSetFile`.
 *
 * Edge cases: empty input → `{ mode, ranks: [] }`. Single frame → rank `[0]`.
 */
export function generateRankSet(
  frames: readonly RankFrame[],
  mode: BuiltInRankMode,
  opts: GenerateRankSetOptions = {},
): MosaicRankSetFile {
  const n = frames.length;
  if (n === 0) return { mode, ranks: [] };
  if (n === 1) return { mode, ranks: [0] };

  // Sort INDICES so we can scatter the rank back to its original position.
  const indices = frames.map((_, i) => i);
  indices.sort(compareForMode(mode, frames, opts));

  const ranks = new Array<number>(n);
  for (let pos = 0; pos < n; pos++) {
    ranks[indices[pos]] = pos / (n - 1);
  }
  return { mode, ranks };
}
