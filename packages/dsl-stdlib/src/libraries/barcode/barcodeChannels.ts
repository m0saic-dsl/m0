/**
 * Per-channel region resolvers for `barcodeToM0`.
 *
 * Channels are pure structural anchors — they emit `-{-}` logical-owner
 * rectangles that carry a stableKey + label but don't paint. The base layer
 * keeps painting underneath. Templates that want a per-channel visual (e.g.
 * a colored quiet zone, a highlighted start guard) splice their own content
 * into the anchor via `replaceNodeByStableId`.
 *
 * Regions are returned in module-grid coordinates (no canvas pixel scaling):
 *   x ∈ [0, modulesWide)
 *   y ∈ [0, heightModules + hriHeightModules)
 *
 * Mirrors `qr/qrToM0.ts`'s `regionsForChannel` shape — one labeled rect per
 * region — but barcode regions are simpler (no version-dependent tables).
 *
 * Pure, deterministic, no I/O.
 */

import type { Code128Encoded } from "./code128";
import { CODE128_STOP } from "./code128";
import type { BarcodeBars, BarcodeCellBounds, BarcodeFormat } from "./types";

/** A region tagged with its intended human-readable label for m0c output. */
export type LabeledRegion = { region: BarcodeCellBounds; label: string };

/** Width in modules of a single Code 128 data/start symbol. */
const CODE128_SYMBOL_MODULES = 11;
/** Width in modules of the Code 128 stop symbol. */
const CODE128_STOP_MODULES = 13;

export type StructuralChannel =
  | "quietZoneLeft"
  | "quietZoneRight"
  | "startGuard"
  | "stopGuard";

/**
 * Fixed composition order for structural channels. Whichever subset is
 * enabled appears in this order. `humanReadable` is driven by the
 * `humanReadable` option (not the structural channels map) and always sits
 * at the deepest layer position when carved.
 */
export const STRUCTURAL_CHANNEL_ORDER: readonly StructuralChannel[] = [
  "quietZoneLeft",
  "quietZoneRight",
  "startGuard",
  "stopGuard",
];

export type ChannelContext = {
  format: BarcodeFormat;
  /** Module width of the bar region's content (excludes both quiet zones). */
  innerModules: number;
  modulesWide: number;
  quietZoneModules: number;
  heightModules: number;
};

export function regionsForChannel(
  channel: StructuralChannel,
  ctx: ChannelContext,
): LabeledRegion[] {
  const { quietZoneModules: QZ, modulesWide, heightModules } = ctx;

  switch (channel) {
    case "quietZoneLeft":
      if (QZ <= 0) return [];
      return [
        {
          region: { row: 0, col: 0, w: QZ, h: heightModules },
          label: "barcode-quiet-zone-left",
        },
      ];

    case "quietZoneRight":
      if (QZ <= 0) return [];
      return [
        {
          region: {
            row: 0,
            col: modulesWide - QZ,
            w: QZ,
            h: heightModules,
          },
          label: "barcode-quiet-zone-right",
        },
      ];

    case "startGuard": {
      // The Start code symbol sits immediately after the left quiet zone.
      // For Code 128 it's exactly one symbol (11 modules).
      if (ctx.format !== "code128") return [];
      return [
        {
          region: {
            row: 0,
            col: QZ,
            w: CODE128_SYMBOL_MODULES,
            h: heightModules,
          },
          label: "barcode-start-guard",
        },
      ];
    }

    case "stopGuard": {
      // The Stop symbol sits immediately before the right quiet zone.
      // For Code 128 it's 13 modules wide.
      if (ctx.format !== "code128") return [];
      const stopX = modulesWide - QZ - CODE128_STOP_MODULES;
      return [
        {
          region: {
            row: 0,
            col: stopX,
            w: CODE128_STOP_MODULES,
            h: heightModules,
          },
          label: "barcode-stop-guard",
        },
      ];
    }
  }
}

/**
 * Sanity check: the start/stop guard regions should agree with the actual
 * encoded symbol positions. Exposed for tests.
 */
export function verifyGuardAlignment(
  bars: BarcodeBars,
  encoded: Code128Encoded,
): void {
  if (encoded.symbols.length < 3) {
    throw new Error(
      `barcodeChannels: too few symbols to verify guards (${encoded.symbols.length})`,
    );
  }
  if (encoded.symbols[encoded.symbols.length - 1] !== CODE128_STOP) {
    throw new Error(
      `barcodeChannels: last symbol is not Stop (got ${encoded.symbols[encoded.symbols.length - 1]})`,
    );
  }
  // Inner bar width should equal 11 * (symbols.length - 1) + 13.
  const innerWidth = bars.modulesWide - 2 * bars.quietZoneModules;
  const expected = CODE128_SYMBOL_MODULES * (encoded.symbols.length - 1) + CODE128_STOP_MODULES;
  if (innerWidth !== expected) {
    throw new Error(
      `barcodeChannels: inner bar width ${innerWidth} != expected ${expected}`,
    );
  }
}

export const CODE128_GUARD_WIDTHS = {
  symbolModules: CODE128_SYMBOL_MODULES,
  stopModules: CODE128_STOP_MODULES,
} as const;
