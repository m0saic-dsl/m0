import {
  buildCodewordBitStream,
  encodeFormatBits,
  encodeVersionBits,
  getAlignmentPatternCenters,
  getAlignmentPatternRegions,
  getDarkModuleCell,
  getFinderPatternCells,
  getFormatInfoRegions,
  getSeparatorRegions,
  getTimingPatternRegions,
  getVersionInfoRegions,
  initMatrix,
  placeData,
} from "./matrix";

// Trivial RS replacement: returns ecCount zeros. Used to test interleaving
// independently of the actual Reed-Solomon math (which is covered in
// reedSolomon.test.ts).
const zeroRs = (data: readonly number[], ecCount: number): number[] =>
  new Array(ecCount).fill(0);

describe("initMatrix — function patterns", () => {
  test("V1: 21×21 matrix with three finder patterns at the corners", () => {
    const m = initMatrix(1);
    expect(m.size).toBe(21);

    // Top-left finder corner (0,0).
    expect(m.modules[0][0]).toBe(true);
    expect(m.modules[6][6]).toBe(true);
    expect(m.modules[3][3]).toBe(true); // center of finder
    expect(m.modules[1][1]).toBe(false); // first inner ring is light

    // Separator: row 7 col 0..6 is light (and reserved).
    expect(m.modules[7][0]).toBe(false);
    expect(m.reserved[7][0]).toBe(true);

    // Top-right finder: starts at col 14.
    expect(m.modules[0][14]).toBe(true);
    expect(m.modules[0][20]).toBe(true);

    // Bottom-left finder.
    expect(m.modules[14][0]).toBe(true);
    expect(m.modules[20][0]).toBe(true);
  });

  test("V1: horizontal timing pattern alternates dark/light on row 6", () => {
    const m = initMatrix(1);
    // Cols 8..12 (within data area) on row 6.
    expect(m.modules[6][8]).toBe(true);
    expect(m.modules[6][9]).toBe(false);
    expect(m.modules[6][10]).toBe(true);
    expect(m.modules[6][11]).toBe(false);
    expect(m.modules[6][12]).toBe(true);
  });

  test("V1: dark module is set at (4·V+9, 8) = (13, 8)", () => {
    const m = initMatrix(1);
    expect(m.modules[13][8]).toBe(true);
  });

  test("V1: format-info regions reserved around all three finders", () => {
    const m = initMatrix(1);
    // Row 8 cols 0..8 reserved.
    for (let c = 0; c <= 8; c++) {
      if (c === 6) continue; // timing column
      expect(m.reserved[8][c]).toBe(true);
    }
    // Col 8 rows 0..8 reserved.
    for (let r = 0; r <= 8; r++) {
      if (r === 6) continue;
      expect(m.reserved[r][8]).toBe(true);
    }
  });

  test("V2: single alignment pattern at (18, 18)", () => {
    const m = initMatrix(2);
    expect(m.size).toBe(25);
    // Alignment pattern center should be dark.
    expect(m.modules[18][18]).toBe(true);
    // Outer ring.
    expect(m.modules[16][16]).toBe(true);
    expect(m.modules[20][20]).toBe(true);
    // Light cells just inside the outer ring.
    expect(m.modules[17][17]).toBe(false);
    expect(m.modules[19][19]).toBe(false);
  });

  test("V7: alignment patterns + version-info region reserved", () => {
    const m = initMatrix(7);
    expect(m.size).toBe(45);
    // Version info area: 6×3 strip at rows 0..5, cols N-11..N-9.
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        expect(m.reserved[r][45 - 11 + c]).toBe(true);
        expect(m.reserved[45 - 11 + c][r]).toBe(true);
      }
    }
  });
});

