import { ean13Encode } from "./ean13";
import { EAN_INNER_MODULES } from "./eanShared";

describe("ean13Encode — payload normalization", () => {
  test("12-digit input → appends computed check digit", () => {
    const r = ean13Encode("590123412345");
    expect(r.payload).toBe("5901234123457");
    expect(r.symbols).toEqual([5, 9, 0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 7]);
  });

  test("13-digit input with valid check → accepted as-is", () => {
    const r = ean13Encode("5901234123457");
    expect(r.payload).toBe("5901234123457");
  });

  test("13-digit input with wrong check digit → throws", () => {
    expect(() => ean13Encode("5901234123450")).toThrow(/check digit mismatch/);
  });

  test("rejects non-numeric input", () => {
    expect(() => ean13Encode("59012341234A7")).toThrow(/12 or 13 digits/);
  });

  test("rejects inputs of unsupported length", () => {
    expect(() => ean13Encode("12345")).toThrow(/12 or 13 digits/);
    expect(() => ean13Encode("12345678901")).toThrow(/12 or 13 digits/);
    expect(() => ean13Encode("12345678901234")).toThrow(/12 or 13 digits/);
  });
});

describe("ean13Encode — bar widths", () => {
  test("inner module width is always 95", () => {
    for (const text of [
      "5901234123457",
      "4006381333931",
      "0036000291452",
      "0000000000000",
      "9999999999994",
    ]) {
      const r = ean13Encode(text);
      expect(r.modulesWide).toBe(95);
      expect(r.modulesWide).toBe(EAN_INNER_MODULES);
    }
  });

  test("width count = 3 + 4*6 + 5 + 4*6 + 3 = 59 widths total", () => {
    const r = ean13Encode("5901234123457");
    expect(r.widths).toHaveLength(3 + 4 * 6 + 5 + 4 * 6 + 3);
  });

  test("widths are positive integers ∈ {1, 2, 3, 4}", () => {
    const r = ean13Encode("5901234123457");
    for (const w of r.widths) {
      expect([1, 2, 3, 4]).toContain(w);
    }
  });

  test("first 3 widths are the start guard [1, 1, 1]", () => {
    const r = ean13Encode("5901234123457");
    expect(r.widths.slice(0, 3)).toEqual([1, 1, 1]);
  });

  test("last 3 widths are the end guard [1, 1, 1]", () => {
    const r = ean13Encode("5901234123457");
    expect(r.widths.slice(-3)).toEqual([1, 1, 1]);
  });

  test("center guard sits at widths index [3 + 24, 3 + 24 + 5) = [27, 32)", () => {
    const r = ean13Encode("5901234123457");
    expect(r.widths.slice(27, 32)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("ean13Encode — spec-vector bar patterns", () => {
  test("'5901234123457' produces the correct first left digit (9) under LLGLGG parity", () => {
    // First digit 5 → parity pattern LGGLLG.
    // First left digit is 9, encoded as L-code 9 = [3, 1, 1, 2].
    const r = ean13Encode("5901234123457");
    // widths[3..7) = first left digit's 4 widths.
    expect(r.widths.slice(3, 7)).toEqual([3, 1, 1, 2]);
  });

  test("'0036000291452' first left digit (0) is L-code 0 = [3, 2, 1, 1]", () => {
    // First digit 0 → parity pattern LLLLLL (all-L, UPC-A behavior).
    const r = ean13Encode("0036000291452");
    expect(r.widths.slice(3, 7)).toEqual([3, 2, 1, 1]);
  });

  test("first right digit is encoded with R-code regardless of parity", () => {
    // For '5901234123457', first right digit (position 7) is 1.
    // R-code 1 = [2, 2, 2, 1].
    const r = ean13Encode("5901234123457");
    // Start at widths index 3 + 4*6 + 5 = 32. First R-code occupies 32..36.
    expect(r.widths.slice(32, 36)).toEqual([2, 2, 2, 1]);
  });
});

describe("ean13Encode — determinism", () => {
  test("same input twice → byte-identical widths", () => {
    const a = ean13Encode("5901234123457");
    const b = ean13Encode("5901234123457");
    expect(a.widths).toEqual(b.widths);
    expect(a.payload).toBe(b.payload);
  });
});
