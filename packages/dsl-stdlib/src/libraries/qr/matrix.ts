/**
 * QR Code matrix construction per ISO 18004.
 *
 * Builds the N×N module grid (N = 4·version + 17), draws all function
 * patterns (finders + separators + alignment + timing + dark module),
 * reserves the format-info and (v7+) version-info regions, interleaves
 * data+EC codewords across blocks, and places them via the spec's
 * 2-column zigzag.
 *
 * Format-info and version-info encoding happens here too (BCH(15,5) and
 * BCH(18,6) respectively), but the format-info `placeFormatInfo` write is
 * deferred until after `mask.chooseBestMask` picks a mask — because the
 * format string includes the mask number.
 *
 * Pure, deterministic, no I/O. The returned matrix is "raw" (no quiet zone);
 * `qrToMatrix` adds the quiet zone band.
 */

import type { QrErrorCorrection } from "./types";
import { getEccBlocks, moduleSideLength } from "./version";

// ── Alignment-pattern center positions per version (ISO 18004 Annex E) ──

const ALIGNMENT_POSITIONS: readonly (readonly number[])[] = [
  /* V1  */ [],
  /* V2  */ [6, 18],
  /* V3  */ [6, 22],
  /* V4  */ [6, 26],
  /* V5  */ [6, 30],
  /* V6  */ [6, 34],
  /* V7  */ [6, 22, 38],
  /* V8  */ [6, 24, 42],
  /* V9  */ [6, 26, 46],
  /* V10 */ [6, 28, 50],
  /* V11 */ [6, 30, 54],
  /* V12 */ [6, 32, 58],
  /* V13 */ [6, 34, 62],
  /* V14 */ [6, 26, 46, 66],
  /* V15 */ [6, 26, 48, 70],
  /* V16 */ [6, 26, 50, 74],
  /* V17 */ [6, 30, 54, 78],
  /* V18 */ [6, 30, 56, 82],
  /* V19 */ [6, 30, 58, 86],
  /* V20 */ [6, 34, 62, 90],
  /* V21 */ [6, 28, 50, 72, 94],
  /* V22 */ [6, 26, 50, 74, 98],
  /* V23 */ [6, 30, 54, 78, 102],
  /* V24 */ [6, 28, 54, 80, 106],
  /* V25 */ [6, 32, 58, 84, 110],
  /* V26 */ [6, 30, 58, 86, 114],
  /* V27 */ [6, 34, 62, 90, 118],
  /* V28 */ [6, 26, 50, 74, 98, 122],
  /* V29 */ [6, 30, 54, 78, 102, 126],
  /* V30 */ [6, 26, 52, 78, 104, 130],
  /* V31 */ [6, 30, 56, 82, 108, 134],
  /* V32 */ [6, 34, 60, 86, 112, 138],
  /* V33 */ [6, 30, 58, 86, 114, 142],
  /* V34 */ [6, 34, 62, 90, 118, 146],
  /* V35 */ [6, 30, 54, 78, 102, 126, 150],
  /* V36 */ [6, 24, 50, 76, 102, 128, 154],
  /* V37 */ [6, 28, 54, 80, 106, 132, 158],
  /* V38 */ [6, 32, 58, 84, 110, 136, 162],
  /* V39 */ [6, 26, 54, 82, 110, 138, 166],
  /* V40 */ [6, 30, 58, 86, 114, 142, 170],
];

/** Remainder bits per version, ISO 18004 Annex D Table 1. */
const REMAINDER_BITS: readonly number[] = [
  // V1-7
  0, 7, 7, 7, 7, 7, 0,
  // V8-13
  0, 0, 0, 0, 0, 0,
  // V14-20
  3, 3, 3, 3, 3, 3, 3,
  // V21-27
  4, 4, 4, 4, 4, 4, 4,
  // V28-34
  3, 3, 3, 3, 3, 3, 3,
  // V35-40
  0, 0, 0, 0, 0, 0,
];

// ── Matrix init + function patterns ─────────────────────────────────

export type QrMatrixWork = {
  /** N×N booleans. true = dark module. */
  modules: boolean[][];
  /** Same shape. true = cell is part of a function pattern or reserved info area. */
  reserved: boolean[][];
  /** N = 4·version + 17 */
  size: number;
};

function makeGrid(size: number, fill: boolean): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(fill));
}

function setModule(work: QrMatrixWork, r: number, c: number, dark: boolean): void {
  work.modules[r][c] = dark;
  work.reserved[r][c] = true;
}

