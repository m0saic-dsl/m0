import { buildBitStream, detectMode, fullBitCount } from "./encoder";
import { totalDataCodewords } from "./version";

describe("detectMode", () => {
  test("digits only → numeric", () => {
    expect(detectMode("1234567890")).toBe("numeric");
    expect(detectMode("0")).toBe("numeric");
  });

  test("uppercase + digits + allowed punctuation → alphanumeric", () => {
    expect(detectMode("HELLO")).toBe("alphanumeric");
    expect(detectMode("HTTPS://M0SAIC.IO")).toBe("alphanumeric");
    expect(detectMode("ABC 123")).toBe("alphanumeric");
  });

  test("lowercase or symbols outside set → byte", () => {
    expect(detectMode("hello")).toBe("byte");
    expect(detectMode("https://m0saic.io")).toBe("byte");
    expect(detectMode("Hello, World!")).toBe("byte");
  });

  test("unicode → byte", () => {
    expect(detectMode("résumé")).toBe("byte");
    expect(detectMode("😀")).toBe("byte");
  });

  test("empty string → byte (degenerate, falls through)", () => {
    expect(detectMode("")).toBe("byte");
  });
});

describe("fullBitCount", () => {
  test("numeric: '01234567' at V1 → 4 (mode) + 10 (count) + 27 (data) = 41 bits", () => {
    // 8 digits = 2 groups of 3 (20 bits) + 1 tail of 2 digits (7 bits) = 27.
    expect(fullBitCount("numeric", "01234567", 1)).toBe(4 + 10 + 27);
  });

  test("alphanumeric: 'AC-42' at V1 → 4 + 9 + (2 pairs * 11) + 6 = 41 bits", () => {
    expect(fullBitCount("alphanumeric", "AC-42", 1)).toBe(4 + 9 + 22 + 6);
  });

  test("byte: 'hi' at V1 → 4 + 8 + 16 = 28 bits", () => {
    expect(fullBitCount("byte", "hi", 1)).toBe(4 + 8 + 16);
  });

  test("byte: unicode counted in UTF-8 bytes, not chars", () => {
    // "é" is 2 bytes in UTF-8 → 16 data bits.
    expect(fullBitCount("byte", "é", 1)).toBe(4 + 8 + 16);
  });
});

describe("buildBitStream — ISO 18004 Annex I.2 spec example", () => {
  // "01234567" at V1-M → exact 16-byte data block from the spec.
  test('"01234567" at V1-M produces the canonical 16-byte data codeword block', () => {
    const result = buildBitStream("01234567", "M");
    expect(result.version).toBe(1);
    expect(result.mode).toBe("numeric");
    expect(result.errorCorrectionLevel).toBe("M");
    expect(result.data).toEqual([
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80,
      0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
    ]);
  });
});

describe("buildBitStream — version selection", () => {
  test("picks smallest version that fits the URL", () => {
    const result = buildBitStream("https://m0saic.io", "M");
    expect(result.mode).toBe("byte");
    expect(result.version).toBeGreaterThanOrEqual(1);
    expect(result.version).toBeLessThanOrEqual(40);
  });

  test("respects forced version when supplied", () => {
    const result = buildBitStream("HI", "L", { version: 5 });
    expect(result.version).toBe(5);
    // Padding fills capacity even when data is tiny.
    expect(result.data.length).toBe(108); // V5-L = 108 data codewords
  });

  test("data length matches total data codewords for picked version", () => {
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      const result = buildBitStream("https://m0saic.io", ecc);
      // Result data length must match capacity exactly (terminator + pad fills it).
      expect(result.data.length).toBe(totalDataCodewords(result.version, ecc));
    }
  });
});

describe("buildBitStream — determinism", () => {
  test("identical input → identical bytes", () => {
    const a = buildBitStream("https://m0saic.io", "M");
    const b = buildBitStream("https://m0saic.io", "M");
    expect(a.data).toEqual(b.data);
    expect(a.version).toBe(b.version);
  });
});

describe("buildBitStream — mode-validation guards", () => {
  test("forced numeric on non-digit text throws", () => {
    expect(() => buildBitStream("abc", "M", { mode: "numeric" })).toThrow(/numeric/);
  });

  test("forced alphanumeric on lowercase throws", () => {
    expect(() => buildBitStream("hello", "M", { mode: "alphanumeric" })).toThrow(/alphanumeric/);
  });
});
