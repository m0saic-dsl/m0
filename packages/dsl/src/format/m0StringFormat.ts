/**
 * Convert a m0 string to canonical form (F→1, >→0).
 * Safe for strings already in canonical form (idempotent).
 */
export function toCanonicalM0String(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(/[F>]/g, (ch) => (ch === "F" ? "1" : "0"));
}
/**
 * Convert a m0 string to pretty form (1→F, 0→>).
 *
 * Notes:
 * - This is intended as a *presentation* transform.
 * - It does NOT preserve whitespace/formatting; callers should format separately if desired.
 * - Replacements are limited to delimiter-bounded `0`/`1` tokens so numeric counts like `10(...)`
 *   remain intact (the `0` inside `10` is not touched).
 * - Idempotent for inputs already using F/> for leaf tokens.
 *
 * Regex boundary logic:
 * - The delimiter set is `[,\[\]\(\)\{\}\-]` — structural tokens only.
 * - Digits are intentionally excluded as delimiters. A `0` or `1` adjacent to
 *   another digit (e.g., the `0` in `10` or the `1` in `21`) is part of a
 *   multi-digit classifier count and must NOT be converted.
 * - This is safe because in valid canonical DSL, a leaf `0` or `1` is always
 *   bounded by structural delimiters or string boundaries, never by digits.
 */
export function toPrettyM0String(s: string): string {
  return s
    .replace(/\s+/g, "")
    .replace(
      /(^|[,\[\]\(\)\{\}\-])([01])(?=$|[,\[\]\(\)\{\}\-])/g,
      (_, pre: string, ch: string) => pre + (ch === "1" ? "F" : ">"),
    );
}
