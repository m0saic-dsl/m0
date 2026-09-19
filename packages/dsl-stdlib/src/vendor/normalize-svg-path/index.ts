/**
 * normalize-svg-path (vendored)
 *
 * Original npm package: normalize-svg-path
 * Version copied:       1.1.0
 * Copy date:            2026-05-31
 * Source (npm):         https://www.npmjs.com/package/normalize-svg-path
 * Source (GitHub):      https://github.com/jkroso/normalize-svg-path
 * Original author:      Jake Rosoman <jkroso@gmail.com>
 * License:              MIT (see ../LICENSE_MIT.md)
 *
 * Modifications from upstream:
 *   - Ported from CJS to TypeScript ESM.
 *   - Replaced upstream's `require('svg-arc-to-cubic-bezier')` with an
 *     ESM import from the sibling vendor (../svg-arc-to-cubic-bezier).
 *     This sidesteps the long-standing webpack CJS-consumes-ESM interop
 *     bug that motivated this vendor pass.
 *   - Typed input + output as `PathSegment[]` (from sibling vendor
 *     ../parse-svg-path).
 *   - Otherwise the conversion logic (state machine, control-point
 *     reflection, quadratic→cubic conversion) is byte-identical.
 *
 * Converts every segment in an absolute-coords SVG path to a cubic Bézier.
 * After running, every segment is `['C', x1, y1, x2, y2, x, y]`.
 * Lines become degenerate Béziers; arcs are sampled per-90° via
 * `arcToBezier`; quadratics convert exactly to cubics; S/T smooth
 * curves expand by reflecting the previous control point.
 *
 * Input MUST be already absolute (run through `absSvgPath` first).
 */

import type { PathSegment } from "../parse-svg-path";
import { arcToBezier } from "../svg-arc-to-cubic-bezier";

function line(x1: number, y1: number, x2: number, y2: number): PathSegment {
  return ["C", x1, y1, x2, y2, x2, y2];
}

function quadratic(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
): PathSegment {
  return [
    "C",
    x1 / 3 + (2 / 3) * cx,
    y1 / 3 + (2 / 3) * cy,
    x2 / 3 + (2 / 3) * cx,
    y2 / 3 + (2 / 3) * cy,
    x2,
    y2,
  ];
}

export function normalizeSvgPath(path: PathSegment[]): PathSegment[] {
  // init state
  let prev: string | undefined;
  const result: PathSegment[] = [];
  let bezierX = 0;
  let bezierY = 0;
  let startX = 0;
  let startY = 0;
  let quadX: number | null = null;
  let quadY: number | null = null;
  let x = 0;
  let y = 0;

  for (let i = 0, len = path.length; i < len; i++) {
    let seg = path[i];
    const command = seg[0];

    switch (command) {
      case "M":
        startX = seg[1] as number;
        startY = seg[2] as number;
        break;
      case "A": {
        const curves = arcToBezier({
          px: x,
          py: y,
          cx: seg[6] as number,
          cy: seg[7] as number,
          rx: seg[1] as number,
          ry: seg[2] as number,
          xAxisRotation: seg[3] as number,
          largeArcFlag: seg[4] as number,
          sweepFlag: seg[5] as number,
        });

        // null-curves (rx === 0 or ry === 0, or zero-length arc)
        if (!curves.length) continue;

        for (let j = 0; j < curves.length; j++) {
          const c = curves[j];
          seg = ["C", c.x1, c.y1, c.x2, c.y2, c.x, c.y];
          if (j < curves.length - 1) result.push(seg);
        }
        break;
      }
      case "S": {
        // default control point
        let cx = x;
        let cy = y;
        if (prev === "C" || prev === "S") {
          cx += cx - bezierX; // reflect the previous command's control
          cy += cy - bezierY; // point relative to the current point
        }
        seg = [
          "C",
          cx,
          cy,
          seg[1] as number,
          seg[2] as number,
          seg[3] as number,
          seg[4] as number,
        ];
        break;
      }
      case "T":
        if (prev === "Q" || prev === "T") {
          quadX = x * 2 - (quadX as number); // as with 'S' reflect previous control point
          quadY = y * 2 - (quadY as number);
        } else {
          quadX = x;
          quadY = y;
        }
        seg = quadratic(x, y, quadX, quadY, seg[1] as number, seg[2] as number);
        break;
      case "Q":
        quadX = seg[1] as number;
        quadY = seg[2] as number;
        seg = quadratic(
          x,
          y,
          seg[1] as number,
          seg[2] as number,
          seg[3] as number,
          seg[4] as number,
        );
        break;
      case "L":
        seg = line(x, y, seg[1] as number, seg[2] as number);
        break;
      case "H":
        seg = line(x, y, seg[1] as number, y);
        break;
      case "V":
        seg = line(x, y, x, seg[1] as number);
        break;
      case "Z":
        seg = line(x, y, startX, startY);
        break;
    }

    // update state
    prev = command;
    x = seg[seg.length - 2] as number;
    y = seg[seg.length - 1] as number;
    if (seg.length > 4) {
      bezierX = seg[seg.length - 4] as number;
      bezierY = seg[seg.length - 3] as number;
    } else {
      bezierX = x;
      bezierY = y;
    }
    result.push(seg);
  }

  return result;
}
