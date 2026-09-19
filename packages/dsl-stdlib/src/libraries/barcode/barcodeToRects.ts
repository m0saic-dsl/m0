/**
 * Text → array of dark-only rects in module coordinates.
 *
 * Lower-level escape hatch for callers who want raw rect geometry without
 * the m0 wrapping. Mirrors `qrToRects`, but each rect's `w` equals the bar's
 * variable width in modules (Code 128 bars are 1–4 modules wide) — there is
 * no "1×1 module per rect" form for barcodes because bars natively run
 * multi-module-wide and splitting them serves no purpose.
 *
 * Coordinates include any quiet zone (`x = 0` is the left edge of the full
 * canvas, NOT the first dark bar).
 *
 * Each rect spans the entire bar height conceptually — `y` is always 0 and
 * `h` is always 1 in module units. The caller multiplies by the desired
 * `heightPx` to project into pixel space.
 *
 * Pure, deterministic, no I/O.
 */

import { barcodeToBars } from "./barcodeToBars";
import type { BarcodeCellRect, BarcodeFormat } from "./types";

export type BarcodeToRectsOptions = {
  format?: BarcodeFormat;
  quietZoneModules?: number;
};

export function barcodeToRects(
  text: string,
  opts: BarcodeToRectsOptions = {},
): BarcodeCellRect[] {
  const result = barcodeToBars(text, opts);
  const rects: BarcodeCellRect[] = [];
  for (const bar of result.bars) {
    if (bar.ink === "dark") {
      rects.push({ x: bar.x, y: 0, w: bar.widthModules, h: 1 });
    }
  }
  return rects;
}
