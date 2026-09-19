/**
 * Text → 1D bar sequence for a chosen barcode format.
 *
 * Phase 1 added Code 128; Phase 4 added EAN-13 + UPC-A. The `BarcodeFormat`
 * union dispatches to the right encoder; per-format HRI layout metadata is
 * built here so `barcodeToM0` can emit one labeled splice-point per HRI
 * digit group.
 *
 * Module coordinate space:
 *   x = 0           is the left edge of the canvas (including any quiet zone)
 *   x = modulesWide is the right edge
 *
 * When `quietZoneModules > 0`, the first and last `BarcodeBar` entries are
 * `ink: "light"` quiet-zone bars. The inner bars alternate dark/light per
 * the encoded symbol stream.
 *
 * Pure, deterministic, no I/O.
 */

import { code128Encode } from "./code128";
import { ean13Encode } from "./ean13";
import { upcaEncode } from "./upca";
import type {
  BarcodeBar,
  BarcodeBars,
  BarcodeFormat,
  HriBarsSpec,
} from "./types";

export type BarcodeToBarsOptions = {
  /** Default `"code128"`. */
  format?: BarcodeFormat;
  /**
   * Quiet-zone modules per side. Defaults: code128 = 10 (ISO/IEC 15417
   * minimum), ean13 / upca = 9 (ISO/IEC 15420 — left 9 + right 9 used here
   * for symmetry; the spec allows asymmetric 11 / 7).
   * Set 0 for the raw bar pattern only.
   */
  quietZoneModules?: number;
};

/** Default quiet-zone module count per format. */
const DEFAULT_QUIET_ZONE: Readonly<Record<BarcodeFormat, number>> = {
  code128: 10,
  ean13: 9,
  upca: 9,
};

// ── Per-format encoder dispatch ─────────────────────────────────────

type InnerEncoded = {
  /** Widths of the bar pattern alternating dark/light, starting with dark. */
  widths: number[];
  /** Canonical payload string (may include computed check digits). */
  payload: string;
  /** Numeric symbols in encoder order. */
  encodedSymbols: number[];
  /** Full HRI text with format-specific digit-group separators. */
  humanReadableText: string;
  /**
   * Per-frame HRI layout in CANVAS-module coordinates (the quiet-zone offset
   * is already baked in).
   */
  hriFrames: HriBarsSpec[];
};

function encodeCode128(text: string, quietZoneModules: number): InnerEncoded {
  const r = code128Encode(text);
  return {
    widths: r.widths,
    payload: text,
    encodedSymbols: r.symbols,
    humanReadableText: text,
    // Single frame spanning the inner bar region (post-left-quiet-zone).
    hriFrames: [
      {
        text,
        x: quietZoneModules,
        w: r.modulesWide,
        role: "text",
      },
    ],
  };
}

function encodeEan13(text: string, quietZoneModules: number): InnerEncoded {
  const r = ean13Encode(text);
  const firstDigit = r.payload[0];
  const leftDigits = r.payload.slice(1, 7);
  const rightDigits = r.payload.slice(7, 13);
  // Inner layout in modules (post-left-quiet-zone):
  //   [0, 3)         start guard
  //   [3, 45)        6 left digits  (6 × 7 = 42)
  //   [45, 50)       center guard
  //   [50, 92)       6 right digits (6 × 7 = 42)
  //   [92, 95)       end guard
  return {
    widths: r.widths,
    payload: r.payload,
    encodedSymbols: r.symbols,
    humanReadableText: `${firstDigit} ${leftDigits} ${rightDigits}`,
    hriFrames: [
      // Leading digit sits in the left quiet zone area.
      {
        text: firstDigit,
        x: 0,
        w: quietZoneModules,
        role: "leading",
      },
      // Left 6 digits sit under the 6 L/G-codes (post-start-guard).
      {
        text: leftDigits,
        x: quietZoneModules + 3,
        w: 6 * 7,
        role: "left",
      },
      // Right 6 digits sit under the 6 R-codes (post-center-guard).
      {
        text: rightDigits,
        x: quietZoneModules + 3 + 6 * 7 + 5,
        w: 6 * 7,
        role: "right",
      },
    ],
  };
}

