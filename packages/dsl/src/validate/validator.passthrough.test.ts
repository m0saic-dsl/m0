// validator.passthrough.test.ts
import { isValidM0String, validateM0String } from "./m0StringValidator";
import type {
  M0ValidationErrorCode,
  M0ValidationErrorKind,
  M0ValidationResult,
} from "../errors";

// ─────────────────────────────────────────────────────────────
// Assertion helpers (type-narrowing + stronger contracts)
// ─────────────────────────────────────────────────────────────

type InvalidWithPosSpan = {
  ok: false;
  error: {
    code: M0ValidationErrorCode;
    kind: M0ValidationErrorKind;
    message: string;
    position: number;
    span: { start: number; end: number };
  };
};

function expectInvalid(
  result: M0ValidationResult
): asserts result is InvalidWithPosSpan {
  expect(result.ok).toBe(false);
  if (!("error" in result)) throw new Error("Expected ok:false");
  const err = result.error;

  // kind is mandatory now
  expect(err.kind).toBeDefined();
  expect(["SYNTAX", "ANTIPATTERN", "SEMANTIC"]).toContain(err.kind);

  // These are optional in the public type, but the engine validator SHOULD always set them.
  expect(err.position).toBeDefined();
  expect(typeof err.position).toBe("number");

  expect(err.span).toBeDefined();
  expect(err.span && typeof err.span.start).toBe("number");
  expect(err.span && typeof err.span.end).toBe("number");
}

function expectValid(
  result: M0ValidationResult
): asserts result is { ok: true } {
  expect(result.ok).toBe(true);
  if ("error" in result) throw new Error(`Expected ok:true, got ${result.error.code}`);
}

