/**
 * Convert a composed m0 string into the `RankFrame[]` shape the rank
 * algorithms consume. Thin wrapper around `queryFrames(m0).logical()`
 * that strips it to the four fields the ranks module cares about.
 *
 * Pure, deterministic, no I/O.
 */

import { queryFrames } from "../../queries/queryFrames";
import type { RankFrame } from "./types";

export type RankFramesOptions = {
  /** Width passed to the m0 parser. Defaults to 1920. */
  canvasW?: number;
  /** Height passed to the m0 parser. Defaults to 1080. */
  canvasH?: number;
};

export function rankFramesFromM0(
  m0: string,
  opts: RankFramesOptions = {},
): RankFrame[] {
  const canvasW = opts.canvasW ?? 1920;
  const canvasH = opts.canvasH ?? 1080;
  const frames = queryFrames(m0, { width: canvasW, height: canvasH }).logical();
  return frames.map((f) => ({
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    logicalIndex: f.logicalIndex,
    stableKey: f.meta.stableKey,
  }));
}
