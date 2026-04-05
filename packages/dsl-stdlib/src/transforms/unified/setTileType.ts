import type { TransformTarget } from "../types";
import type { OpOutputOptions } from "../_internal/output";
import type { TileTypePrimitive } from "../../types";
import { setFrameTypeByLogicalIndex } from "../primitives/frame/setFrameTypeByLogicalIndex";
import { setTileTypeBySpan } from "../primitives/tile/setTileTypeBySpan";
import { setTileTypeByStableId } from "../primitives/tile/setTileTypeByStableId";

/**
 * Change the type of a leaf node.
 *
 * Can convert between any leaf primitive: `"F"` (tile), `">"` (passthrough),
 * `"-"` (null), `"1"` (canonical tile), `"0"` (canonical passthrough).
 *
 * When targeting by `logicalIndex`, only rendered frames (1/F) are counted.
 * When targeting by `span` or `stableKey`, any leaf primitive can be addressed.
 *
 * @param m0      The m0 string
 * @param target  Which node to modify (by logicalIndex, span, or stableKey)
 * @param type    The new tile type primitive
 */
export function setTileType(
  m0: string,
  target: TransformTarget,
  type: TileTypePrimitive,
  opts?: OpOutputOptions,
): string {
  switch (target.by) {
    case "logicalIndex":
      return setFrameTypeByLogicalIndex(m0, target.index, type, opts);
    case "span":
      return setTileTypeBySpan(m0, target.span, type, opts);
    case "stableKey":
      return setTileTypeByStableId(m0, target.key, type, opts);
  }
}