function expectPosSpanConsistency(result: M0ValidationResult) {
  expectInvalid(result);
  expect(result.error.span.start).toBe(result.error.position);
  expect(result.error.span.end).toBe(result.error.position + 1);
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("passthrough-to-nothing validation", () => {
  describe("invalid cases (trailing passthrough)", () => {
    const invalid = [
      { input: "2(1,0)", desc: "basic trailing 0" },
      { input: "2[1,0]", desc: "vertical split trailing 0" },
      { input: "3(1,1,0)", desc: "three children trailing 0" },
      { input: "2(1,2(1,0))", desc: "nested trailing 0" },

      // canonicalization: '>' => '0', 'F' => '1'
      { input: "2(1,>)", desc: "> alias canonicalizes to 0" },
      { input: "2(F,>)", desc: "F alias + > alias" },
      { input: "2(F,0)", desc: "F alias + trailing 0" },

      // overlay does NOT make trailing passthrough acceptable
      { input: "2(1{1},0)", desc: "overlay elsewhere does not justify trailing 0" },
      { input: "2(1,0{1})", desc: "trailing 0 with overlay is still invalid" },
      { input: "3(1,1,0{1})", desc: "trailing 0 with overlay, three children" },

      // deep mixed nesting
      { input: "2(1,2[1,2(1,0)])", desc: "deep nesting trailing 0" },
    ] as const;

    for (const { input, desc } of invalid) {
      test(`${desc}: "${input}"`, () => {
        expect(isValidM0String(input)).toBe(false);

        const result = validateM0String(input);
        expectInvalid(result);

        expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");
        expect(result.error.message).toContain("Passthrough");
        expectPosSpanConsistency(result);
      });
    }
  });

  describe("valid cases (passthrough not trailing)", () => {
    const valid = [
      { input: "2(0,1)", desc: "passthrough as first child" },
      { input: "3(1,0,1)", desc: "passthrough in middle" },
      { input: "2(1,1)", desc: "no passthrough at all" },
      { input: "2(>,F)", desc: "aliases, passthrough first" },
      { input: "3(0,0,1)", desc: "multiple passthroughs before tile" },

      // overlays on passthrough are allowed when there is a real claimant after
      { input: "2(0{1},1)", desc: "0{...} allowed when not trailing" },

      // nested
      { input: "2(1,2[0,1])", desc: "nested valid passthrough" },
      { input: "2(1,2[0{1},1])", desc: "nested valid passthrough with overlay" },
    ] as const;

    for (const { input, desc } of valid) {
      test(`${desc}: "${input}"`, () => {
        expect(isValidM0String(input)).toBe(true);
        expectValid(validateM0String(input));
      });
    }
  });

  describe("root-level passthrough", () => {
    test("0{1} — root passthrough with overlay", () => {
      const result = validateM0String("0{1}");
      expectInvalid(result);
      expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");
      expect(result.error.position).toBe(0);
      expect(result.error.span).toEqual({ start: 0, end: 1 });
    });

    test("0{2(1,1)} — root passthrough with complex overlay", () => {
      const result = validateM0String("0{2(1,1)}");
      expectInvalid(result);
      expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");
      expect(result.error.position).toBe(0);
    });

    test("2(0{1},1) — non-root passthrough remains valid", () => {
      expectValid(validateM0String("2(0{1},1)"));
    });
  });

  describe("overlay containing trailing passthrough", () => {
    test("1{2(1,0)} — overlay contains invalid split", () => {
      const result = validateM0String("1{2(1,0)}");
      expectInvalid(result);
      expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");
      expectPosSpanConsistency(result);
    });

    test("1{2(0,1)} — overlay contains valid split", () => {
      expectValid(validateM0String("1{2(0,1)}"));
    });
  });

  describe("error position accuracy (explicit indices)", () => {
    test(`2(1,0) — position points to the "0"`, () => {
      const input = "2(1,0)";
      const result = validateM0String(input);

      expectInvalid(result);
      expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");

      // "2(1,0)"
      //  01234
      //        ^ 0 at index 4
      expect(result.error.position).toBe(4);
      expect(result.error.span).toEqual({ start: 4, end: 5 });
    });

    test(`2(1,>) — '>' canonicalizes, but reported position still points to the offending token location`, () => {
      const input = "2(1,>)";
      const result = validateM0String(input);

      expectInvalid(result);
      expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");

      // "2(1,>)"
      //  01234
      //        ^ '>' at index 4
      expect(result.error.position).toBe(4);
      expect(result.error.span).toEqual({ start: 4, end: 5 });
    });

    test("nested: 2(1,2(1,0)) — position points to the inner trailing 0", () => {
      const input = "2(1,2(1,0))";
      const result = validateM0String(input);

      expectInvalid(result);
      expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");

      // "2(1,2(1,0))"
      //  01234567890
      //          ^ 0 at index 8
      expect(result.error.position).toBe(8);
      expect(result.error.span).toEqual({ start: 8, end: 9 });
    });


    describe("non-passthrough baseline validation still behaves", () => {
      test("empty string is invalid", () => {
        expectInvalid(validateM0String(""));
      });

      test("single tile is valid (including aliases)", () => {
        expectValid(validateM0String("1"));
        expectValid(validateM0String("F"));
      });

      test("bare '-' is invalid for engine wrapper", () => {
        const result = validateM0String("-");
        expectInvalid(result);
        expect(result.error.code).toBe("INVALID_EMPTY");
        expectPosSpanConsistency(result);
        expect(result.error.position).toBe(0);
        expect(result.error.span).toEqual({ start: 0, end: 1 });
      });

      test("invalid character produces INVALID_CHAR with span/position", () => {
        const result = validateM0String("2(A,1)");
        expectInvalid(result);
        expect(result.error.code).toBe("INVALID_CHAR");
        expectPosSpanConsistency(result);
        expect(result.error.position).toBe(2); // "2(" then "A"
        expect(result.error.span).toEqual({ start: 2, end: 3 });
      });

      test("literal repro (invalid) — trailing > goes to nothing", () => {
        const input = "2[2(2[2(F,F),F],>),F]";
        expect(isValidM0String(input)).toBe(false);

        const result = validateM0String(input);
        expectInvalid(result);
        expect(result.error.code).toBe("PASSTHROUGH_TO_NOTHING");
      });

    });
  });
});