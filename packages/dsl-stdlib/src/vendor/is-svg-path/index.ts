/**
 * is-svg-path (vendored)
 *
 * Original npm package: is-svg-path
 * Version copied:       1.0.2
 * Copy date:            2026-05-31
 * Source (npm):         https://www.npmjs.com/package/is-svg-path
 * Source (GitHub):      https://github.com/dy/is-svg-path
 * Original author:      Dima Yv <dfcreative@gmail.com>
 * License:              MIT (see ../LICENSE_MIT.md)
 *
 * Modifications from upstream:
 *   - Ported from CJS (`module.exports = ...`) to TypeScript ESM.
 *   - Typed the input as `unknown` to make the runtime type-check
 *     explicit at the call boundary.
 *   - Otherwise the regex + logic are byte-identical to upstream.
 *
 * Detects whether a string looks like an SVG path `d` attribute.
 * Spec reference: https://www.w3.org/TR/SVG/paths.html#PathDataBNF
 */

export function isSvgPath(str: unknown): str is string {
  if (typeof str !== "string") return false;

  const s = str.trim();

  if (
    /^[mzlhvcsqta]\s*[-+.0-9][^mlhvzcsqta]+/i.test(s) &&
    /[\dz]$/i.test(s) &&
    s.length > 4
  ) {
    return true;
  }

  return false;
}
