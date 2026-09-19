import { ean13Encode } from "./ean13";
import { upcaEncode } from "./upca";

describe("upcaEncode — payload normalization", () => {
  test("11-digit input → appends computed check digit", () => {
    const r = upcaEncode("03600029145");
    expect(r.payload).toBe("036000291452");
    expect(r.symbols).toEqual([0, 3, 6, 0, 0, 0, 2, 9, 1, 4, 5, 2]);
  });

  test("12-digit input with valid check → accepted as-is", () => {
    const r = upcaEncode("036000291452");
    expect(r.payload).toBe("036000291452");
  });

  test("12-digit input with wrong check digit → throws", () => {
    expect(() => upcaEncode("036000291450")).toThrow(/check digit mismatch/);
  });

  test("rejects non-numeric input", () => {
    expect(() => upcaEncode("03600029145A")).toThrow(/11 or 12 digits/);
  });

  test("rejects inputs of unsupported length", () => {
    expect(() => upcaEncode("123")).toThrow(/11 or 12 digits/);
    expect(() => upcaEncode("1234567890")).toThrow(/11 or 12 digits/);
    expect(() => upcaEncode("1234567890123")).toThrow(/11 or 12 digits/);
  });
});

describe("upcaEncode — bar pattern equivalence with EAN-13('0'+upc)", () => {
  test("widths match ean13Encode('0' + upcaPayload) byte-for-byte", () => {
    for (const upca of ["036000291452", "012345678905", "000000000000"]) {
      const upcResult = upcaEncode(upca);
      const eanResult = ean13Encode("0" + upca);
      expect(upcResult.widths).toEqual(eanResult.widths);
      expect(upcResult.modulesWide).toBe(eanResult.modulesWide);
      expect(upcResult.modulesWide).toBe(95);
    }
  });
});

describe("upcaEncode — determinism", () => {
  test("same input twice → byte-identical widths", () => {
    const a = upcaEncode("036000291452");
    const b = upcaEncode("036000291452");
    expect(a.widths).toEqual(b.widths);
    expect(a.payload).toBe(b.payload);
  });
});
