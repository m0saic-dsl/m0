import { validateInputOrThrow, finalizeM0Output, type OpOutputOptions } from "../../_internal/output";
import { walkByLogicalIndex } from "../../_internal/walkByLogicalIndex";
import type { TileTypePrimitive } from "../../../types";

/**
 * Change the type of the Nth rendered frame in logical traversal order.
 *
 * Only rendered frames (`1` / `F`) are counted for logical index selection.
 * Passthrough (`0` / `>`) and null (`-`) primitives are ignored when
 * determining the target index.
 *
 * The replacement value may be any frame type primitive (`F`, `>`, `-`, `0`, `1`),
 * so this op can convert a rendered frame into a passthrough or null.
 *
 * @param m0                    The m0 string
 * @param targetLogicalIndex    0-based logical index (counting only `1` / `F` frames)
 * @param next                  The new frame type primitive
 */
export function setFrameTypeByLogicalIndex(
  m0: string,
  targetLogicalIndex: number,
  next: TileTypePrimitive,
  opts?: OpOutputOptions,
): string {
  if (!Number.isFinite(targetLogicalIndex) || targetLogicalIndex < 0)
    throw new Error("targetLogicalIndex must be >= 0");

  const canonical = validateInputOrThrow("setFrameTypeByLogicalIndex", m0);

  const { result, found } = walkByLogicalIndex(canonical, targetLogicalIndex, () => ({
    output: next,
    consumedFromRest: 0,
  }));

  if (!found) {
    throw new Error(`setFrameTypeByLogicalIndex: targetLogicalIndex ${targetLogicalIndex} not found`);
  }

  return finalizeM0Output("setFrameTypeByLogicalIndex", result, opts);
}
