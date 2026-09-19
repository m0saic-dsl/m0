/**
 * Barcode public-API types.
 *
 * Mirrors the QR convention (`libraries/qr/types.ts`) but for 1D barcodes.
 * Phase 1 covers Code 128 only; the `BarcodeFormat` union is structured to
 * accept additional formats (EAN-13 / UPC-A in Phase 4) as a pure additive
 * extension.
 *
 * Algorithmic reference (Code 128): ISO/IEC 15417:2007.
 * Cross-verification reference: JsBarcode by Johan Lindell (MIT,
 * github.com/lindell/JsBarcode). Used as offline oracle only — no runtime
 * or test-time dependency.
 */

import type { M0String, StableKey } from "@m0saic/dsl";

// ── Format ──────────────────────────────────────────────────────────

/**
 * Supported barcode symbology.
 *   - `"code128"` — variable-length alphanumeric (Phase 1).
 *   - `"ean13"`   — 13-digit product code (Phase 4).
 *   - `"upca"`    — 12-digit product code (Phase 4); structurally EAN-13
 *                   with an implicit leading "0".
 */
export type BarcodeFormat = "code128" | "ean13" | "upca";

// ── Bar model ───────────────────────────────────────────────────────

/**
 * One bar in the rendered barcode sequence. Bars alternate `dark`/`light`
 * left-to-right and tile the full canvas width (no gaps). When
 * `quietZoneModules > 0`, the first bar is a `light` quiet-zone bar and the
 * last bar is also `light`; the inner symbol bars are wedged between.
 */
export type BarcodeBar = {
  /** Module position from canvas left edge. */
  x: number;
  /** Bar width in modules. For Code 128, widths ∈ {1, 2, 3, 4}. */
  widthModules: number;
  /** Ink color. Bars strictly alternate, so this is derivable from index but
   * carried explicitly for ergonomics. */
  ink: "dark" | "light";
};

/**
 * One HRI text frame in module-grid coordinates (returned by `barcodeToBars`).
 * For Code 128 there is exactly one frame spanning the inner bar region.
 * For EAN-13 / UPC-A there are 3 / 4 frames respectively (digit-grouped).
 */
export type HriBarsSpec = {
  /** Sub-segment of HRI text to draw in this frame. */
  text: string;
  /** Module position from canvas left edge (after any quiet-zone offset). */
  x: number;
  /** Width in modules. */
  w: number;
  /**
   * Label suffix for `barcodeToM0`'s output. Frame roles:
   *   - `"text"`     — Code 128 single frame
   *   - `"leading"`  — leading digit (EAN-13 / UPC-A)
   *   - `"left"`     — left-half digit group
   *   - `"right"`    — right-half digit group
   *   - `"trailing"` — trailing check digit (UPC-A only)
   */
  role: "text" | "leading" | "left" | "right" | "trailing";
};

/**
 * Output of `barcodeToBars`. The full bar pattern in module units, before any
 * pixel-scaling or m0 emission. `barcodeToRects` derives dark-only rects from
 * this; `barcodeToM0` (Phase 2) composes the m0 string from this.
 */
export type BarcodeBars = {
  format: BarcodeFormat;
  /** Total canvas width in modules (includes both quiet zones when present). */
  modulesWide: number;
  /** Quiet-zone modules per side. */
  quietZoneModules: number;
  /** Every bar left-to-right; alternates dark/light. */
  bars: BarcodeBar[];
  /** Final payload after any format-specific normalization (e.g. check digit
   * appended for EAN-13/UPC-A). For Code 128, equal to the input. */
  payload: string;
  /** Full human-readable interpretation (HRI) text, with format-specific
   * digit-group separators. Surfaced for callers that just want the printable
   * caption; multi-frame layout uses `hriFrames` instead. */
  humanReadableText: string;
  /**
   * Per-frame HRI layout. Length 1 for Code 128; length 3 for EAN-13;
   * length 4 for UPC-A. Frames are left-to-right; `x` is in canvas-module
   * coordinates (after the quiet-zone offset has been applied).
   */
  hriFrames: HriBarsSpec[];
  /** Symbol values in encoder order. For Code 128:
   * `[start, ...data, checksum, stop]`. For EAN-13: 13 digits. For UPC-A:
   * 12 digits. */
  encodedSymbols: number[];
};

// ── Rect model (dark bars only, for engine packing) ──────────────────

/**
 * One rectangle covering a contiguous dark bar. Coordinates are in module
 * units; `y` is always 0 and `h` is always 1 (caller scales to pixels via
 * `heightPx` × `moduleWidthPx`). `w` matches the bar's `widthModules`.
 */
export type BarcodeCellRect = { x: number; y: number; w: number; h: number };

// ── Channel surface ────────────────────────────────────────────────

