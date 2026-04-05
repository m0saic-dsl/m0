/**
 * Large nominal canvas used when parsing only for structural metadata
 * (e.g. stableKey/span lookup), not for real rendering.
 *
 * Why this exists:
 * - Some DSL parser/editor-frame helpers require width/height inputs even when
 *   the caller only needs structural identity metadata.
 * - Using a very large square canvas minimizes the chance of precision-related
 *   parse failures for deeply split layouts.
 * - This value is not a rendering target and should not be interpreted as an
 *   output resolution.
 */
export const SAFE_PARSE_CANVAS = 1_000_000;