describe("buildCodewordBitStream — interleaving", () => {
  test("V1-L (single block) passes through trivially: 19 data + 7 EC = 26 bytes = 208 bits + 0 remainder", () => {
    const data = new Array(19).fill(0xab); // arbitrary
    const bits = buildCodewordBitStream(data, "L", 1, zeroRs);
    expect(bits.length).toBe(26 * 8); // V1 has 0 remainder bits
  });

  test("V2 multi-block interleaving: total bits include the version's 7 remainder bits", () => {
    // V2-L: 1 block of 34 data + 10 EC × 1 = 44 codewords. 44 * 8 + 7 = 359 bits.
    const data = new Array(34).fill(0x01);
    const bits = buildCodewordBitStream(data, "L", 2, zeroRs);
    expect(bits.length).toBe(44 * 8 + 7);
  });

  test("throws when data byte count doesn't match the version's block-layout total", () => {
    expect(() => buildCodewordBitStream([1, 2, 3], "L", 1, zeroRs)).toThrow(/block-layout/);
  });
});

describe("placeData — bit zigzag", () => {
  test("V1-L: places all 208 data+EC bits into the non-reserved cells", () => {
    const m = initMatrix(1);
    const bitsToPlace = new Array(26 * 8).fill(1); // all 1s
    placeData(m, bitsToPlace);
    // Every non-reserved cell should now be dark.
    let nonReservedCount = 0;
    for (let r = 0; r < m.size; r++) {
      for (let c = 0; c < m.size; c++) {
        if (!m.reserved[r][c]) {
          nonReservedCount++;
          expect(m.modules[r][c]).toBe(true);
        }
      }
    }
    expect(nonReservedCount).toBe(208);
  });

  test("placeData throws if bit count overflows the available cells", () => {
    const m = initMatrix(1);
    expect(() => placeData(m, new Array(26 * 8 + 100).fill(0))).toThrow(/capacity mismatch/);
  });
});

describe("encodeFormatBits — known spec values", () => {
  // ISO 18004 Annex C Table 21 (format-information bit sequence).
  // ECC level + mask number → 15-bit format string.
  test("L + mask 0 → 0b111011111000100 (0x77C4)", () => {
    expect(encodeFormatBits("L", 0)).toBe(0x77c4);
  });

  test("M + mask 0 → 0b101010000010010 (0x5412) — XOR'd to 0 before mask", () => {
    // Wait — the spec value for M + mask 0 is 0x5412 ^ 0x5412 = 0 pre-XOR.
    // Format bits = (M=00 << 3 | mask=0) = 0, BCH(0) = 0, XOR 0x5412 = 0x5412.
    expect(encodeFormatBits("M", 0)).toBe(0x5412);
  });

  test("H + mask 0 → 0b001011010001001 (0x1689)", () => {
    // From ISO 18004 Annex C Table 21.
    expect(encodeFormatBits("H", 0)).toBe(0x1689);
  });

  test("H + mask 7 → 0b000100000111011 (0x083B)", () => {
    expect(encodeFormatBits("H", 7)).toBe(0x083b);
  });

  test("Q + mask 3 → 0b011101000000110 (0x3A06)", () => {
    expect(encodeFormatBits("Q", 3)).toBe(0x3a06);
  });

  test("invalid mask throws", () => {
    expect(() => encodeFormatBits("L", -1)).toThrow(/mask/);
    expect(() => encodeFormatBits("L", 8)).toThrow(/mask/);
    expect(() => encodeFormatBits("L", 1.5)).toThrow(/mask/);
  });
});

describe("encodeVersionBits — known spec values", () => {
  // ISO 18004 Annex D Table 26 (version-information bit sequence).
  test("V7 → 0x07C94", () => {
    expect(encodeVersionBits(7)).toBe(0x07c94);
  });

  test("V40 → 0x28C69", () => {
    expect(encodeVersionBits(40)).toBe(0x28c69);
  });

  test("V<7 throws", () => {
    expect(() => encodeVersionBits(6)).toThrow(/V7\.\.V40/);
  });
});

// ── Function-pattern coordinate getters (Phase 1 additions) ─────────

