import type { M0Span, M0Warning, M0WarningCode } from "../types";

/**
 * Single source of truth for warning specs.
 * Adding a new warning = add the code to M0WarningCode in types.ts
 * and a spec entry here.
 */
export const M0_WARNING_SPECS: Record<M0WarningCode, { defaultMessage: string }> = {
  PRECISION_EXCEEDS_NORM: {
    defaultMessage:
      "Precision exceeds norm. Layout may require a larger canvas to render correctly.",
  },
};

/**
 * Helper to create a consistent warning object.
 * Uses the canonical default message unless overridden.
 */
export function makeWarning(args: {
  code: M0WarningCode;
  message?: string;
  span?: M0Span | null;
  position?: number | null;
  details?: Record<string, unknown>;
}): M0Warning {
  const spec = M0_WARNING_SPECS[args.code];
  return {
    severity: "warning",
    code: args.code,
    message: args.message ?? spec.defaultMessage,
    span: args.span ?? null,
    position: args.position ?? null,
    details: args.details,
  };
}

