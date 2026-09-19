/**
 * Project a {@link MosaicMaskSetFile} (indexed by canonical source order,
 * with `bounds` set to the structural OWNER — usually a group) into a
 * `Record<stableKey, MosaicMaskEntry | null>` keyed by the LEAF frame's
 * real stableKey.
 *
 * Two distinct projections of the same per-source mask data:
 *
 *   - `generateMasks` emits the dictionary-on-disk shape (array of length
 *     `sourceCount`, owner-bounds per entry). Right for `masks.json`.
 *   - `generateMasksByStableKey` emits the editor-handoff shape (leaf-key
 *     map, no array index dependency). Right for `.m0c`'s `masks` field
 *     and the Layout editor's per-frame silhouette overlay.
 *
 * The matching mirrors `generateMasks`'s internal `frameForShape` step:
 *   1. Sort grid.shapes into canonical reading order (same tiebreaker
 *      ladder as `sortShapesReadingOrder` inside `generateMasks`).
 *   2. Parse the m0 with `parseM0StringComplete` to get render frames
 *      that carry REAL stableKeys (not the synthetic `f0`/`f1` placeholders
 *      that `parseM0StringToRenderFrames` returns).
 *   3. Greedy nearest-bounds match of sorted[i] → renderFrames[j], same
 *      tolerance (L1 distance ≤ 8) as `generateMasks`.
 *   4. For each masked shape, write `result[renderFrames[matched].meta.stableKey]
 *      = { localPath, bounds }`.
 *
 * Best-effort: returns `{}` when the m0 fails to parse, when shape/frame
 * counts disagree (e.g. dedup variants), or when matching fails within
 * tolerance. Callers treat that as "no inline masks — tiles render as
 * plain rects." Throwing here would defeat the wizard's degrade-gracefully
 * handoff posture.
 *
 * Pure, deterministic, no I/O.
 */

import { parseM0StringComplete } from "@m0saic/dsl";
import type { M0String } from "@m0saic/dsl";
import type { MosaicMaskEntry, MosaicMaskSetFile } from "../../mirroredTypes";
import type { Grid } from "./types";

export function generateMasksByStableKey(
  grid: Grid,
  m0: M0String | string,
  maskSet: MosaicMaskSetFile,
  canvasW: number,
  canvasH: number,
): Record<string, MosaicMaskEntry | null> {
  if (!grid.shapes || grid.shapes.length === 0) return {};
  if (maskSet.masks.length !== grid.shapes.length) return {};

  const parsed = parseM0StringComplete(String(m0), canvasW, canvasH);
  if (!parsed.ok) return {};
  const renderFrames = parsed.ir.renderFrames;
  if (renderFrames.length !== grid.shapes.length) return {};

  // Mirror `sortShapesReadingOrder` from generateMasks.ts. Inlined rather
  // than imported because the tiebreaker ladder is small and stable, and
  // exporting it would widen this library's public API for no gain.
  const sortedShapes = [...grid.shapes].sort((a, b) => {
    if (a.gridSpan.yStart !== b.gridSpan.yStart) return a.gridSpan.yStart - b.gridSpan.yStart;
    if (a.gridSpan.xStart !== b.gridSpan.xStart) return a.gridSpan.xStart - b.gridSpan.xStart;
    if (a.gridSpan.yEnd !== b.gridSpan.yEnd) return a.gridSpan.yEnd - b.gridSpan.yEnd;
    if (a.gridSpan.xEnd !== b.gridSpan.xEnd) return a.gridSpan.xEnd - b.gridSpan.xEnd;
    return a.index - b.index;
  });

  const frameUsed = new Array<boolean>(renderFrames.length).fill(false);
  const out: Record<string, MosaicMaskEntry | null> = {};

  for (let i = 0; i < sortedShapes.length; i++) {
    const mask = maskSet.masks[i];
    if (!mask) continue;
    const target = sortedShapes[i].snappedBounds;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < renderFrames.length; j++) {
      if (frameUsed[j]) continue;
      const f = renderFrames[j];
      const dist =
        Math.abs(Math.round(f.x) - Math.round(target.x)) +
        Math.abs(Math.round(f.y) - Math.round(target.y)) +
        Math.abs(Math.round(f.width) - Math.round(target.width)) +
        Math.abs(Math.round(f.height) - Math.round(target.height));
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
      }
    }
    // Same tolerance as generateMasks's matching loop. Skip unresolved
    // entries rather than throwing — best-effort handoff.
    if (bestIdx < 0 || bestDist > 8) continue;
    frameUsed[bestIdx] = true;
    const stableKey = String(renderFrames[bestIdx].meta.stableKey);
    out[stableKey] = { localPath: mask.localPath, bounds: mask.bounds };
  }

  return out;
}
