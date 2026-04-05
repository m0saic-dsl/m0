import { validateInputOrThrow, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { toCanonicalM0String } from "@m0saic/dsl";
import { walkByLogicalIndex } from "../../_internal/walkByLogicalIndex";

/**
 * Replace the Nth rendered frame (`1` / `F`) in logical traversal order with
 * a valid m0 fragment, preserving any overlay owned by that tile.
 *
 * Only rendered frames (`1` / `F`) are counted for logical index selection.
 * Passthrough (`0` / `>`) and null (`-`) primitives are skipped.
 *
 * @param m0                    The m0 string
 * @param targetLogicalIndex    0-based logical index (counting only `1` / `F` tiles)
 * @param replacement           The replacement m0 fragment (canonical or pretty)
 * @param opts                  Optional output format preference
 * @returns                     The modified string, or `null` if the logical index
 *                              does not exist or is invalid
 *
 * @example
 * replaceNodeByLogicalIndex("3(F,>,F)", 1, "2(F,F)")
 * // => "3(1,0,2(1,1))"
 *
 * @example
 * replaceNodeByLogicalIndex("F{F}", 0, "2(F,F)")
 * // => "2(1,1){1}"
 */
export function replaceNodeByLogicalIndex(
  m0: string,
  targetLogicalIndex: number,
  replacement: string,
  opts?: OpOutputOptions,
): string | null {
  if (!Number.isFinite(targetLogicalIndex) || targetLogicalIndex < 0) return null;

  const canonical = validateInputOrThrow("replaceNodeByLogicalIndex", m0);
  const replacementCanonical = toCanonicalM0String(replacement);

  const { result, found } = walkByLogicalIndex(canonical, targetLogicalIndex, (ctx) => {
    if (ctx.hasOverlay) {
      // Preserve existing overlay — reattach to replacement
      return {
        output: replacementCanonical + ctx.overlay,
        consumedFromRest: ctx.overlayLength,
      };
    }
    return {
      output: replacementCanonical,
      consumedFromRest: 0,
    };
  });

  if (!found) return null;

  return finalizeM0Output("replaceNodeByLogicalIndex", result, opts);
}