/**
 * Named overlay channels emitted by `barcodeToM0` when enabled.
 *
 * `bars` is the always-present base channel (analogous to QR's `data`).
 * `humanReadable` is driven by the `humanReadable` option (not the
 * `channels` map) and sits at the deepest position when carved.
 * The rest are opt-in via `channels`.
 */
export type BarcodeChannel =
  | "bars"
  | "quietZoneLeft"
  | "quietZoneRight"
  | "startGuard"
  | "stopGuard"
  | "humanReadable";

/** Per-channel emission config. `true` (or `{ emit: true }`) enables the channel. */
export type BarcodeChannelConfig = boolean | { emit?: boolean };

export type BarcodeBounds = { x: number; y: number; width: number; height: number };

/** Pixel bounds in module coordinates (for reference / verification). */
export type BarcodeCellBounds = { row: number; col: number; w: number; h: number };

/** One labeled frame within an emitted channel. */
export type BarcodeFramePtr = {
  stableKey: StableKey;
  bounds: BarcodeBounds;
  cellBounds: BarcodeCellBounds;
};

export type BarcodeChannelOutput = {
  channel: BarcodeChannel;
  /** 0 = base; 1+ = overlay nesting depth (relative position among enabled channels). */
  layerIndex: number;
  frames: BarcodeFramePtr[];
};

// ── Human-readable interpretation (HRI) carve ───────────────────────

/** HRI band rendering mode. */
export type HumanReadableMode =
  /** No HRI band. Canvas height = bars height. */
  | "none"
  /** Reserve HRI band space in the canvas but don't carve a splice-point. */
  | "bounds"
  /** Reserve HRI band space AND emit a labeled splice-point F that templates can
   * splice a text source into via `replaceNodeByStableId`. */
  | "carve";

/**
 * HRI band configuration.
 *
 * When `mode === "bounds" | "carve"`, the HRI band height is set by either
 * `heightPx` (absolute, takes precedence) or `heightPct` (proportional to the
 * bar region's pixel height). If both are unset, `heightPct` defaults to 0.15.
 */
export type HumanReadableSpec =
  | { mode: "none" }
  | { mode: "bounds" | "carve"; heightPct?: number; heightPx?: number };

/**
 * One HRI frame returned in the result. For Code 128 the array has length 1.
 * For EAN-13 / UPC-A (Phase 4) the array has length 3 (leading digit, left
 * group, right group). `stableKey` is present only in carve mode.
 */
export type BarcodeHriFrame = {
  /** Sub-segment of HRI text to draw in this frame. */
  text: string;
  /** Pixel bounds within the canvas. */
  bounds: BarcodeBounds;
  /** StableKey of the splice-point F (carve mode only). */
  stableKey?: StableKey;
};

// ── Top-level options + result ──────────────────────────────────────

export type BarcodeToM0Options = {
  /** Default `"code128"`. */
  format?: BarcodeFormat;
  /** Pixels per module (both axes — cells are square). Default 2. */
  moduleWidthPx?: number;
  /** Bar region height in pixels. Rounded to nearest multiple of `moduleWidthPx`.
   * Default 80. */
  heightPx?: number;
  /** Quiet-zone modules per side. Default 10 (Code 128 minimum per ISO/IEC 15417). */
  quietZoneModules?: number;
  /** HRI band config. Default `{ mode: "none" }` for Code 128.
   * Phase 4 will default to `{ mode: "carve" }` for product-code formats. */
  humanReadable?: HumanReadableSpec;
  /** Opt-in structural overlay channels. All channels default disabled. */
  channels?: Partial<Record<
    Exclude<BarcodeChannel, "bars" | "humanReadable">,
    BarcodeChannelConfig
  >>;
};

export type BarcodeToM0Result = {
  m0: M0String;
  /** Final canvas pixel dimensions. */
  canvasW: number;
  canvasH: number;
  format: BarcodeFormat;
  /** Total bar-region width in modules (includes both quiet zones). */
  modulesWide: number;
  quietZoneModules: number;
  /** Final payload after any format-specific normalization. */
  payload: string;
  /** Human-readable interpretation text — the digits/chars for templates to draw. */
  humanReadableText: string;
  /**
   * Enabled channels in m0 composition order. Always present; `bars` is
   * always at index 0.
   */
  channels: BarcodeChannelOutput[];
  /** Same channel data, keyed by role for fast lookup. */
  channelByRole: Partial<Record<BarcodeChannel, BarcodeChannelOutput>>;
  /** Stable-key → human-readable label map for every overlay-channel frame. */
  labels: Record<StableKey, string>;
  /**
   * HRI frames. Empty when `humanReadable.mode === "none"`. Length 1 for
   * Code 128; length 3 for EAN-13 / UPC-A (Phase 4). `stableKey` is present
   * only in `carve` mode.
   */
  humanReadableFrames: BarcodeHriFrame[];
};

// Re-export DSL types used by downstream phases.
export type { M0String, StableKey };
