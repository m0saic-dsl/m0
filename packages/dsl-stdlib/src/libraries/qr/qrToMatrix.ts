/**
 * Text → boolean[][] QR module matrix.
 *
 * Accepts any string the QR encoder can carry (URL, plain text, wifi
 * credentials, vCard, etc.); mode is auto-selected for compactness.
 *
 * The full QR encoder pipeline composed end-to-end:
 *   1. `buildBitStream`   text → mode-selected, version-selected, padded data codewords.
 *   2. `buildCodewordBitStream` Interleave data+EC across RS blocks; append remainder bits.
 *   3. `initMatrix`        Function patterns + reserved regions for the picked version.
 *   4. `placeData`         Zigzag the bit stream onto non-reserved cells.
 *   5. `chooseBestMask`    Try all 8 masks (with matching format-info each), pick lowest penalty.
 *   6. `placeVersionInfo`  v7+ version-info bits.
 *   7. Wrap with the quiet zone (configurable; default 4 modules per side per spec).
 *
 * Pure, deterministic, no I/O. Output is a `QrMatrix` ready for `qrToM0` or `qrToRects`.
 */

import { buildBitStream } from "./encoder";
import {
  buildCodewordBitStream,
  encodeFormatBits,
  initMatrix,
  placeData,
  placeVersionInfo,
} from "./matrix";
import { chooseBestMask } from "./mask";
import { computeRsCodewords } from "./reedSolomon";
import type { QrErrorCorrection, QrMatrix } from "./types";

export type QrToMatrixOptions = {
  /** Default "M". */
  errorCorrectionLevel?: QrErrorCorrection;
  /** Force a specific QR version (1-40). Default: smallest version that fits. */
  version?: number;
  /** Quiet-zone modules per side. Default 4 (per spec). Set 0 for raw matrix. */
  quietZoneModules?: number;
};

/**
 * Stamp format-info bits directly into a modules array (no `QrMatrixWork`
 * wrapper). Used inside `chooseBestMask`'s candidate evaluation — each
 * candidate gets its own format-info encoding because the mask number is
 * part of the format string.
 */
function stampFormatInfoBits(
  modules: boolean[][],
  ecc: QrErrorCorrection,
  mask: number,
  version: number,
): void {
  const code = encodeFormatBits(ecc, mask);
  const N = modules.length;
  for (let i = 0; i < 15; i++) {
    const bit = ((code >>> i) & 1) === 1;
    // First copy — around the top-left finder.
    if (i < 6) modules[i][8] = bit;
    else if (i < 8) modules[i + 1][8] = bit;
    else if (i < 9) modules[8][7] = bit;
    else modules[8][14 - i] = bit;
    // Second copy — around the top-right and bottom-left finders.
    if (i < 8) modules[8][N - 1 - i] = bit;
    else modules[N - 15 + i][8] = bit;
  }
  // Dark module (always set). 4v+9 = N-8 since N = 4v+17.
  modules[4 * version + 9][8] = true;
}

export function qrToMatrix(text: string, opts: QrToMatrixOptions = {}): QrMatrix {
  const ecc: QrErrorCorrection = opts.errorCorrectionLevel ?? "M";
  const quietZone = opts.quietZoneModules ?? 4;
  if (!Number.isInteger(quietZone) || quietZone < 0) {
    throw new Error(`qrToMatrix: quietZoneModules must be a non-negative integer, got ${quietZone}`);
  }

  // 1-2: encode + interleave.
  const encoded = buildBitStream(text, ecc, { version: opts.version });
  const { data, version, errorCorrectionLevel } = encoded;
  const bits = buildCodewordBitStream(data, ecc, version, computeRsCodewords);

  // 3-4: matrix init + data placement.
  const work = initMatrix(version);
  placeData(work, bits);

  // 5: choose best mask; the result already has the mask + format info baked in.
  const { modules: masked } = chooseBestMask(work, (modules, m) => {
    stampFormatInfoBits(modules, ecc, m, version);
  });
  work.modules = masked;

  // 6: version info (v7+).
  placeVersionInfo(work, version);

  // 7: add quiet zone band (default 4 cells per side).
  const finalSize = work.size + 2 * quietZone;
  const finalModules: boolean[][] = Array.from(
    { length: finalSize },
    () => new Array<boolean>(finalSize).fill(false),
  );
  for (let r = 0; r < work.size; r++) {
    for (let c = 0; c < work.size; c++) {
      finalModules[r + quietZone][c + quietZone] = work.modules[r][c];
    }
  }

  return {
    modules: finalModules,
    size: finalSize,
    quietZone,
    version,
    errorCorrectionLevel,
  };
}
