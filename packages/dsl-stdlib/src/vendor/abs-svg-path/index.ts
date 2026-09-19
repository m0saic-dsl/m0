/**
 * abs-svg-path (vendored)
 *
 * Original npm package: abs-svg-path
 * Version copied:       0.1.1
 * Copy date:            2026-05-31
 * Source (npm):         https://www.npmjs.com/package/abs-svg-path
 * Source (GitHub):      https://github.com/jkroso/abs-svg-path
 * Original author:      Jake Rosoman <jkroso@gmail.com>
 * License:              MIT (see ../LICENSE_MIT.md)
 *
 * Modifications from upstream:
 *   - Ported from CJS to TypeScript ESM.
 *   - Typed input + output as `PathSegment[]` (from sibling
 *     `../parse-svg-path` vendor).
 *   - Replaced the `seg = seg.slice()` copy with a typed spread; functionally
 *     identical.
 *   - Otherwise the relative→absolute conversion logic + cursor-state
 *     machine are byte-identical to upstream.
 *
 * Converts an array of SVG path segments to use absolute coordinates
 * (all lowercase commands rewritten to uppercase, with cursor-relative
 * coords shifted to absolute).
 */

import type { PathSegment } from "../parse-svg-path";

export function absSvgPath(path: PathSegment[]): PathSegment[] {
  let startX = 0;
  let startY = 0;
  let x = 0;
  let y = 0;

  return path.map((segIn) => {
    const seg: PathSegment = [...segIn];
    const type = seg[0];
    const command = type.toUpperCase();

    // Relative → absolute: shift coords by current cursor.
    if (type !== command) {
      seg[0] = command;
      switch (type) {
        case "a":
          // arc: rx, ry, xrot, large, sweep, endX, endY
          // only endX/endY are coordinates; the others are flags/dimensions.
          (seg[6] as number) += x;
          (seg[7] as number) += y;
          break;
        case "v":
          (seg[1] as number) += y;
          break;
        case "h":
          (seg[1] as number) += x;
          break;
        default:
          // All other commands: every pair (i, i+1) is an (x, y) point.
          for (let i = 1; i < seg.length; ) {
            (seg[i++] as number) += x;
            (seg[i++] as number) += y;
          }
      }
    }

    // Update cursor state based on the (now-absolute) segment.
    switch (command) {
      case "Z":
        x = startX;
        y = startY;
        break;
      case "H":
        x = seg[1] as number;
        break;
      case "V":
        y = seg[1] as number;
        break;
      case "M":
        x = startX = seg[1] as number;
        y = startY = seg[2] as number;
        break;
      default:
        x = seg[seg.length - 2] as number;
        y = seg[seg.length - 1] as number;
    }

    return seg;
  });
}
