import { toCanonicalM0String, validateM0String } from "@m0saic/dsl";

// Single gate for the m0 layout string on every official file-format API.
//
// Contract (shared by all serialize* / parse* entry points):
//   - INPUT may be canonical OR pretty (expanded) DSL — both are valid, both
//     are accepted.
//   - OUTPUT is ALWAYS canonical, so no .m0 / .m0c / .m0p file (and no parsed
//     in-memory record) ever carries pretty-form DSL out of these methods.
//   - INVALID m0 (syntax garbage, unbalanced brackets, empty, …) can never be
//     serialized or parsed — it throws here, at the boundary, instead of
//     silently round-tripping a broken layout.
//
// `toCanonicalM0String` only normalizes whitespace/aliases; it does NOT reject
// invalid input. The `validateM0String` pass is what actually closes the gap.

/**
 * Canonicalize and validate an m0 layout string for a file-format API.
 * Returns the canonical form. Throws (prefixed with `label`) when the string
 * is empty or fails `@m0saic/dsl` validation.
 *
 * @param label        the calling function name, used as the error prefix
 * @param raw          the caller-supplied m0 (canonical or pretty)
 * @param emptyMessage the exact message to throw when the string is empty —
 *                     kept caller-specific so existing contracts/tests hold
 */
export function canonicalizeAndValidateM0(
  label: string,
  raw: string,
  emptyMessage: string,
): string {
  const m0 = toCanonicalM0String(raw);
  if (!m0) {
    throw new Error(emptyMessage);
  }
  const res = validateM0String(m0);
  if (!res.ok) {
    const e = res.error;
    const where = e.position != null ? ` at position ${e.position}` : "";
    throw new Error(
      `${label}: invalid m0 layout${where} — ${e.message} [${e.kind}/${e.code}]`,
    );
  }
  return m0;
}
