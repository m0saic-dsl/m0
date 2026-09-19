/**
 * Generate a {@link MosaicRankSet} from a list of {@link RankFrame}s using a
 * built-in ordering algorithm — StableKey-keyed counterpart of
 * {@link generateRankSet}.
 *
 * Same three modes (`"diag"`, `"cascade"`, `"radial"`) and the same
 * deterministic comparators as the positional builder; differs in output
 * shape: a `Record<stableKey, number>` instead of a `number[]`.
 *
 * Each frame's rank is `pos / (n - 1)` where `pos` is its position in the
 * sorted order. First frame gets 0; last gets 1. Inputs of length 0 → empty
 * record. Inputs of length 1 → single `{ [stableKey]: 0 }`.
 *
 * Requires every input frame to carry a `stableKey`. Throws a descriptive
 * error when any frame is missing one — the StableKey-keyed output has no
 * way to address a frame without it.
 *
 * Pure, deterministic, no I/O.
 */

import type { MosaicRankSet } from "../../mirroredTypes";
import type { BuiltInRankMode, RankFrame } from "./types";

export type GenerateStableKeyRankSetOptions = {
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
  opts: GenerateStableKeyRankSetOptions,
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

function requireStableKey(frame: RankFrame, idx: number): string {
  const k = frame.stableKey;
  if (typeof k !== "string" || k === "") {
    throw new Error(
      `generateStableKeyRankSet: frames[${idx}] is missing a stableKey — ` +
        `StableKey-keyed builders require it on every input (use rankFramesFromM0 ` +
        `or attach stableKey to your RankFrame literal).`,
    );
  }
  return k;
}

export function generateStableKeyRankSet(
  frames: readonly RankFrame[],
  mode: BuiltInRankMode,
  opts: GenerateStableKeyRankSetOptions = {},
): MosaicRankSet {
  const n = frames.length;
  if (n === 0) return { mode, ranks: {} };
  if (n === 1) {
    return { mode, ranks: { [requireStableKey(frames[0], 0)]: 0 } };
  }

  // Validate every frame carries a stableKey before doing any work — gives a
  // clean error pointing at the offending input rather than producing a
  // half-populated set.
  const keys = new Array<string>(n);
  for (let i = 0; i < n; i++) {
    keys[i] = requireStableKey(frames[i], i);
  }
  // Also reject duplicate stableKeys — the output is a Record keyed by
  // stableKey, so duplicates would silently collapse and lose data.
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    if (seen.has(keys[i])) {
      throw new Error(
        `generateStableKeyRankSet: duplicate stableKey "${keys[i]}" at frames[${i}] — ` +
          `frames must have unique stableKeys for the StableKey-keyed output.`,
      );
    }
    seen.add(keys[i]);
  }

  // Sort INDICES so we can scatter the rank back to its original position →
  // then map that position to the frame's stableKey.
  const indices = frames.map((_, i) => i);
  indices.sort(compareForMode(mode, frames, opts));

  const ranks: Record<string, number> = {};
  for (let pos = 0; pos < n; pos++) {
    ranks[keys[indices[pos]]] = pos / (n - 1);
  }
  return { mode, ranks };
}
