/**
 * Compute the axis-aligned bounding box of every `<path>` in a parsed SVG
 * and return them as a list of {@link ExtractedShape}s.
 *
 * Lifted from `packages/docs/svg-to-mosaic/tools/01-extract-geometry.ts`
 * (bounds computation is delegated to the vendored `svg-path-bounds` —
 * see `src/vendor/README.md` for the chain + attribution).
 *
 * Pure, deterministic, no I/O.
 */

import { svgPathBounds as pathBounds } from "../../vendor/svg-path-bounds";
import type { ExtractedShape, ShapeBounds, SvgPath } from "./types";

function toBounds(minX: number, minY: number, maxX: number, maxY: number): ShapeBounds {
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * For each `SvgPath`, compute the axis-aligned bounding box of its path data
 * and emit an `ExtractedShape`. Shapes preserve input order; ids are stable
 * `shape-NNNN` slugs zero-padded to 4 digits.
 */
export function extractGeometry(paths: SvgPath[]): ExtractedShape[] {
  if (!Array.isArray(paths)) {
    throw new Error("extractGeometry: paths must be an array");
  }
  const shapes: ExtractedShape[] = [];
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    const [minX, minY, maxX, maxY] = pathBounds(path.d);
    shapes.push({
      id: `shape-${String(index).padStart(4, "0")}`,
      index,
      type: "path",
      geometry: { d: path.d },
      style: path.style,
      bounds: toBounds(minX, minY, maxX, maxY),
    });
  }
  return shapes;
}
