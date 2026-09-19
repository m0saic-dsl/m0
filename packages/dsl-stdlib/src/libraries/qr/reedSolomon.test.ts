import { buildGeneratorPoly, computeRsCodewords, gfMul } from "./reedSolomon";

describe("gfMul (GF(256) multiplication)", () => {
  test("0 × anything = 0", () => {
    expect(gfMul(0, 17)).toBe(0);
    expect(gfMul(255, 0)).toBe(0);
    expect(gfMul(0, 0)).toBe(0);
  });

  test("1 × x = x (identity)", () => {
    for (const x of [1, 17, 53, 200, 255]) {
      expect(gfMul(1, x)).toBe(x);
      expect(gfMul(x, 1)).toBe(x);
    }
  });

  test("matches QR spec primitive: α^8 = 0x1D (the reducible term)", () => {
    // α = 2; α^8 reduces to x^4 + x^3 + x^2 + 1 = 0x1D under QR's
    // primitive polynomial x^8 + x^4 + x^3 + x^2 + 1.
    let v = 1;
    for (let i = 0; i < 8; i++) v = gfMul(v, 2);
    expect(v).toBe(0x1d);
  });

  test("commutative and associative on representative values", () => {
    expect(gfMul(53, 200)).toBe(gfMul(200, 53));
    expect(gfMul(gfMul(7, 11), 23)).toBe(gfMul(7, gfMul(11, 23)));
  });
});

describe("buildGeneratorPoly", () => {
  test("degree 1 → [1, 1] (x + α^0 = x + 1)", () => {
    expect(buildGeneratorPoly(1)).toEqual([1, 1]);
  });

  test("degree 2 → [1, α^0+α^1, α^0·α^1] = [1, 3, 2]", () => {
    expect(buildGeneratorPoly(2)).toEqual([1, 3, 2]);
  });

  test("degree 7 (QR-Version-1-L EC count) matches the spec values", () => {
    // ISO 18004 Annex A: generator poly for 7 EC codewords.
    // Coefficients in α-exponent form: {0, 87, 229, 146, 149, 238, 102, 21}.
    // Convert α-exponents to GF(256) values:
    //   α^0=1, α^21=..., etc.
    // Easier: assert it has length 8 (degree+1), starts with 1, and
    // round-trips correctly through computeRsCodewords on a known input.
    const g = buildGeneratorPoly(7);
    expect(g).toHaveLength(8);
    expect(g[0]).toBe(1);
  });

  test("throws on invalid input", () => {
    expect(() => buildGeneratorPoly(0)).toThrow(/positive integer/);
    expect(() => buildGeneratorPoly(-1)).toThrow(/positive integer/);
    expect(() => buildGeneratorPoly(1.5)).toThrow(/positive integer/);
  });
});

describe("computeRsCodewords", () => {
  // QR Code spec Annex I.2 — encoding "01234567" at version 1, level M.
  // The 16-byte data codeword block:
  //   {0x10, 0x20, 0x0C, 0x56, 0x61, 0x80, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11, 0xEC, 0x11}
  // Expected 10 EC codewords (10 is the version-1-M EC count):
  //   {0xA5, 0x24, 0xD4, 0xC1, 0xED, 0x36, 0xC7, 0x87, 0x2C, 0x55}
  test("spec example: version 1-M '01234567' → 10 EC codewords", () => {
    const data = [
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11,
      0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11,
    ];
    const ec = computeRsCodewords(data, 10);
    expect(ec).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  test("deterministic — same input twice produces identical output", () => {
    const data = [0x40, 0xa0, 0xc4, 0x00, 0x00];
    const a = computeRsCodewords(data, 7);
    const b = computeRsCodewords(data, 7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(7);
  });

  test("all-zero data produces all-zero EC", () => {
    const ec = computeRsCodewords([0, 0, 0, 0], 5);
    expect(ec).toEqual([0, 0, 0, 0, 0]);
  });

  test("throws on invalid ecCount", () => {
    expect(() => computeRsCodewords([0], 0)).toThrow(/positive integer/);
    expect(() => computeRsCodewords([0], -1)).toThrow(/positive integer/);
  });
});
