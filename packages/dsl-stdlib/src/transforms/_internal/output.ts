import { toCanonicalM0String, toPrettyM0String, validateM0String } from "@m0saic/dsl";

export type OpOutputOptions = {
  output?: "canonical" | "pretty";
};

export function canonicalizeInputM0(input: string): string {
  return toCanonicalM0String(input).replace(/\s+/g, "");
}

/**
 * Canonicalize and validate a m0 input string, throwing on invalid input.
 * Returns the canonical string on success.
 */
export function validateInputOrThrow(opName: string, m0: string): string {
  const canonical = toCanonicalM0String(m0);
  const validation = validateM0String(canonical);
  if ("error" in validation) {
    const err = validation.error;
    throw new Error(
      `${opName}: invalid input m0 (${err.code ?? "UNKNOWN"}) at ${
        err.position ?? "?"
      }`,
    );
  }
  return canonical;
}

/**
 * Assert that a span has valid bounds within a canonical string.
 *
 * Throws with a consistent error message if the span is out of bounds
 * or has invalid shape (start >= end, negative start, etc.).
 */
export function assertValidSpan(
  opName: string,
  canonical: string,
  span: { start: number; end: number },
): void {
  if (span.start < 0 || span.end > canonical.length || span.start >= span.end) {
    throw new Error(
      `${opName}: span [${span.start}, ${span.end}) is invalid (string length ${canonical.length})`,
    );
  }
}

/**
 * Assert that a span identifies exactly one rendered frame primitive (`1` / `F`).
 */
export function assertRenderedFrameSpan(
  opName: string,
  canonical: string,
  span: { start: number; end: number },
): void {
  if (span.end - span.start !== 1) {
    throw new Error(
      `${opName}: target span must identify a single primitive (end - start must be 1, got ${span.end - span.start})`,
    );
  }

  const target = canonical[span.start];
  if (target !== "1" && target !== "F") {
    throw new Error(
      `${opName}: target span must identify a rendered frame primitive (1/F), got '${target}'`,
    );
  }
}

/**
 * Canonicalize and validate the transform result, throwing on invalid output.
 */
export function finalizeM0Output(
  opName: string,
  result: string,
  opts?: OpOutputOptions,
): string {
  const canonical = toCanonicalM0String(result);
  const validation = validateM0String(canonical);
  if ("error" in validation) {
    const code = validation.error.code;
    const pos = validation.error.position;
    throw new Error(
      `${opName}: produced invalid m0 (${code})${pos != null ? ` at ${pos}` : ""}`,
    );
  }

  return opts?.output === "pretty"
    ? toPrettyM0String(canonical)
    : canonical;
}