function encodeUpca(text: string, quietZoneModules: number): InnerEncoded {
  const r = upcaEncode(text);
  const firstDigit = r.payload[0];
  const leftMiddleDigits = r.payload.slice(1, 6);
  const rightMiddleDigits = r.payload.slice(6, 11);
  const trailingDigit = r.payload[11];
  // UPC-A standard HRI layout is 1-5-5-1 (smaller outer digits + 10 middle
  // under bars). All 12 digits ARE encoded by bars; the outer 2 are just
  // also reproduced in the quiet zones for readability. Frames:
  //   leading  → in left quiet zone, x=0
  //   left     → under L-codes 2-6 (skip first L-code), starts at QZ + 3 + 7
  //   right    → under R-codes 1-5 (skip last R-code), starts at QZ + 50
  //   trailing → in right quiet zone, x = QZ + 95
  return {
    widths: r.widths,
    payload: r.payload,
    encodedSymbols: r.symbols,
    humanReadableText: `${firstDigit} ${leftMiddleDigits} ${rightMiddleDigits} ${trailingDigit}`,
    hriFrames: [
      {
        text: firstDigit,
        x: 0,
        w: quietZoneModules,
        role: "leading",
      },
      {
        text: leftMiddleDigits,
        x: quietZoneModules + 3 + 7,
        w: 5 * 7,
        role: "left",
      },
      {
        text: rightMiddleDigits,
        x: quietZoneModules + 3 + 6 * 7 + 5,
        w: 5 * 7,
        role: "right",
      },
      {
        text: trailingDigit,
        x: quietZoneModules + 95,
        w: quietZoneModules,
        role: "trailing",
      },
    ],
  };
}

function encodeForFormat(
  text: string,
  format: BarcodeFormat,
  quietZoneModules: number,
): InnerEncoded {
  switch (format) {
    case "code128":
      return encodeCode128(text, quietZoneModules);
    case "ean13":
      return encodeEan13(text, quietZoneModules);
    case "upca":
      return encodeUpca(text, quietZoneModules);
  }
}

// ── Main ────────────────────────────────────────────────────────────

export function barcodeToBars(
  text: string,
  opts: BarcodeToBarsOptions = {},
): BarcodeBars {
  const format: BarcodeFormat = opts.format ?? "code128";
  const quietZoneModules = opts.quietZoneModules ?? DEFAULT_QUIET_ZONE[format];
  if (!Number.isInteger(quietZoneModules) || quietZoneModules < 0) {
    throw new Error(
      `barcodeToBars: quietZoneModules must be a non-negative integer, got ${quietZoneModules}`,
    );
  }

  const encoded = encodeForFormat(text, format, quietZoneModules);
  const { widths, payload, encodedSymbols, humanReadableText, hriFrames } = encoded;
  let innerModules = 0;
  for (const w of widths) innerModules += w;

  const bars: BarcodeBar[] = [];
  let cursor = 0;

  if (quietZoneModules > 0) {
    bars.push({ x: cursor, widthModules: quietZoneModules, ink: "light" });
    cursor += quietZoneModules;
  }

  // Inner bar sequence always alternates dark/light starting with dark for
  // every supported format (Code 128 start codes begin with a dark bar;
  // EAN-13 / UPC-A start guard begins with a dark bar).
  let ink: BarcodeBar["ink"] = "dark";
  for (const w of widths) {
    bars.push({ x: cursor, widthModules: w, ink });
    cursor += w;
    ink = ink === "dark" ? "light" : "dark";
  }

  if (quietZoneModules > 0) {
    bars.push({ x: cursor, widthModules: quietZoneModules, ink: "light" });
    cursor += quietZoneModules;
  }

  const modulesWide = innerModules + 2 * quietZoneModules;
  if (cursor !== modulesWide) {
    throw new Error(
      `barcodeToBars: internal width mismatch — cursor=${cursor}, expected=${modulesWide}`,
    );
  }

  return {
    format,
    modulesWide,
    quietZoneModules,
    bars,
    payload,
    humanReadableText,
    hriFrames,
    encodedSymbols,
  };
}
