/**
 * svg-path-bounds (vendored)
 *
 * Original npm package: svg-path-bounds
 * Version copied:       1.0.2
 * Copy date:            2026-05-31
 * Source (npm):         https://www.npmjs.com/package/svg-path-bounds
 * Source (GitHub):      https://github.com/dfcreative/svg-path-bounds
 * Original author:      Dima Yv <dfcreative@gmail.com>
 * License:              MIT (see ../LICENSE_MIT.md)
 *
 * Modifications from upstream:
 *   - Ported from CJS to TypeScript ESM.
 *   - Replaced four upstream `require()` calls with ESM imports from
 *     sibling vendor subdirs (../is-svg-path, ../parse-svg-path,
 *     ../abs-svg-path, ../normalize-svg-path).
 *   - Dropped the ES6-template-tag-call path (`Array.isArray(path) && path.length === 1`)
 *     — our callers always pass strings or already-parsed segment arrays.
 *     The original tag-call accommodation is dead weight here.
 *   - Otherwise the bounds computation is byte-identical: parse →
 *     absolutize → normalize (all segments become cubic Béziers) →
 *     scan every coordinate component for min/max.
 *
 * Computes the axis-aligned bounding box of an SVG path. Returns
 * `[minX, minY, maxX, maxY]`. For the all-empty input, returns
 * `[0, 0, 0, 0]`.
 *
 * Note on accuracy: this scans control-point coordinates of the
 * normalized cubic Bézier representation — which is an UPPER BOUND of
 * the curve's true extent. The true on-curve extrema may lie inside
 * the control polygon, so the returned box can be slightly larger than
 * the visually-painted shape. For the SVG → MO use case (grid inference)
 * this looseness is fine because we snap to grid lines downstream anyway.
 */

import { isSvgPath } from "../is-svg-path";
import { parseSvgPath, type PathSegment } from "../parse-svg-path";
import { absSvgPath } from "../abs-svg-path";
import { normalizeSvgPath } from "../normalize-svg-path";

export function svgPathBounds(
  pathIn: string | PathSegment[],
): [number, number, number, number] {
  let path: PathSegment[];

  if (typeof pathIn === "string") {
    if (!isSvgPath(pathIn)) {
      throw new Error("String is not an SVG path.");
    }
    path = parseSvgPath(pathIn);
  } else if (Array.isArray(pathIn)) {
    path = pathIn;
  } else {
    throw new Error("Argument should be a string or an array of path segments.");
  }

  path = absSvgPath(path);
  path = normalizeSvgPath(path);

  if (!path.length) return [0, 0, 0, 0];

  const bounds: [number, number, number, number] = [
    Infinity,
    Infinity,
    -Infinity,
    -Infinity,
  ];

  for (let i = 0, l = path.length; i < l; i++) {
    const points = path[i].slice(1) as number[];

    for (let j = 0; j < points.length; j += 2) {
      const px = points[j];
      const py = points[j + 1];
      if (px < bounds[0]) bounds[0] = px;
      if (py < bounds[1]) bounds[1] = py;
      if (px > bounds[2]) bounds[2] = px;
      if (py > bounds[3]) bounds[3] = py;
    }
  }

  return bounds;
}
