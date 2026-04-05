import {
  M0_VALIDATION_ERROR_SPECS,
  makeValidationError,
  type M0ValidationErrorCode,
  type M0ValidationErrorKind,
} from "./errors";

// ─────────────────────────────────────────────────────────────
// Error spec integrity
// ─────────────────────────────────────────────────────────────

describe("M0_VALIDATION_ERROR_SPECS", () => {
  const codes = Object.keys(M0_VALIDATION_ERROR_SPECS) as M0ValidationErrorCode[];

  it("has exactly 11 error codes", () => {
    expect(codes.length).toBe(11);
  });

  it("every code has a valid kind", () => {
    const validKinds: M0ValidationErrorKind[] = ["SYNTAX", "ANTIPATTERN", "SEMANTIC"];
    for (const code of codes) {
      expect(validKinds).toContain(M0_VALIDATION_ERROR_SPECS[code].kind);
    }
  });

  it("every code has a non-empty defaultMessage", () => {
    for (const code of codes) {
      const msg = M0_VALIDATION_ERROR_SPECS[code].defaultMessage;
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("contains all expected codes", () => {
    const expected: M0ValidationErrorCode[] = [
      "OVERLAY_CHAIN",
      "INVALID_CHAR",
      "UNBALANCED",
      "TOKEN_RULE",
      "TOKEN_COUNT",
      "ILLEGAL_ONE_SPLIT",
      "INVALID_EMPTY",
      "PASSTHROUGH_TO_NOTHING",
      "NO_SOURCES",
      "ZERO_SOURCE_OVERLAY",
      "SPLIT_EXCEEDS_AXIS",
    ];
    expect(codes.sort()).toEqual(expected.sort());
  });
});

// ─────────────────────────────────────────────────────────────
// makeValidationError
// ─────────────────────────────────────────────────────────────

describe("makeValidationError", () => {
  it("produces an error with the correct code and kind", () => {
    const err = makeValidationError({ code: "UNBALANCED", message: "test" });
    expect(err.code).toBe("UNBALANCED");
    expect(err.kind).toBe("SYNTAX");
    expect(err.message).toBe("test");
  });

  it("defaults span and position to null", () => {
    const err = makeValidationError({ code: "NO_SOURCES", message: "x" });
    expect(err.span).toBeNull();
    expect(err.position).toBeNull();
  });

  it("preserves span and position when provided", () => {
    const err = makeValidationError({
      code: "INVALID_CHAR",
      message: "bad char",
      span: { start: 3, end: 4 },
      position: 3,
    });
    expect(err.span).toEqual({ start: 3, end: 4 });
    expect(err.position).toBe(3);
  });

  it("preserves details when provided", () => {
    const err = makeValidationError({
      code: "TOKEN_COUNT",
      message: "mismatch",
      details: { expected: 3, actual: 2 },
    });
    expect(err.details).toEqual({ expected: 3, actual: 2 });
  });

  it("omits details when not provided", () => {
    const err = makeValidationError({ code: "OVERLAY_CHAIN", message: "x" });
    expect(err.details).toBeUndefined();
  });
});