describe("getFinderPatternCells — always 3 corners", () => {
  test("V1 (21×21): TL at (0,0), TR at (0,14), BL at (14,0)", () => {
    const cells = getFinderPatternCells(1);
    expect(cells).toEqual([
      { corner: "tl", region: { row: 0, col: 0, w: 7, h: 7 } },
      { corner: "tr", region: { row: 0, col: 14, w: 7, h: 7 } },
      { corner: "bl", region: { row: 14, col: 0, w: 7, h: 7 } },
    ]);
  });

  test("V40 (177×177): TL at (0,0), TR at (0,170), BL at (170,0)", () => {
    const cells = getFinderPatternCells(40);
    expect(cells.map((c) => c.region.col)).toEqual([0, 170, 0]);
    expect(cells.map((c) => c.region.row)).toEqual([0, 0, 170]);
    for (const c of cells) {
      expect(c.region.w).toBe(7);
      expect(c.region.h).toBe(7);
    }
  });
});

describe("getAlignmentPatternCenters — per-version Annex E table with finder skips", () => {
  test("V1: empty (no alignment patterns)", () => {
    expect(getAlignmentPatternCenters(1)).toEqual([]);
  });

  test("V2: single center at (18,18)", () => {
    expect(getAlignmentPatternCenters(2)).toEqual([{ row: 18, col: 18 }]);
  });

  test("V7: 6 alignment patterns (the 3 corner overlaps with finders are skipped)", () => {
    // Annex E V7 row table: [6, 22, 38] → 3×3 = 9 potential, minus 3 finder
    // corners (TL/TR/BL) = 6 emitted.
    const centers = getAlignmentPatternCenters(7);
    expect(centers).toHaveLength(6);
    // The skipped corners would have been (6,6), (6,38), (38,6).
    for (const c of centers) {
      expect(!(c.row === 6 && c.col === 6)).toBe(true);
      expect(!(c.row === 6 && c.col === 38)).toBe(true);
      expect(!(c.row === 38 && c.col === 6)).toBe(true);
    }
  });

  test("rejects out-of-range version", () => {
    expect(() => getAlignmentPatternCenters(0)).toThrow(/version/);
    expect(() => getAlignmentPatternCenters(41)).toThrow(/version/);
  });
});

describe("getAlignmentPatternRegions — 5×5 footprint per center", () => {
  test("V2: one 5×5 rect at top-left (16,16)", () => {
    expect(getAlignmentPatternRegions(2)).toEqual([
      { row: 16, col: 16, w: 5, h: 5 },
    ]);
  });

  test("V1: empty", () => {
    expect(getAlignmentPatternRegions(1)).toEqual([]);
  });
});

describe("getTimingPatternRegions — 1-cell strips between separators", () => {
  test("V1 (21×21): horizontal row 6 cols 8..12 (length 5), vertical col 6 rows 8..12", () => {
    const { horizontal, vertical } = getTimingPatternRegions(1);
    expect(horizontal).toEqual({ row: 6, col: 8, w: 5, h: 1 });
    expect(vertical).toEqual({ row: 8, col: 6, w: 1, h: 5 });
  });

  test("V7 (45×45): length N-16 = 29 each", () => {
    const { horizontal, vertical } = getTimingPatternRegions(7);
    expect(horizontal.w).toBe(29);
    expect(vertical.h).toBe(29);
  });
});

describe("getDarkModuleCell — always (4·v+9, 8)", () => {
  test("V1: (13, 8)", () => {
    expect(getDarkModuleCell(1)).toEqual({ row: 13, col: 8 });
  });

  test("V7: (37, 8)", () => {
    expect(getDarkModuleCell(7)).toEqual({ row: 37, col: 8 });
  });

  test("V40: (169, 8)", () => {
    expect(getDarkModuleCell(40)).toEqual({ row: 169, col: 8 });
  });
});

describe("getFormatInfoRegions — 4 L-legs (2 per instance × 2 instances)", () => {
  test("V1 (21×21): instance 0 wraps TL (H leg owns corner), instance 1 split across TR/BL", () => {
    const regions = getFormatInfoRegions(1);
    expect(regions).toEqual([
      { instance: 0, leg: "h", region: { row: 8, col: 0, w: 9, h: 1 } },
      { instance: 0, leg: "v", region: { row: 0, col: 8, w: 1, h: 8 } },
      { instance: 1, leg: "h", region: { row: 8, col: 13, w: 8, h: 1 } },
      { instance: 1, leg: "v", region: { row: 14, col: 8, w: 1, h: 7 } },
    ]);
  });

  test("V7 (45×45): instance 1 legs slide to the right/bottom finders", () => {
    const regions = getFormatInfoRegions(7);
    const inst1h = regions.find((r) => r.instance === 1 && r.leg === "h")!;
    expect(inst1h.region).toEqual({ row: 8, col: 37, w: 8, h: 1 });
  });
});

