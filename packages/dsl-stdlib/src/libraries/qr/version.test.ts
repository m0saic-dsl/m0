import {
  ecCodewordsPerBlock,
  getEccBlocks,
  moduleSideLength,
  numEcBlocks,
  selectVersion,
  totalCodewords,
  totalDataCodewords,
} from "./version";

describe("moduleSideLength", () => {
  test("V1 → 21, V6 → 41, V40 → 177", () => {
    expect(moduleSideLength(1)).toBe(21);
    expect(moduleSideLength(6)).toBe(41);
    expect(moduleSideLength(40)).toBe(177);
  });

  test("rejects invalid versions", () => {
    expect(() => moduleSideLength(0)).toThrow(/version/);
    expect(() => moduleSideLength(41)).toThrow(/version/);
    expect(() => moduleSideLength(1.5)).toThrow(/version/);
  });
});

describe("totalCodewords / totalDataCodewords / EC layouts (spec parity)", () => {
  // ISO 18004 Annex C reference values.
  test("V1-L: 26 total, 19 data, 7 EC × 1 block", () => {
    expect(totalCodewords(1)).toBe(26);
    expect(totalDataCodewords(1, "L")).toBe(19);
    expect(ecCodewordsPerBlock(1, "L")).toBe(7);
    expect(numEcBlocks(1, "L")).toBe(1);
  });

  test("V1-M: 26 total, 16 data, 10 EC × 1 block", () => {
    expect(totalDataCodewords(1, "M")).toBe(16);
    expect(ecCodewordsPerBlock(1, "M")).toBe(10);
  });

  test("V1-H: 26 total, 9 data, 17 EC × 1 block", () => {
    expect(totalDataCodewords(1, "H")).toBe(9);
    expect(ecCodewordsPerBlock(1, "H")).toBe(17);
  });

  test("V6-H: 172 total, 60 data, 28 EC × 4 blocks", () => {
    expect(totalCodewords(6)).toBe(172);
    expect(totalDataCodewords(6, "H")).toBe(60);
    expect(ecCodewordsPerBlock(6, "H")).toBe(28);
    expect(numEcBlocks(6, "H")).toBe(4);
  });

  test("V40-H: 3706 total, 1276 data, 30 EC × 81 blocks", () => {
    expect(totalCodewords(40)).toBe(3706);
    expect(totalDataCodewords(40, "H")).toBe(3706 - 30 * 81);
    expect(ecCodewordsPerBlock(40, "H")).toBe(30);
    expect(numEcBlocks(40, "H")).toBe(81);
  });
});

describe("getEccBlocks (group split)", () => {
  test("V1-L: 1 block of 19 data (no group 2)", () => {
    expect(getEccBlocks(1, "L")).toEqual({
      ecPerBlock: 7,
      group1Blocks: 1,
      group1Data: 19,
      group2Blocks: 0,
      group2Data: 0,
    });
  });

  test("V6-H: 4 blocks, 60/4 = 15 data each, no remainder", () => {
    expect(getEccBlocks(6, "H")).toEqual({
      ecPerBlock: 28,
      group1Blocks: 4,
      group1Data: 15,
      group2Blocks: 0,
      group2Data: 0,
    });
  });

  test("V5-Q: 4 blocks, 62 data → 2×15 + 2×16 split", () => {
    // V5-Q: 134 total, 18 EC × 4 = 72 EC; 134-72 = 62 data.
    // 62 / 4 = 15 r 2 → 2 blocks of 15 + 2 blocks of 16.
    expect(getEccBlocks(5, "Q")).toEqual({
      ecPerBlock: 18,
      group1Blocks: 2,
      group1Data: 15,
      group2Blocks: 2,
      group2Data: 16,
    });
  });
});

describe("selectVersion", () => {
  test("picks V1 for trivial bit counts", () => {
    expect(selectVersion(0, "L")).toBe(1);
    expect(selectVersion(50, "L")).toBe(1); // V1-L holds 19*8=152 bits
  });

  test("picks the smallest version that fits", () => {
    // V1-L = 152 bits, V2-L = 272 bits.
    expect(selectVersion(152, "L")).toBe(1);
    expect(selectVersion(153, "L")).toBe(2);
    expect(selectVersion(272, "L")).toBe(2);
    expect(selectVersion(273, "L")).toBe(3);
  });

  test("higher ECC selects bigger version for same data", () => {
    const dataBits = 100;
    // At L: probably V1. At H: more EC overhead, may need V1 still or larger.
    const vL = selectVersion(dataBits, "L");
    const vH = selectVersion(dataBits, "H");
    expect(vH).toBeGreaterThanOrEqual(vL);
  });

  test("respects requestedVersion when it fits", () => {
    expect(selectVersion(10, "L", 5)).toBe(5);
  });

  test("throws if requestedVersion too small", () => {
    expect(() => selectVersion(10_000, "L", 1)).toThrow(/holds.*bits/);
  });

  test("throws if no version fits", () => {
    expect(() => selectVersion(1_000_000, "L")).toThrow(/no QR version/);
  });
});
