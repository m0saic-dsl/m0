/**
 * svg-arc-to-cubic-bezier (vendored)
 *
 * Original npm package: svg-arc-to-cubic-bezier
 * Version copied:       3.2.0
 * Copy date:            2026-05-31
 * Source (npm):         https://www.npmjs.com/package/svg-arc-to-cubic-bezier
 * Source (GitHub):      https://github.com/colinmeinke/svg-arc-to-cubic-bezier
 * Original author:      Colin Meinke <hello@colinmeinke.com>
 * License:              MIT (see ../LICENSE_MIT.md)
 *
 * Modifications from upstream:
 *   - Ported from ES5-style Babel output (with helper IIFEs for
 *     destructuring) to clean TypeScript ESM. Logic + math identical.
 *   - Added types for inputs / outputs (`ArcToBezierArgs`, `CubicBezier`).
 *   - Renamed `arcToBezier` exported name preserved.
 *
 * Also: vendoring this directly sidesteps the long-standing webpack
 * CJS-consumes-ESM interop bug — see commit history for context — that
 * presents as "arcToCurve is not a function" at runtime when the
 * package is consumed via `require()` from a transpiled-CJS dependency.
 * With this vendor, `normalize-svg-path` (also vendored) calls
 * `arcToBezier` directly via ESM import and the issue goes away.
 *
 * Converts an SVG arc command into a sequence of cubic Bézier curves.
 * Algorithm: standard SVG arc → ellipse-center → unit-arc approximation,
 * sampling at most one Bézier per 90° of arc sweep.
 */

const TAU = Math.PI * 2;

export type ArcToBezierArgs = {
  /** Start point x. */
  px: number;
  /** Start point y. */
  py: number;
  /** End point x. */
  cx: number;
  /** End point y. */
  cy: number;
  /** Ellipse x-radius. */
  rx: number;
  /** Ellipse y-radius. */
  ry: number;
  /** Ellipse rotation in degrees. Default 0. */
  xAxisRotation?: number;
  /** SVG arc large-arc flag (0 / 1). Default 0. */
  largeArcFlag?: 0 | 1 | number;
  /** SVG arc sweep flag (0 / 1). Default 0. */
  sweepFlag?: 0 | 1 | number;
};

export type CubicBezier = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
};

type Point = { x: number; y: number };

function mapToEllipse(
  p: Point,
  rx: number,
  ry: number,
  cosphi: number,
  sinphi: number,
  centerx: number,
  centery: number,
): Point {
  let x = p.x * rx;
  let y = p.y * ry;

  const xp = cosphi * x - sinphi * y;
  const yp = sinphi * x + cosphi * y;

  return { x: xp + centerx, y: yp + centery };
}

function approxUnitArc(ang1: number, ang2: number): [Point, Point, Point] {
  // If 90 degree circular arc, use a constant
  // as derived from http://spencermortensen.com/articles/bezier-circle
  const a =
    ang2 === 1.5707963267948966
      ? 0.551915024494
      : ang2 === -1.5707963267948966
        ? -0.551915024494
        : (4 / 3) * Math.tan(ang2 / 4);

  const x1 = Math.cos(ang1);
  const y1 = Math.sin(ang1);
  const x2 = Math.cos(ang1 + ang2);
  const y2 = Math.sin(ang1 + ang2);

  return [
    { x: x1 - y1 * a, y: y1 + x1 * a },
    { x: x2 + y2 * a, y: y2 - x2 * a },
    { x: x2, y: y2 },
  ];
}

function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const sign = ux * vy - uy * vx < 0 ? -1 : 1;
  let dot = ux * vx + uy * vy;

  if (dot > 1) dot = 1;
  if (dot < -1) dot = -1;

  return sign * Math.acos(dot);
}

