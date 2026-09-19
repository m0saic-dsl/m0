import {
  CENTER_GUARD_WIDTHS,
  EAN_INNER_MODULES,
  END_GUARD_WIDTHS,
  G_CODES,
  L_CODES,
  PARITY_PATTERNS,
  R_CODES,
  START_GUARD_WIDTHS,
  computeEan13CheckDigit,
  verifyEan13CheckDigit,
} from "./eanShared";

describe("L_CODES / G_CODES / R_CODES tables", () => {
  test("each digit has 4 widths summing to 7 modules", () => {
    for (let d = 0; d < 10; d++) {
      const lSum = L_CODES[d].reduce((a, b) => a + b, 0);
      const gSum = G_CODES[d].reduce((a, b) => a + b, 0);
      const rSum = R_CODES[d].reduce((a, b) => a + b, 0);
      expect(lSum).toBe(7);
      expect(gSum).toBe(7);
      expect(rSum).toBe(7);
    }
  });

  test("each width is a positive integer ∈ {1, 2, 3, 4}", () => {
    for (const table of [L_CODES, G_CODES, R_CODES]) {
      for (const code of table) {
        for (const w of code) {
          expect([1, 2, 3, 4]).toContain(w);
        }
      }
    }
  });

  test("L-code and R-code share width sequences (R is bitwise inverse of L)", () => {
    // Since R-code is NOT L-code, the bar/space widths swap but the
    // overall sequence of widths is identical.
    for (let d = 0; d < 10; d++) {
      expect(R_CODES[d]).toEqual(L_CODES[d]);
    }
  });
});

describe("PARITY_PATTERNS", () => {
  test("has 10 entries, each 6 codes", () => {
    expect(PARITY_PATTERNS).toHaveLength(10);
    for (const p of PARITY_PATTERNS) {
      expect(p).toHaveLength(6);
    }
  });

  test("digit 0 is all-L (UPC-A behavior)", () => {
    expect(PARITY_PATTERNS[0]).toEqual(["L", "L", "L", "L", "L", "L"]);
  });

  test("digit 7 is LGLGLG (well-known reference pattern)", () => {
    expect(PARITY_PATTERNS[7]).toEqual(["L", "G", "L", "G", "L", "G"]);
  });
});

describe("guard widths", () => {
  test("start + end guards are [1, 1, 1] = 3 modules", () => {
    expect(START_GUARD_WIDTHS).toEqual([1, 1, 1]);
    expect(END_GUARD_WIDTHS).toEqual([1, 1, 1]);
  });

  test("center guard is [1, 1, 1, 1, 1] = 5 modules", () => {
    expect(CENTER_GUARD_WIDTHS).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("EAN_INNER_MODULES", () => {
  test("equals 95 (3 + 42 + 5 + 42 + 3)", () => {
    expect(EAN_INNER_MODULES).toBe(95);
    expect(EAN_INNER_MODULES).toBe(3 + 6 * 7 + 5 + 6 * 7 + 3);
  });
});

describe("computeEan13CheckDigit", () => {
  test("'590123412345' → 7 (canonical EAN-13 5901234123457)", () => {
    expect(computeEan13CheckDigit("590123412345")).toBe(7);
  });

  test("'400638133393' → 1 (4006381333931)", () => {
    expect(computeEan13CheckDigit("400638133393")).toBe(1);
  });

  test("UPC-A 036000291452 prepended with '0' → check digit 2", () => {
    expect(computeEan13CheckDigit("003600029145")).toBe(2);
  });

  test("all-zeros → 0", () => {
    expect(computeEan13CheckDigit("000000000000")).toBe(0);
  });

  test("rejects non-12-digit input", () => {
    expect(() => computeEan13CheckDigit("12345")).toThrow(/12 digits/);
    expect(() => computeEan13CheckDigit("12345678901a")).toThrow(/12 digits/);
    expect(() => computeEan13CheckDigit("1234567890123")).toThrow(/12 digits/);
  });
});

describe("verifyEan13CheckDigit", () => {
  test("accepts valid EAN-13s", () => {
    expect(() => verifyEan13CheckDigit("5901234123457")).not.toThrow();
    expect(() => verifyEan13CheckDigit("4006381333931")).not.toThrow();
    expect(() => verifyEan13CheckDigit("0036000291452")).not.toThrow();
  });

  test("rejects EAN-13s with wrong check digit", () => {
    // 5901234123450 has check digit 0 but the correct one is 7.
    expect(() => verifyEan13CheckDigit("5901234123450")).toThrow(/check digit mismatch/);
  });

  test("rejects non-13-digit input", () => {
    expect(() => verifyEan13CheckDigit("123456789012")).toThrow(/13 digits/);
    expect(() => verifyEan13CheckDigit("12345678901a3")).toThrow(/13 digits/);
  });
});