function drawFinderPattern(work: QrMatrixWork, r: number, c: number): void {
  // 7×7 inner: outer ring dark, 1-cell light, 3×3 dark.
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= work.size || cc < 0 || cc >= work.size) continue;
      // -1..7 covers the 1-cell separator around the 7×7 finder.
      const onBorder =
        dr === -1 || dr === 7 || dc === -1 || dc === 7;
      const outer = (dr === 0 || dr === 6) && dc >= 0 && dc <= 6;
      const left = (dc === 0 || dc === 6) && dr >= 0 && dr <= 6;
      const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      let dark = false;
      if (!onBorder) dark = outer || left || center;
      setModule(work, rr, cc, dark);
    }
  }
}

function drawAlignmentPattern(work: QrMatrixWork, r: number, c: number): void {
  // 5×5: outer ring dark, 1-cell light, single dark center.
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      const onOuter = Math.abs(dr) === 2 || Math.abs(dc) === 2;
      const center = dr === 0 && dc === 0;
      setModule(work, rr, cc, onOuter || center);
    }
  }
}

function drawTimingPatterns(work: QrMatrixWork): void {
  const N = work.size;
  // Horizontal on row 6, vertical on col 6. Skip cells already reserved
  // (finder pattern interiors).
  for (let i = 8; i < N - 8; i++) {
    if (!work.reserved[6][i]) setModule(work, 6, i, i % 2 === 0);
    if (!work.reserved[i][6]) setModule(work, i, 6, i % 2 === 0);
  }
}

function drawDarkModule(work: QrMatrixWork, version: number): void {
  // Spec: dark module always at (4·version + 9, 8) — i.e. row N-8, col 8.
  setModule(work, 4 * version + 9, 8, true);
}

function reserveFormatInfo(work: QrMatrixWork): void {
  const N = work.size;
  // Around top-left finder: row 8 cols 0..8 (minus col 6 which is timing),
  // and col 8 rows 0..8 (minus row 6).
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) work.reserved[8][i] = true;
    if (i !== 6) work.reserved[i][8] = true;
  }
  // Around top-right finder: col 8 of the top, rows on col 8 from right.
  for (let i = 0; i < 8; i++) {
    work.reserved[8][N - 1 - i] = true;
  }
  // Around bottom-left finder.
  for (let i = 0; i < 7; i++) {
    work.reserved[N - 1 - i][8] = true;
  }
}

function reserveVersionInfo(work: QrMatrixWork, version: number): void {
  if (version < 7) return;
  const N = work.size;
  // Two 6×3 strips: rows N-11..N-9 cols 0..5, and cols N-11..N-9 rows 0..5.
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 3; c++) {
      work.reserved[r][N - 11 + c] = true;
      work.reserved[N - 11 + c][r] = true;
    }
  }
}

/** Initialize an N×N matrix with all function patterns and reserved areas. */
export function initMatrix(version: number): QrMatrixWork {
  const size = moduleSideLength(version);
  const work: QrMatrixWork = {
    modules: makeGrid(size, false),
    reserved: makeGrid(size, false),
    size,
  };
  // 3 finders.
  drawFinderPattern(work, 0, 0);
  drawFinderPattern(work, 0, size - 7);
  drawFinderPattern(work, size - 7, 0);
  // Alignment patterns — skip any whose center falls inside a finder area.
  const centers = ALIGNMENT_POSITIONS[version - 1];
  for (const r of centers) {
    for (const c of centers) {
      // Skip the three corner overlaps with finder patterns.
      const inTL = r === 6 && c === 6;
      const inTR = r === 6 && c === size - 7;
      const inBL = r === size - 7 && c === 6;
      if (inTL || inTR || inBL) continue;
      drawAlignmentPattern(work, r, c);
    }
  }
  // Timing + dark + reserved info regions.
  drawTimingPatterns(work);
  drawDarkModule(work, version);
  reserveFormatInfo(work);
  reserveVersionInfo(work, version);
  return work;
}

// ── Function-pattern coordinate getters (pure, no drawing) ──────────
//
// These return positions in RAW matrix space (no quiet zone offset). Consumers
// that need final-canvas coordinates add `quietZone * pxPerCell` themselves.
// They power the per-channel overlay emission in `qrToM0` and are also useful
// for any downstream tool that wants to introspect QR structure.

/** Cell-space rect (matrix coords, no quiet-zone offset). */
export type QrCellRegion = { row: number; col: number; w: number; h: number };

