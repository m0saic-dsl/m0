import { validateInputOrThrow, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { walkByLogicalIndex } from "../../_internal/walkByLogicalIndex";

/**
 * Add an overlay to the Nth rendered frame in logical traversal order.
 *
 * Only rendered frames (`1` / `F`) are counted for logical index selection.
 * Passthrough (`0` / `>`) and null (`-`) primitives are ignored when
 * determining the target index.
 *
 * If the target tile already has an overlay, returns the string unchanged
 * (no-op, preserving the existing overlay).
 *
 * @param m0                    The m0 string
 * @param targetLogicalIndex    0-based logical index (counting only `1` / `F` tiles)
 * @returns                     The modified string, or null if the logical index
 *                              does not exist or is invalid
 */
export function addOverlayByLogicalIndex(
  m0: string,
  targetLogicalIndex: number,
  opts?: OpOutputOptions,
): string | null {
  if (!Number.isFinite(targetLogicalIndex) || targetLogicalIndex < 0) return null;

  const canonical = validateInputOrThrow("addOverlayByLogicalIndex", m0);

  const { result, found } = walkByLogicalIndex(canonical, targetLogicalIndex, (ctx) => {
    if (ctx.hasOverlay) {
      // Already has overlay — copy it through unchanged
      return {
        output: "F" + ctx.overlay,
        consumedFromRest: ctx.overlayLength,
      };
    }
    // No overlay — insert {F}
    return {
      output: "F{F}",
      consumedFromRest: 0,
    };
  });

  if (!found) return null;

  return finalizeM0Output("addOverlayByLogicalIndex", result, opts);
}
