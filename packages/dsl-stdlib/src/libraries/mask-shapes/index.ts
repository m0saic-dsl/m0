/**
 * Primitive SVG mask shapes for `M0cFile.masks` entries.
 *
 * The .m0c masks field accepts entries of shape
 * `{ localPath: string; bounds: { x, y, width, height } }` — SVG path
 * data in local coordinates plus the design-space bounding box. These
 * helpers return `M0cMaskEntry` (the canonical type from
 * `@m0saic/dsl-file-formats`) for the common cases (circle, rounded-
 * rect, pill) so agents (and any caller) don't have to re-derive SVG
 * arc syntax every time.
 *
 * Pass the result straight to
 * `serializeM0cFile({ masks: { [stableKey]: circleMask(40) } })`.
 */

import type { M0cMaskEntry } from "@m0saic/dsl-file-formats";

/** Re-export so callers can pull the mask type from the same module. */
export type { M0cMaskEntry };

/**
 * Circular (or oval-when-non-square) mask filling the given bounds.
 *
 * Two-arc path that starts at `(width/2, 0)`, sweeps over to
 * `(width/2, height)` via the right side, then back to start via the
 * left side. Closes with `Z`. For `width === height`, that's a perfect
 * circle; for unequal dimensions, an axis-aligned ellipse.
 *
 * @example minimal — 40×40 circle avatar
 *   const m = circleMask(40);
 *   // → { localPath: "M 20 0 A 20 20 0 1 0 20 40 A 20 20 0 1 0 20 0 Z",
 *   //     bounds: { x: 0, y: 0, width: 40, height: 40 } }
 */
export function circleMask(width: number, height: number = width): M0cMaskEntry {
  if (!isPositive(width) || !isPositive(height)) {
    throw new Error(
      `circleMask: width and height must be positive integers, got ${width}×${height}`,
    );
  }
  const rx = width / 2;
  const ry = height / 2;
  const cx = rx;
  // SVG arcs: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  const localPath = [
    `M ${cx} 0`,
    `A ${rx} ${ry} 0 1 0 ${cx} ${height}`,
    `A ${rx} ${ry} 0 1 0 ${cx} 0`,
    "Z",
  ].join(" ");
  return {
    localPath,
    bounds: { x: 0, y: 0, width, height },
  };
}

/**
 * Rounded-rectangle mask. `radius` clamps to half the shorter side so a
 * radius >= min(w,h)/2 produces a pill (see {@link pillMask} for the
 * explicit form).
 *
 * Path order: top-left → top-right (with top corner arc) → bottom-right
 * (with right corner arc) → bottom-left (bottom corner arc) → top-left
 * (left corner arc) → close.
 *
 * @example minimal — 200×60 rounded card with 12px corners
 *   const m = roundedRectMask(200, 60, 12);
 */
export function roundedRectMask(
  width: number,
  height: number,
  radius: number,
): M0cMaskEntry {
  if (!isPositive(width) || !isPositive(height)) {
    throw new Error(
      `roundedRectMask: width and height must be positive integers, got ${width}×${height}`,
    );
  }
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error(`roundedRectMask: radius must be >= 0, got ${radius}`);
  }
  const r = Math.min(radius, width / 2, height / 2);
  if (r === 0) {
    // Square rect — single Z-close M+L path.
    return {
      localPath: `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`,
      bounds: { x: 0, y: 0, width, height },
    };
  }
  const localPath = [
    `M ${r} 0`,
    `L ${width - r} 0`,
    `A ${r} ${r} 0 0 1 ${width} ${r}`,
    `L ${width} ${height - r}`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `L ${r} ${height}`,
    `A ${r} ${r} 0 0 1 0 ${height - r}`,
    `L 0 ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
  return {
    localPath,
    bounds: { x: 0, y: 0, width, height },
  };
}

/**
 * Pill mask — rounded rect with corner radius = min(width, height) / 2.
 * Produces a circle when `width === height`, a stadium/pill otherwise.
 *
 * Convenience wrapper over {@link roundedRectMask}.
 */
export function pillMask(width: number, height: number): M0cMaskEntry {
  return roundedRectMask(width, height, Math.min(width, height) / 2);
}

// Re-export removed `MaskShape` alias would go here if back-compat
// were needed — but the helpers were just added in this release, so
// no callers depend on the old name. Use `M0cMaskEntry` directly.

function isPositive(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}
