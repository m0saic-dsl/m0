import type { M0Span } from "../types";

export type M0ValidationErrorKind = "SYNTAX" | "ANTIPATTERN" | "SEMANTIC";

/**
 * Single source of truth: every code must declare its kind + default message.
 * Adding a new code = add a new entry here.
 */
export const M0_VALIDATION_ERROR_SPECS = {
  // ────────────────────────────────────────────────────────────
  // Syntax / structural validity
  // ────────────────────────────────────────────────────────────

  OVERLAY_CHAIN: {
    kind: "SYNTAX",
    defaultMessage: "Overlay chains are not allowed; use nested overlays.",
  },

  INVALID_CHAR: {
    kind: "SYNTAX",
    defaultMessage: "Invalid character in m0 string.",
  },

  UNBALANCED: {
    kind: "SYNTAX",
    defaultMessage: "Unbalanced brackets or braces in m0 string.",
  },

  TOKEN_RULE: {
    kind: "SYNTAX",
    defaultMessage: "Invalid token sequence for m0 grammar.",
  },

  TOKEN_COUNT: {
    kind: "SYNTAX",
    defaultMessage: "Classifier child count does not match required count.",
  },

  ILLEGAL_ONE_SPLIT: {
    kind: "SYNTAX",
    defaultMessage: "Classifier token '1(' or '1[' is not allowed.",
  },

  INVALID_EMPTY: {
    kind: "SYNTAX",
    defaultMessage: "Invalid empty/degenerate m0 string.",
  },

  // ────────────────────────────────────────────────────────────
  // Antipattern / engine-policy rejects (syntactically valid DSL)
  // ────────────────────────────────────────────────────────────

  /**
   * Syntactically fine, but engine rejects because passthrough has no claimant.
   * Example: 2(1,0), 3(1,1,0), nested trailing 0, etc.
   */
  PASSTHROUGH_TO_NOTHING: {
    kind: "ANTIPATTERN",
    defaultMessage:
      "Passthrough ('0' / '>') cannot be the last child; it must donate to a later claimant.",
  },

  /**
   * Syntactically valid, but no leaf tile '1' exists anywhere in the layout.
   * The layout is all null ('-') and/or passthrough ('0') — nothing to render.
   */
  NO_SOURCES: {
    kind: "ANTIPATTERN",
    defaultMessage:
      "Layout contains no source tiles — at least one '1' / 'F' is required.",
  },

  /**
   * An overlay body ({...}) contains no leaf '1' — nothing to render in that layer.
   */
  ZERO_SOURCE_OVERLAY: {
    kind: "SEMANTIC",
    defaultMessage:
      "Overlay body must contain at least one source tile ('1' / 'F').",
  },

  /**
   * Syntactically fine, but the split produces a 0-size frame at the given
   * canvas dimensions (more children than available pixels along the axis).
   */
  SPLIT_EXCEEDS_AXIS: {
    kind: "ANTIPATTERN",
    defaultMessage:
      "Split produced a 0-size frame (infeasible at given width/height).",
  },

} as const satisfies Record<
  string,
  { kind: M0ValidationErrorKind; defaultMessage: string }
>;

export type M0ValidationErrorCode =
  keyof typeof M0_VALIDATION_ERROR_SPECS;

export type M0ValidationError = {
  code: M0ValidationErrorCode;
  kind: M0ValidationErrorKind;
  message: string;
  span: M0Span | null;
  position: number | null;

  /**
   * Optional structured payload for UI/debugging.
   * Keep it open-ended but stable.
   */
  details?: Record<string, unknown>;
};

export type M0ValidationResult =
  | { ok: true }
  | { ok: false; error: M0ValidationError };

/**
 * Helper to create a consistent error object.
 * Always uses the canonical kind + default message unless overridden.
 */
export function makeValidationError(args: {
  code: M0ValidationErrorCode;
  message: string;
  span?: M0Span | null;
  position?: number | null;
  details?: Record<string, unknown>;
}): M0ValidationError {
  const spec = M0_VALIDATION_ERROR_SPECS[args.code];
  return {
    code: args.code,
    kind: spec.kind,
    message: args.message ?? spec.defaultMessage,
    span: args.span ?? null,
    position: args.position ?? null,
    details: args.details,
  };
}
