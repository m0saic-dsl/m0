import { type OpOutputOptions } from "../../_internal/output";
import { resolveSpanByStableId } from "../../_internal/resolveSpanByStableId";
import { setTileTypeBySpan } from "./setTileTypeBySpan";
import type { TileTypePrimitive } from "../../../types";

/**
 * Change the tile type of a node identified by its StableKey.
 *
 * Resolves the target node via stableKey -> span, then delegates mutation
 * to `setTileTypeBySpan`. This selector can address **any** leaf primitive
 * (rendered tiles, passthroughs, and nulls) -- useful for editor interactions
 * where nodes are tracked by stable identity.
 *
 * @param m0         The m0 string
 * @param stableKey  The stable identity key of the target node
 * @param next       The replacement primitive: `"F"` (tile), `">"` (passthrough), `"-"` (null)
 * @param opts       Optional output format preference
 *
 * @example
 * setTileTypeByStableId(layout, "r/gcolc0/fc1", "-")
 */
export function setTileTypeByStableId(
  m0: string,
  stableKey: string,
  next: TileTypePrimitive,
  opts?: OpOutputOptions,
): string {
  const { canonical, span } = resolveSpanByStableId("setTileTypeByStableId", m0, stableKey);
  return setTileTypeBySpan(canonical, span, next, opts);
}
