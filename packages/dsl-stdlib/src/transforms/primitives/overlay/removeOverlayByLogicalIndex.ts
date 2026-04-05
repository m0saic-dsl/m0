import { validateInputOrThrow, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { walkByLogicalIndex } from "../../_internal/walkByLogicalIndex";

/**
 * Remove the overlay from the Nth rendered frame in logical traversal order.
 *
 * Only rendered frames (`1` / `F`) are counted for logical index selection.
 * Passthrough (`0` / `>`) and null (`-`) primitives are ignored when
 * determining the target index.
 *
 * If the target tile does not own an overlay, the operation is a no-op and
 * returns the canonical string unchanged.
 *
 * @param m0                    The m0 string
 * @param targetLogicalIndex    0-based logical index (counting only `1` / `F` tiles)
 * @param opts                  Optional output format preference
 * @returns                     The modified string, or null if the logical index
 *                              does not exist or is invalid
 *
 * @example
 * removeOverlayByLogicalIndex("2(F{F},F)", 0)
 * // => "2(F,F)"
 */
export function removeOverlayByLogicalIndex(
  m0: string,
  targetLogicalIndex: number,
  opts?: OpOutputOptions,
): string | null {
  if (!Number.isFinite(targetLogicalIndex) || targetLogicalIndex < 0) return null;

  const canonical = validateInputOrThrow("removeOverlayByLogicalIndex", m0);

  const { result, found } = walkByLogicalIndex(canonical, targetLogicalIndex, (ctx) => {
    if (ctx.hasOverlay) {
      // Has overlay — remove the entire {...} block
      return {
        output: "F",
        consumedFromRest: ctx.overlayLength,
      };
    }
    // No overlay — no-op, keep tile as-is
    return {
      output: "F",
      consumedFromRest: 0,
    };
  });

  if (!found) return null;

  return finalizeM0Output("removeOverlayByLogicalIndex", result, opts);
}