/**
 * Top-left cell of each finder pattern. Always 3 finders at corners; each is
 * 7×7 cells (the surrounding 1-cell separator band is NOT included — see
 * `getSeparatorRegions`).
 */
export function getFinderPatternCells(version: number): Array<{
  corner: "tl" | "tr" | "bl";
  region: QrCellRegion;
}> {
  const size = moduleSideLength(version);
  return [
    { corner: "tl", region: { row: 0, col: 0, w: 7, h: 7 } },
    { corner: "tr", region: { row: 0, col: size - 7, w: 7, h: 7 } },
    { corner: "bl", region: { row: size - 7, col: 0, w: 7, h: 7 } },
  ];
}

/**
 * Center cell of each alignment pattern. v1: []. Each pattern is 5×5 centered
 * on the returned coord. Excludes patterns whose centers would overlap a
 * finder (the canonical 3-corner skip from ISO 18004 Annex E).
 */
export function getAlignmentPatternCenters(version: number): Array<{
  row: number;
  col: number;
}> {
  if (!Number.isInteger(version) || version < 1 || version > 40) {
    throw new Error(`qr/matrix: version must be 1..40, got ${version}`);
  }
  const size = moduleSideLength(version);
  const centers = ALIGNMENT_POSITIONS[version - 1];
  const result: Array<{ row: number; col: number }> = [];
  for (const r of centers) {
    for (const c of centers) {
      const inTL = r === 6 && c === 6;
      const inTR = r === 6 && c === size - 7;
      const inBL = r === size - 7 && c === 6;
      if (inTL || inTR || inBL) continue;
      result.push({ row: r, col: c });
    }
  }
  return result;
}

/**
 * Cell regions covered by each alignment pattern (5×5 outer footprint).
 * Returned in row-major order over the per-version center table.
 */
export function getAlignmentPatternRegions(version: number): QrCellRegion[] {
  return getAlignmentPatternCenters(version).map(({ row, col }) => ({
    row: row - 2,
    col: col - 2,
    w: 5,
    h: 5,
  }));
}

/**
 * Timing-pattern strips: row 6 horizontal (cols 8..N-9) and col 6 vertical
 * (rows 8..N-9). Each is 1 cell wide; length is `N - 16`.
 */
export function getTimingPatternRegions(version: number): {
  horizontal: QrCellRegion;
  vertical: QrCellRegion;
} {
  const N = moduleSideLength(version);
  const len = N - 16; // 8..N-9 inclusive
  return {
    horizontal: { row: 6, col: 8, w: len, h: 1 },
    vertical: { row: 8, col: 6, w: 1, h: len },
  };
}

/** Dark module: a single always-dark cell at `(4·version + 9, 8)`. */
export function getDarkModuleCell(version: number): {
  row: number;
  col: number;
} {
  return { row: 4 * version + 9, col: 8 };
}

/**
 * Format-info regions — 4 L-legs, 2 per instance × 2 instances. Each leg is
 * 1 cell wide. Instance 0 wraps the top-left finder; instance 1 is split
 * between bottom-of-TL-finder-row and right-of-TR-finder-col.
 *
 * The horizontal leg of instance 0 is row 8, cols 0..8 minus col 6 (timing).
 * The vertical leg of instance 0 is col 8, rows 0..8 minus row 6.
 * For instance 1: horizontal leg is row 8, cols N-8..N-1; vertical is col 8,
 * rows N-7..N-1.
 *
 * Returned as bounding-box rects for the leg's overall span. Callers that need
 * the precise per-cell positions (which skip the timing line) should iterate
 * the legs themselves.
 */
export function getFormatInfoRegions(version: number): Array<{
  instance: 0 | 1;
  leg: "h" | "v";
  region: QrCellRegion;
}> {
  const N = moduleSideLength(version);
  return [
    // Instance 0 — wraps the TL finder. H leg owns the corner (8,8) so the
    // V leg is 1 cell shorter to keep the leg pair non-overlapping.
    { instance: 0, leg: "h", region: { row: 8, col: 0, w: 9, h: 1 } },
    { instance: 0, leg: "v", region: { row: 0, col: 8, w: 1, h: 8 } },
    // Instance 1 — split across TR and BL finder neighborhoods. The two
    // instance-1 legs are physically separated by the finder/separator areas
    // so no corner-sharing concern.
    { instance: 1, leg: "h", region: { row: 8, col: N - 8, w: 8, h: 1 } },
    { instance: 1, leg: "v", region: { row: N - 7, col: 8, w: 1, h: 7 } },
  ];
}

