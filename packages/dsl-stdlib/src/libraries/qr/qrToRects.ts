/**
 * Text → array of 1×1 rects (one per dark module) in canonical cell units.
 *
 * Accepts any string the QR encoder can carry (URL, plain text, structured
 * payload, etc.); mode is auto-selected for compactness.
 *
 * Lower-level escape hatch for callers who want to feed QR modules into
 * `rectsToM0` (e.g. for multi-rect packing) instead of using the canonical
 * uniform-NxN emission that `qrToM0` provides.
 *
 * Coordinates include the quiet zone (i.e. a rect at (0, 0) means the
 * top-left corner of the quiet-zone band, NOT the first QR module).
 *
 * Pure, deterministic, no I/O.
 */

import { qrToMatrix } from "./qrToMatrix";
import type { QrErrorCorrection } from "./types";

export type QrToRectsOptions = {
  errorCorrectionLevel?: QrErrorCorrection;
  version?: number;
  quietZoneModules?: number;
};

export type QrCellRect = { x: number; y: number; w: number; h: number };

export function qrToRects(text: string, opts: QrToRectsOptions = {}): QrCellRect[] {
  const matrix = qrToMatrix(text, opts);
  const rects: QrCellRect[] = [];
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.modules[r][c]) {
        rects.push({ x: c, y: r, w: 1, h: 1 });
      }
    }
  }
  return rects;
}
