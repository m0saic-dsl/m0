import type { OpOutputOptions } from "../_internal/output";
import { swapFramesByLogicalIndex } from "../composed/swap/swapFramesByLogicalIndex";

/**
 * Atomically swap two rendered frames (including their overlays).
 *
 * Both targets are addressed by logical index (0-based, counting only
 * rendered frames). This is the only addressing scheme that makes sense
 * for swap — span and stableKey would change after the first replacement.
 *
 * @param m0      The m0 string
 * @param indexA  Logical index of first frame
 * @param indexB  Logical index of second frame
 */
export function swapFrames(
  m0: string,
  indexA: number,
  indexB: number,
  opts?: OpOutputOptions,
): string {
  return swapFramesByLogicalIndex(m0, indexA, indexB, opts);
}