/**
 * Version-info regions (v7+ only): two 3×6 blocks. Instance 0 is rows 0..5,
 * cols N-11..N-9 (next to the TR finder). Instance 1 is rows N-11..N-9,
 * cols 0..5 (next to the BL finder). Returns `[]` for v1..v6.
 */
export function getVersionInfoRegions(version: number): Array<{
  instance: 0 | 1;
  region: QrCellRegion;
}> {
  if (version < 7) return [];
  const N = moduleSideLength(version);
  return [
    { instance: 0, region: { row: 0, col: N - 11, w: 3, h: 6 } },
    { instance: 1, region: { row: N - 11, col: 0, w: 6, h: 3 } },
  ];
}

/**
 * Separator regions — the 1-cell light band wrapping each finder. Returned
 * as 6 legs total (2 L-legs per finder × 3 finders). The H leg includes the
 * corner cell (where it joins the V leg) so the V leg is 1 cell shorter; this
 * keeps the leg pair non-overlapping (important for callers that build
 * compact multi-frame overlays).
 */
export function getSeparatorRegions(version: number): Array<{
  corner: "tl" | "tr" | "bl";
  leg: "h" | "v";
  region: QrCellRegion;
}> {
  const N = moduleSideLength(version);
  return [
    // TL: row 7 cols 0..7 (H, owns corner), col 7 rows 0..6 (V, skips corner).
    { corner: "tl", leg: "h", region: { row: 7, col: 0, w: 8, h: 1 } },
    { corner: "tl", leg: "v", region: { row: 0, col: 7, w: 1, h: 7 } },
    // TR: row 7 cols N-8..N-1 (H, owns corner), col N-8 rows 0..6 (V).
    { corner: "tr", leg: "h", region: { row: 7, col: N - 8, w: 8, h: 1 } },
    { corner: "tr", leg: "v", region: { row: 0, col: N - 8, w: 1, h: 7 } },
    // BL: row N-8 cols 0..7 (H, owns corner), col 7 rows N-7..N-1 (V).
    { corner: "bl", leg: "h", region: { row: N - 8, col: 0, w: 8, h: 1 } },
    { corner: "bl", leg: "v", region: { row: N - 7, col: 7, w: 1, h: 7 } },
  ];
}

// ── Codeword interleaving + bit-stream construction ─────────────────

/**
 * Interleave data + EC codewords across RS blocks per the spec, then
 * unpack to a bit stream and append the version's remainder bits.
 */
export function buildCodewordBitStream(
  dataBytes: readonly number[],
  ecc: QrErrorCorrection,
  version: number,
  rsEncode: (data: readonly number[], ecCount: number) => number[],
): number[] {
  const layout = getEccBlocks(version, ecc);
  const blocks: { data: number[]; ec: number[] }[] = [];

  // Split dataBytes into per-block data slices.
  let cursor = 0;
  for (let i = 0; i < layout.group1Blocks; i++) {
    const slice = dataBytes.slice(cursor, cursor + layout.group1Data);
    cursor += layout.group1Data;
    blocks.push({ data: slice, ec: rsEncode(slice, layout.ecPerBlock) });
  }
  for (let i = 0; i < layout.group2Blocks; i++) {
    const slice = dataBytes.slice(cursor, cursor + layout.group2Data);
    cursor += layout.group2Data;
    blocks.push({ data: slice, ec: rsEncode(slice, layout.ecPerBlock) });
  }
  if (cursor !== dataBytes.length) {
    throw new Error(
      `qr/matrix: data bytes ${dataBytes.length} ≠ block-layout total ${cursor}`,
    );
  }

  // Interleave data: at column i, take block.data[i] from each block that has it.
  const maxData = Math.max(layout.group1Data, layout.group2Data);
  const interleavedData: number[] = [];
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) {
      if (i < b.data.length) interleavedData.push(b.data[i]);
    }
  }
  // Interleave EC: all blocks have the same EC length.
  const interleavedEc: number[] = [];
  for (let i = 0; i < layout.ecPerBlock; i++) {
    for (const b of blocks) interleavedEc.push(b.ec[i]);
  }

  // Pack to bits and append remainder.
  const bits: number[] = [];
  for (const byte of [...interleavedData, ...interleavedEc]) {
    for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  }
  const rem = REMAINDER_BITS[version - 1];
  for (let i = 0; i < rem; i++) bits.push(0);
  return bits;
}

// ── Data placement (zigzag) ─────────────────────────────────────────

