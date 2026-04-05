import type { M0String, M0ValidationError } from "@m0saic/dsl";
import {
  toCanonicalM0String,
  validateM0String,
} from "@m0saic/dsl";

/** Result type for {@link tryM0String}. */
export type M0StringResult =
  | { ok: true; value: M0String }
  | { ok: false; error: M0ValidationError };

/**
 * Try to construct a canonical, validated {@link M0String}.
 *
 * Returns a discriminated union: `{ ok: true, value }` on success,
 * `{ ok: false, error }` on validation failure. Never throws.
 *
 * Pipeline:
 *  1. Canonicalize (strip whitespace, `F` → `1`, `>` → `0`)
 *  2. Validate canonical result (syntax + semantic invariants)
 *
 * Does NOT rewrite overlay chains (`}{`). If the input may contain
 * overlay chains, callers must explicitly apply `rewriteOverlayChains`
 * before calling this function.
 */
export function tryM0String(raw: string): M0StringResult {
  const canonical = toCanonicalM0String(raw);
  const res = validateM0String(canonical);
  if (!res.ok && "error" in res) {
    return { ok: false, error: res.error };
  }
  if (!res.ok) {
    return { ok: false, error: { code: "UNKNOWN" as any, kind: "SYNTAX" as any, message: "Unknown validation error", span: null, position: null } };
  }
  return { ok: true, value: canonical as M0String };
}

/**
 * Construct a canonical, validated {@link M0String}, or throw.
 *
 * Use this when the input is expected to be valid (e.g., builder output,
 * known-good constants). For user input or untrusted strings, prefer
 * {@link tryM0String} which returns a Result instead of throwing.
 *
 * Pipeline:
 *  1. Canonicalize (strip whitespace, `F` → `1`, `>` → `0`)
 *  2. Validate canonical result (syntax + semantic invariants)
 *
 * Does NOT rewrite overlay chains (`}{`). If the input may contain
 * overlay chains, callers must explicitly apply `rewriteOverlayChains`
 * before calling this function.
 *
 * @param raw     - Raw DSL string (may contain whitespace and aliases,
 *                  but must NOT contain overlay chains `}{`).
 * @param context - Label included in thrown errors for debuggability.
 * @returns A branded, canonical `M0String`.
 * @throws {Error} If the input is not a valid m0 string.
 */
export function toM0String(
  raw: string,
  context = "toM0String",
): M0String {
  const canonical = toCanonicalM0String(raw);
  const res = validateM0String(canonical);
  if (!res.ok) {
    const err = "error" in res ? res.error : "Unknown validation error";
    throw new Error(
      `${context}: invalid m0\n${formatValidationError(err)}\n\nm0: ${canonical}`,
    );
  }
  return canonical as M0String;
}

function formatValidationError(err: unknown): string {
  try {
    return typeof err === "string" ? err : JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}