describe("getVersionInfoRegions — v7+ only", () => {
  test("V1..V6: empty", () => {
    for (let v = 1; v <= 6; v++) {
      expect(getVersionInfoRegions(v)).toEqual([]);
    }
  });

  test("V7 (45×45): two 3×6 blocks adjacent to TR and BL finders", () => {
    const regions = getVersionInfoRegions(7);
    expect(regions).toEqual([
      { instance: 0, region: { row: 0, col: 34, w: 3, h: 6 } },
      { instance: 1, region: { row: 34, col: 0, w: 6, h: 3 } },
    ]);
  });

  test("V40 (177×177): instance 0 at col 166", () => {
    const regions = getVersionInfoRegions(40);
    expect(regions[0].region.col).toBe(166);
  });
});

describe("getSeparatorRegions — 6 legs total (2 per finder × 3), H owns corner", () => {
  test("V1 (21×21): TL H is row 7 cols 0..7; V is rows 0..6 col 7 (skips corner)", () => {
    const regions = getSeparatorRegions(1);
    expect(regions).toEqual([
      { corner: "tl", leg: "h", region: { row: 7, col: 0, w: 8, h: 1 } },
      { corner: "tl", leg: "v", region: { row: 0, col: 7, w: 1, h: 7 } },
      { corner: "tr", leg: "h", region: { row: 7, col: 13, w: 8, h: 1 } },
      { corner: "tr", leg: "v", region: { row: 0, col: 13, w: 1, h: 7 } },
      { corner: "bl", leg: "h", region: { row: 13, col: 0, w: 8, h: 1 } },
      { corner: "bl", leg: "v", region: { row: 14, col: 7, w: 1, h: 7 } },
    ]);
  });
});

// ── Cross-check coordinate getters against the actual matrix ─────────
//
// The getters should agree with initMatrix's drawing: every cell a getter
// claims as a function-pattern cell should be marked `reserved` in the
// initMatrix output. This is the load-bearing consistency check.

describe("coordinate getters vs initMatrix — reserved-cell agreement", () => {
  for (const version of [1, 2, 7, 14, 40]) {
    test(`V${version}: every finder/alignment/timing cell from getters is reserved in initMatrix`, () => {
      const work = initMatrix(version);
      const claimed: Array<{ row: number; col: number }> = [];

      // Finders.
      for (const { region } of getFinderPatternCells(version)) {
        for (let dr = 0; dr < region.h; dr++) {
          for (let dc = 0; dc < region.w; dc++) {
            claimed.push({ row: region.row + dr, col: region.col + dc });
          }
        }
      }
      // Alignment.
      for (const region of getAlignmentPatternRegions(version)) {
        for (let dr = 0; dr < region.h; dr++) {
          for (let dc = 0; dc < region.w; dc++) {
            claimed.push({ row: region.row + dr, col: region.col + dc });
          }
        }
      }
      // Timing.
      const { horizontal, vertical } = getTimingPatternRegions(version);
      for (let i = 0; i < horizontal.w; i++) {
        claimed.push({ row: horizontal.row, col: horizontal.col + i });
      }
      for (let i = 0; i < vertical.h; i++) {
        claimed.push({ row: vertical.row + i, col: vertical.col });
      }

      for (const { row, col } of claimed) {
        expect(work.reserved[row][col]).toBe(true);
      }
    });
  }

  test("V7: getDarkModuleCell points to a reserved + dark cell", () => {
    const work = initMatrix(7);
    const { row, col } = getDarkModuleCell(7);
    expect(work.reserved[row][col]).toBe(true);
    // initMatrix sets dark module to true.
    expect(work.modules[row][col]).toBe(true);
  });
});