/**
 * Place data bits onto the matrix via the spec's 2-column zigzag from
 * bottom-right working up. Skips reserved cells. Column 6 (vertical
 * timing) is skipped entirely; data continues in cols 5/4, 3/2, 1/0.
 */
export function placeData(work: QrMatrixWork, bits: readonly number[]): void {
  const N = work.size;
  let bitIdx = 0;
  let upward = true;
  // Walk columns in pairs from right to left. Skip col 6 (the vertical
  // timing pattern) by jumping over it.
  let col = N - 1;
  while (col > 0) {
    if (col === 6) col--; // skip timing column
    for (let i = 0; i < N; i++) {
      const r = upward ? N - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (work.reserved[r][c]) continue;
        if (bitIdx >= bits.length) return;
        work.modules[r][c] = bits[bitIdx] === 1;
        bitIdx++;
      }
    }
    upward = !upward;
    col -= 2;
  }
  if (bitIdx !== bits.length) {
    throw new Error(
      `qr/matrix: placed ${bitIdx} bits, expected ${bits.length} — capacity mismatch?`,
    );
  }
}

// ── Format info + version info (BCH-encoded) ────────────────────────

/** 2-bit ECC indicator per ISO 18004 Table 12. */
function eccBits(ecc: QrErrorCorrection): number {
  switch (ecc) {
    case "L": return 0b01;
    case "M": return 0b00;
    case "Q": return 0b11;
    case "H": return 0b10;
  }
}

/** Format info: 5-bit data → BCH(15,5) → XOR 0x5412 → 15-bit code. */
export function encodeFormatBits(ecc: QrErrorCorrection, mask: number): number {
  if (!Number.isInteger(mask) || mask < 0 || mask > 7) {
    throw new Error(`qr/matrix: mask must be 0..7, got ${mask}`);
  }
  const data = (eccBits(ecc) << 3) | mask; // 5 bits
  // BCH(15, 5) using generator 0b10100110111 (0x537).
  let rem = data;
  for (let i = 0; i < 10; i++) rem <<= 1;
  for (let i = 14; i >= 10; i--) {
    if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
  }
  const code = ((data << 10) | rem) ^ 0x5412;
  return code & 0x7fff;
}

/** Version info (v7+): 6-bit data → BCH(18,6) → 18-bit code. */
export function encodeVersionBits(version: number): number {
  if (version < 7 || version > 40) {
    throw new Error(`qr/matrix: encodeVersionBits requires V7..V40, got ${version}`);
  }
  let rem = version;
  for (let i = 0; i < 12; i++) rem <<= 1;
  for (let i = 17; i >= 12; i--) {
    if (rem & (1 << i)) rem ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | rem;
}

/** Stamp format info bits onto the matrix. Bit 0 is LSB of the 15-bit code. */
export function placeFormatInfo(work: QrMatrixWork, ecc: QrErrorCorrection, mask: number): void {
  const code = encodeFormatBits(ecc, mask);
  const N = work.size;
  // Bit i of the 15-bit code:
  //   bits 0..5  → col 8, rows 0..5 (skipping row 6)  AND  cols N-1..N-7 of row 8
  //   bits 6..14 → col 8, rows 7..14 (skipping rows 6 and N-8..N-1 carefully) AND row 8
  // Use the spec's canonical mapping (matches Nayuki's reference).
  for (let i = 0; i < 15; i++) {
    const bit = ((code >>> i) & 1) === 1;
    // First copy (around top-left finder).
    if (i < 6) work.modules[i][8] = bit;
    else if (i < 8) work.modules[i + 1][8] = bit;
    else if (i < 9) work.modules[8][7] = bit;
    else work.modules[8][14 - i] = bit;
    // Second copy (around top-right and bottom-left finders).
    if (i < 8) work.modules[8][N - 1 - i] = bit;
    else work.modules[N - 15 + i][8] = bit;
  }
  // Dark module is always set; re-mark to be safe.
  work.modules[4 * ((N - 17) / 4) + 9][8] = true;
}

/** Stamp version info bits onto the matrix (v7+ only; no-op otherwise). */
export function placeVersionInfo(work: QrMatrixWork, version: number): void {
  if (version < 7) return;
  const code = encodeVersionBits(version);
  const N = work.size;
  for (let i = 0; i < 18; i++) {
    const bit = ((code >>> i) & 1) === 1;
    const r = Math.floor(i / 3);
    const c = (i % 3) + N - 11;
    work.modules[r][c] = bit;
    work.modules[c][r] = bit; // mirror to the other strip
  }
}
