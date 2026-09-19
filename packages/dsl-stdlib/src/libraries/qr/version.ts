/**
 * QR Code version selection and ECC block tables per ISO 18004.
 *
 * Two reference tables (indexed `[ecc][version - 1]`):
 *   - `ECC_CODEWORDS_PER_BLOCK[ecc][V-1]`: EC codewords per RS block.
 *   - `NUM_ERROR_CORRECTION_BLOCKS[ecc][V-1]`: number of RS blocks.
 *
 * Combined with `TOTAL_CODEWORDS[V-1]` (the QR module-derived total
 * capacity per version), these derive the full block layout — counts and
 * sizes of group-1 and group-2 blocks — that the encoder + matrix
 * placement need.
 *
 * Verified against ISO 18004 Annex C/D and `qrcode` npm package (oracle).
 */

import type { QrEccBlocks, QrErrorCorrection } from "./types";

// Total codewords per version (modules ÷ 8 minus reserved areas). Spec Table 7.
const TOTAL_CODEWORDS: readonly number[] = [
  // V1..V10
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  // V11..V20
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
  // V21..V30
  1156, 1258, 1364, 1474, 1588, 1706, 1828, 1921, 2051, 2185,
  // V31..V40
  2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
];

// EC codewords per block, indexed [ecc][V-1]. ISO 18004 Annex C.
const ECC_CODEWORDS_PER_BLOCK: Record<QrErrorCorrection, readonly number[]> = {
  L: [
    7, 10, 15, 20, 26, 18, 20, 24, 30, 18,
    20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  M: [
    10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
    30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28,
    28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  ],
  Q: [
    13, 22, 18, 26, 18, 24, 18, 22, 20, 24,
    28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
    28, 30, 30, 30, 30, 28, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
  H: [
    17, 28, 22, 16, 22, 28, 26, 26, 24, 28,
    24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
    30, 24, 30, 30, 30, 30, 30, 30, 30, 30,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  ],
};

// Number of RS blocks, indexed [ecc][V-1]. ISO 18004 Annex C.
const NUM_ERROR_CORRECTION_BLOCKS: Record<QrErrorCorrection, readonly number[]> = {
  L: [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 4,
    4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15,
    16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
  ],
  M: [
    1, 1, 1, 2, 2, 4, 4, 4, 5, 5,
    5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29,
    31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
  ],
  Q: [
    1, 1, 2, 2, 4, 4, 6, 6, 8, 8,
    8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
    23, 23, 25, 27, 29, 34, 34, 35, 38, 40,
    43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
  ],
  H: [
    1, 1, 2, 4, 4, 4, 5, 6, 8, 8,
    11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48,
    51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
  ],
};

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1 || version > 40) {
    throw new Error(
      `qr/version: version must be an integer in [1, 40], got ${version}`,
    );
  }
}

/** Module side length (excluding quiet zone) for the given version. */
export function moduleSideLength(version: number): number {
  assertVersion(version);
  return 4 * version + 17;
}

/** Total codewords (bytes) for a given version, across all blocks. */
export function totalCodewords(version: number): number {
  assertVersion(version);
  return TOTAL_CODEWORDS[version - 1];
}

/** EC codewords per block for (version, ecc). */
export function ecCodewordsPerBlock(version: number, ecc: QrErrorCorrection): number {
  assertVersion(version);
  return ECC_CODEWORDS_PER_BLOCK[ecc][version - 1];
}

/** Number of RS blocks for (version, ecc). */
export function numEcBlocks(version: number, ecc: QrErrorCorrection): number {
  assertVersion(version);
  return NUM_ERROR_CORRECTION_BLOCKS[ecc][version - 1];
}

/** Total data codewords (across all blocks) for (version, ecc). */
export function totalDataCodewords(version: number, ecc: QrErrorCorrection): number {
  return totalCodewords(version) - ecCodewordsPerBlock(version, ecc) * numEcBlocks(version, ecc);
}

/**
 * Derive the full QrEccBlocks layout (groups 1 and 2) from the compact
 * `(ecPerBlock, numBlocks)` representation.
 *
 * Total data is split as evenly as possible. The "remainder" blocks (group 2)
 * each carry one extra data codeword over the base size.
 */
export function getEccBlocks(version: number, ecc: QrErrorCorrection): QrEccBlocks {
  const ecPerBlock = ecCodewordsPerBlock(version, ecc);
  const numBlocks = numEcBlocks(version, ecc);
  const dataCodewords = totalDataCodewords(version, ecc);

  // Each block holds either `base` or `base + 1` data codewords. The number
  // of `base + 1` blocks equals dataCodewords mod numBlocks.
  const base = Math.floor(dataCodewords / numBlocks);
  const numLargeBlocks = dataCodewords % numBlocks; // group 2
  const numSmallBlocks = numBlocks - numLargeBlocks; // group 1

  return {
    ecPerBlock,
    group1Blocks: numSmallBlocks,
    group1Data: base,
    group2Blocks: numLargeBlocks,
    group2Data: numLargeBlocks > 0 ? base + 1 : 0,
  };
}

/**
 * Find the smallest version (1..40) whose data capacity in bits is at least
 * `dataBitCount` at the given ECC level. Throws if no version fits.
 *
 * When `requestedVersion` is provided, validates that it can hold the data
 * and returns it unchanged (or throws).
 */
export function selectVersion(
  dataBitCount: number,
  ecc: QrErrorCorrection,
  requestedVersion?: number,
): number {
  if (!Number.isFinite(dataBitCount) || dataBitCount < 0) {
    throw new Error(
      `qr/version: dataBitCount must be a non-negative number, got ${dataBitCount}`,
    );
  }
  if (requestedVersion !== undefined) {
    assertVersion(requestedVersion);
    const cap = totalDataCodewords(requestedVersion, ecc) * 8;
    if (dataBitCount > cap) {
      throw new Error(
        `qr/version: requested version ${requestedVersion} at ECC ${ecc} holds ${cap} bits; need ${dataBitCount}`,
      );
    }
    return requestedVersion;
  }
  for (let v = 1; v <= 40; v++) {
    const cap = totalDataCodewords(v, ecc) * 8;
    if (dataBitCount <= cap) return v;
  }
  throw new Error(
    `qr/version: no QR version can hold ${dataBitCount} bits at ECC ${ecc} (max is V40 at ${totalDataCodewords(40, ecc) * 8} bits)`,
  );
}