function getArcCenter(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  largeArcFlag: number,
  sweepFlag: number,
  sinphi: number,
  cosphi: number,
  pxp: number,
  pyp: number,
): [number, number, number, number] {
  const rxsq = Math.pow(rx, 2);
  const rysq = Math.pow(ry, 2);
  const pxpsq = Math.pow(pxp, 2);
  const pypsq = Math.pow(pyp, 2);

  let radicant = rxsq * rysq - rxsq * pypsq - rysq * pxpsq;
  if (radicant < 0) radicant = 0;

  radicant /= rxsq * pypsq + rysq * pxpsq;
  radicant = Math.sqrt(radicant) * (largeArcFlag === sweepFlag ? -1 : 1);

  const centerxp = (radicant * rx) / ry * pyp;
  const centeryp = (radicant * -ry) / rx * pxp;

  const centerx = cosphi * centerxp - sinphi * centeryp + (px + cx) / 2;
  const centery = sinphi * centerxp + cosphi * centeryp + (py + cy) / 2;

  const vx1 = (pxp - centerxp) / rx;
  const vy1 = (pyp - centeryp) / ry;
  const vx2 = (-pxp - centerxp) / rx;
  const vy2 = (-pyp - centeryp) / ry;

  const ang1 = vectorAngle(1, 0, vx1, vy1);
  let ang2 = vectorAngle(vx1, vy1, vx2, vy2);

  if (sweepFlag === 0 && ang2 > 0) ang2 -= TAU;
  if (sweepFlag === 1 && ang2 < 0) ang2 += TAU;

  return [centerx, centery, ang1, ang2];
}

export function arcToBezier(args: ArcToBezierArgs): CubicBezier[] {
  const {
    px,
    py,
    cx,
    cy,
  } = args;
  let { rx, ry } = args;
  const xAxisRotation = args.xAxisRotation ?? 0;
  const largeArcFlag = args.largeArcFlag ?? 0;
  const sweepFlag = args.sweepFlag ?? 0;

  const curves: CubicBezier[] = [];

  if (rx === 0 || ry === 0) return [];

  const sinphi = Math.sin((xAxisRotation * TAU) / 360);
  const cosphi = Math.cos((xAxisRotation * TAU) / 360);

  const pxp = (cosphi * (px - cx)) / 2 + (sinphi * (py - cy)) / 2;
  const pyp = (-sinphi * (px - cx)) / 2 + (cosphi * (py - cy)) / 2;

  if (pxp === 0 && pyp === 0) return [];

  rx = Math.abs(rx);
  ry = Math.abs(ry);

  const lambda =
    Math.pow(pxp, 2) / Math.pow(rx, 2) + Math.pow(pyp, 2) / Math.pow(ry, 2);

  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }

  const [centerx, centery, ang1, ang2Initial] = getArcCenter(
    px,
    py,
    cx,
    cy,
    rx,
    ry,
    largeArcFlag,
    sweepFlag,
    sinphi,
    cosphi,
    pxp,
    pyp,
  );

  // If 'ang2' == 90.0000000001, then `ratio` will evaluate to
  // 1.0000000001. This causes `segments` to be greater than one, which is
  // an unnecessary split, and adds extra points to the Bézier curve. To
  // alleviate this issue, we round to 1.0 when the ratio is close to 1.0.
  let ratio = Math.abs(ang2Initial) / (TAU / 4);
  if (Math.abs(1.0 - ratio) < 0.0000001) ratio = 1.0;

  const segments = Math.max(Math.ceil(ratio), 1);

  const ang2 = ang2Initial / segments;

  let runningAng1 = ang1;
  for (let i = 0; i < segments; i++) {
    const triple = approxUnitArc(runningAng1, ang2);
    const p1 = mapToEllipse(triple[0], rx, ry, cosphi, sinphi, centerx, centery);
    const p2 = mapToEllipse(triple[1], rx, ry, cosphi, sinphi, centerx, centery);
    const pEnd = mapToEllipse(triple[2], rx, ry, cosphi, sinphi, centerx, centery);
    curves.push({
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y,
      x: pEnd.x,
      y: pEnd.y,
    });
    runningAng1 += ang2;
  }

  return curves;
}
