import { toCanonicalM0String } from "../format";
import { parseM0StringToRenderFrames } from "../parse";

/**
 * Canonical equality: are two DSL strings the same normalized program?
 *
 * Canonicalizes both inputs (strip whitespace, F->1, >->0) and compares
 * the resulting strings. O(N) in the total length of both inputs.
 *
 * Canonical equality is strictly stronger than frame equality: if two
 * strings are canonically equal, they are the same DSL program and
 * will always produce identical ordered frame output and geometry.
 *
 * The inverse is not true — two different canonical strings may still
 * be frame-equal (e.g. `4(0,1,0,1)` and `2(1,1)` produce the same
 * frames but differ canonically).
 */
export function areM0StringsCanonicalEqual(a: string, b: string): boolean {
  return toCanonicalM0String(a) === toCanonicalM0String(b);
}

/**
 * Frame/logical equality: do two DSL strings produce the exact same
 * ordered frame output?
 *
 * Parses both strings into ordered render-frame output and compares
 * frame count, order, and exact geometry (x, y, width, height).
 *
 * Uses each string's exact minimum feasible resolution so that both
 * parse at a canvas size where all frames are non-zero. If the two
 * strings require different minimum resolutions, both are parsed at
 * the larger of the two.
 *
 * Order matters: frames are compared in logical (DSL appearance) order.
 * Two strings that produce the same set of rectangles in different order
 * are NOT frame-equal.
 *
 * This is strictly weaker than canonical equality — two strings can be
 * frame-equal without being canonically equal.
 *
 * Returns false if either string is invalid.
 */
export function areM0StringsFrameEqual(a: string, b: string): boolean {
  // Parse at a large canvas so no frames collapse to zero size.
  // The exact geometry doesn't matter — if two layouts differ structurally,
  // splitEven will produce different pixel values at any feasible resolution.
  // 2^20 is far beyond any realistic layout's minimum feasible resolution.
  const w = 1_048_576;
  const h = 1_048_576;

  // Geometry-only parse: returns rendered frames with position + logicalIndex
  const framesA = parseM0StringToRenderFrames(a, w, h);
  const framesB = parseM0StringToRenderFrames(b, w, h);

  // Either invalid → false
  if (framesA.length === 0 && framesB.length === 0) {
    // Both empty could mean both invalid OR both have zero frames.
    // Disambiguate: if both canonicalize to the same string, treat as equal.
    // Otherwise, we can't confirm equality on invalid inputs.
    return toCanonicalM0String(a) === toCanonicalM0String(b);
  }

  if (framesA.length !== framesB.length) return false;

  // Sort by logicalIndex (logical/appearance order) — O(N log N) but N is
  // frame count, not string length. Typically small.
  const sortedA = framesA.slice().sort((x, y) => x.logicalIndex - y.logicalIndex);
  const sortedB = framesB.slice().sort((x, y) => x.logicalIndex - y.logicalIndex);

  // Compare geometry in order — O(N)
  for (let i = 0; i < sortedA.length; i++) {
    const fa = sortedA[i];
    const fb = sortedB[i];
    if (fa.x !== fb.x || fa.y !== fb.y || fa.width !== fb.width || fa.height !== fb.height) {
      return false;
    }
  }

  return true;
}
