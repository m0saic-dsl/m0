import {
  autoPickCodeSet,
  CODE128_START,
  CODE128_STOP,
  code128Encode,
  _internal,
} from "./code128";

describe("autoPickCodeSet", () => {
  test("even-length digit string → Code C", () => {
    expect(autoPickCodeSet("00")).toBe("C");
    expect(autoPickCodeSet("1234")).toBe("C");
    expect(autoPickCodeSet("0123456789")).toBe("C");
  });

  test("odd-length digit string → Code B", () => {
    expect(autoPickCodeSet("0")).toBe("B");
    expect(autoPickCodeSet("12345")).toBe("B");
  });

  test("mixed / printable ASCII → Code B", () => {
    expect(autoPickCodeSet("Hello")).toBe("B");
    expect(autoPickCodeSet("PJJ123C")).toBe("B");
    expect(autoPickCodeSet("hello world")).toBe("B");
    expect(autoPickCodeSet("M0SAIC")).toBe("B");
  });

  test("empty string → Code B (encoder will reject empty input downstream)", () => {
    expect(autoPickCodeSet("")).toBe("B");
  });
});

describe("code128Encode — symbol stream", () => {
  test("'A' in Code B → [Start B, val(A)=33, checksum=34, Stop]", () => {
    const r = code128Encode("A");
    expect(r.set).toBe("B");
    expect(r.symbols[0]).toBe(CODE128_START.B); // 104
    expect(r.symbols[1]).toBe(33);
    // checksum: (104*1 + 33*1) % 103 = 137 % 103 = 34
    expect(r.checksum).toBe(34);
    expect(r.symbols[2]).toBe(34);
    expect(r.symbols[r.symbols.length - 1]).toBe(CODE128_STOP); // 106
  });

  test("'Hello' in Code B → checksum 76", () => {
    const r = code128Encode("Hello");
    expect(r.set).toBe("B");
    // H=40, e=69, l=76, l=76, o=79
    expect(r.symbols.slice(1, 6)).toEqual([40, 69, 76, 76, 79]);
    // (104 + 40 + 69*2 + 76*3 + 76*4 + 79*5) % 103
    // = (104 + 40 + 138 + 228 + 304 + 395) % 103
    // = 1209 % 103 = 76
    expect(r.checksum).toBe(76);
  });

  test("'PJJ123C' in Code B → checksum 55 (hand-computed spec vector)", () => {
    const r = code128Encode("PJJ123C");
    expect(r.set).toBe("B");
    // P=48, J=42, J=42, 1=17, 2=18, 3=19, C=35
    expect(r.symbols.slice(1, 8)).toEqual([48, 42, 42, 17, 18, 19, 35]);
    expect(r.checksum).toBe(55);
  });

  test("'00' in Code C → [Start C, 0, checksum=2, Stop]", () => {
    const r = code128Encode("00");
    expect(r.set).toBe("C");
    expect(r.symbols[0]).toBe(CODE128_START.C); // 105
    expect(r.symbols[1]).toBe(0);
    // (105 + 0) % 103 = 2
    expect(r.checksum).toBe(2);
    expect(r.symbols).toEqual([105, 0, 2, 106]);
  });

  test("'1234' in Code C → digit-pair values 12 and 34", () => {
    const r = code128Encode("1234");
    expect(r.set).toBe("C");
    expect(r.symbols.slice(0, 3)).toEqual([105, 12, 34]);
    // (105 + 12 + 34*2) % 103 = (105 + 12 + 68) % 103 = 185 % 103 = 82
    expect(r.checksum).toBe(82);
  });

  test("forced Code B on digit input still picks Code B (not auto C)", () => {
    const r = code128Encode("1234", { set: "B" });
    expect(r.set).toBe("B");
    // 1=17, 2=18, 3=19, 4=20
    expect(r.symbols.slice(1, 5)).toEqual([17, 18, 19, 20]);
  });

  test("forced Code C on odd-length digits throws", () => {
    expect(() => code128Encode("123", { set: "C" })).toThrow(/even-length/);
  });

  test("forced Code C on non-digit throws", () => {
    expect(() => code128Encode("12A4", { set: "C" })).toThrow(/all-digit/);
  });

  test("Code B rejects characters outside ASCII 32–127", () => {
    expect(() => code128Encode("hi\x00", { set: "B" })).toThrow(/out of range/);
    expect(() => code128Encode("résumé", { set: "B" })).toThrow(/out of range/);
  });

  test("empty input throws", () => {
    expect(() => code128Encode("")).toThrow(/non-empty/);
  });
});

describe("code128Encode — bar widths", () => {
  test("widths are strictly in {1,2,3,4}", () => {
    const r = code128Encode("Hello");
    for (const w of r.widths) {
      expect([1, 2, 3, 4]).toContain(w);
    }
  });

  test("modulesWide is the sum of widths", () => {
    const r = code128Encode("Hello");
    const sum = r.widths.reduce((acc, w) => acc + w, 0);
    expect(r.modulesWide).toBe(sum);
  });

  test("'00' in Code C → 4 symbols × (11 + 11 + 11 + 13) = 46 modules", () => {
    const r = code128Encode("00");
    expect(r.symbols).toHaveLength(4);
    // 11*3 + 13 = 46
    expect(r.modulesWide).toBe(46);
  });

  test("modulesWide = 11*(symbols.length - 1) + 13 (last is the 13-module stop)", () => {
    // Holds for every input because Code 128 data/start/checksum symbols are
    // 11 modules each and the stop adds 2 extra modules.
    for (const text of ["A", "Hello", "PJJ123C", "00", "1234", "9999"]) {
      const r = code128Encode(text);
      expect(r.modulesWide).toBe(11 * (r.symbols.length - 1) + 13);
    }
  });

  test("widths.length = 6*(symbols.length - 1) + 7 (stop adds an extra width)", () => {
    for (const text of ["A", "Hello", "PJJ123C", "00", "1234"]) {
      const r = code128Encode(text);
      expect(r.widths.length).toBe(6 * (r.symbols.length - 1) + 7);
    }
  });
});

describe("code128Encode — determinism", () => {
  test("identical input → identical output", () => {
    const a = code128Encode("M0SAIC");
    const b = code128Encode("M0SAIC");
    expect(a.set).toBe(b.set);
    expect(a.symbols).toEqual(b.symbols);
    expect(a.checksum).toBe(b.checksum);
    expect(a.widths).toEqual(b.widths);
    expect(a.modulesWide).toBe(b.modulesWide);
  });
});

describe("CODE128_PATTERNS table", () => {
  test("entries 0–105 are 6 widths; entry 106 (Stop) is 7 widths", () => {
    for (let i = 0; i <= 105; i++) {
      expect(_internal.CODE128_PATTERNS[i]).toHaveLength(6);
    }
    expect(_internal.CODE128_PATTERNS[106]).toHaveLength(7);
  });

  test("every pattern uses widths only in {1,2,3,4}", () => {
    for (const pat of _internal.CODE128_PATTERNS) {
      for (const w of pat) expect([1, 2, 3, 4]).toContain(w);
    }
  });

  test("data/start symbol widths sum to 11; Stop sums to 13", () => {
    for (let i = 0; i <= 105; i++) {
      const sum = _internal.CODE128_PATTERNS[i].reduce((a, b) => a + b, 0);
      expect(sum).toBe(11);
    }
    expect(_internal.CODE128_PATTERNS[106].reduce((a, b) => a + b, 0)).toBe(13);
  });

  test("table has 107 entries (0–106)", () => {
    expect(_internal.CODE128_PATTERNS).toHaveLength(107);
  });
});
