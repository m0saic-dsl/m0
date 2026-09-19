import type { M0String, StableKey } from "@m0saic/dsl";

// ── Public API types ────────────────────────────────────────────────

/** QR Code error-correction level per ISO 18004. */
export type QrErrorCorrection = "L" | "M" | "Q" | "H";

/**
 * Named overlay channels emitted by `qrToM0` when enabled. Each channel
 * occupies a fixed relative position in the m0 (see `qrToM0` docs for ordering).
 *
 * `data` is the always-present base grid. `safeArea` is driven by the existing
 * `safeArea` option (not the `channels` map). The rest are opt-in via `channels`.
 */
export type QrChannel =
  | "data"
  | "eyes"
  | "alignmentPatterns"
  | "safeArea"
  | "timingPatterns"
  | "formatInfo"
  | "versionInfo"
  | "darkModule"
  | "separators"
  | "quietZone";

/**
 * One frame within an emitted channel. `bounds` is in final-canvas pixel
 * coordinates (quiet-zone included). `cellBounds` is in raw matrix coordinates
 * (no quiet-zone offset) so callers can correlate with the underlying matrix.
 */
export type QrFramePtr = {
  stableKey: StableKey;
  bounds: { x: number; y: number; width: number; height: number };
  cellBounds: { row: number; col: number; w: number; h: number };
};

export type QrChannelOutput = {
  channel: QrChannel;
  /** 0 = base; 1+ = overlay nesting depth in the m0 (relative position among
   * enabled channels — not absolute). */
  layerIndex: number;
  frames: QrFramePtr[];
};

/**
 * Per-channel emission config. `true` (or `{ emit: true }`) marks the region
 * as a structural overlay — a logical-owner `-{<canonical pattern>}` rect
 * carrying the channel's stableKey + label. The underlying cells are always
 * suppressed from the base grid (the canonical pattern in the overlay paints
 * them instead), so no double-painting is possible.
 *
 * Caveat: channels whose canonical content has no dark cells (currently
 * `separators` — pure-light strips around each eye) are silently skipped.
 * Logical owners need *something* that paints, and the m0 grammar rejects
 * an empty `-{}` for the same reason a layer with no `1`/`F` is invalid.
 * Callers needing to address an all-light region can derive its bounds
 * from the neighbouring channel's stableKey (e.g. the eye + 1-cell
 * padding for separators).
 */
export type QrChannelConfig =
  | boolean
  | {
      emit?: boolean;
      /**
       * Suppress the channel's region cells from the BASE layer (emit `-`
       * instead of `1`), leaving the anchor as the region's ONLY paint site.
       *
       * Default `false` — the base keeps the canonical modules so the QR
       * scans regardless of what (if anything) is spliced into the anchor.
       * Set `true` only when the caller GUARANTEES it splices a visual that
       * fully repaints the region (e.g. the rounded-eye child doc): without
       * suppression, styled base modules (circle dots) peek out past the
       * spliced visual's rounded corners; with it, the region under the
       * splice is clean background.
       */
      suppressBase?: boolean;
    };

/** Behaviour of the optional centred safe area (typically holds a logo). */
export type QrSafeAreaMode =
  /** No safe area carved. Modules fill the entire canvas. */
  | "none"
  /** Compute math and return bounds, but don't carve the cells. */
  | "bounds"
  /** Carve the centre region: mask modules from the cutout in the base layer
   * and emit a labeled overlay frame the caller can splice content into. */
  | "carve";

export type QrSafeAreaConfig = {
  mode: QrSafeAreaMode;
  /** Padding between QR modules and the safe-area inner rect, as % of
   * safe-area max dim. Default 0. Range 0..50. */
  paddingPct?: number;
  /** Target inner safe-area size in final-canvas pixels. */
  size?: { width: number; height: number };
};

export type QrToM0Options = {
  /** Default "M". */
  errorCorrectionLevel?: QrErrorCorrection;
  /** Quiet-zone modules per side. ISO 18004 spec says ≥4. Default 4. */
  quietZoneModules?: number;
  /** Default `{ mode: "none" }`. */
  safeArea?: QrSafeAreaConfig;
  /** Force a specific QR version (1-40). Default: smallest version that fits. */
  version?: number;
  /**
   * Opt in to structural overlay channels. All channels default disabled.
   * Each enabled channel emits a `-{<canonical pattern>}` rect at the region's
   * position — the `-` is a logical-owner anchor (carries the stableKey, label,
   * and mask target without painting) and the `{<canonical>}` overlay paints
   * the real QR pattern. The rendered output is identical to channels-off;
   * flipping a channel on just adds a structural handle for the region. The
   * QR is always scannable regardless of how many channels are enabled.
   *
   * When enabled, channels appear in the m0 in fixed relative order:
   * eyes → alignmentPatterns → timingPatterns → formatInfo → versionInfo →
   * darkModule → separators. The safeArea channel is driven by the existing
   * `safeArea` option (not this map) and always sits at the deepest position
   * when active.
   */
  channels?: Partial<Record<
    Exclude<QrChannel, "data" | "safeArea">,
    QrChannelConfig
  >>;
  /**
   * Engine-perf optimization: collapse remaining dark cells into the smallest
   * set of overlay rects so the engine renders fewer ffmpeg intermediates.
   * Visual output is identical; only frame count drops. Default false.
   *
   * Compatible with channels: structural channel suppression applies first,
   * then packing runs on the remaining base-grid dark cells. Packed rects
   * appear on the data channel as frames labeled `qr-pack-{i}`.
   */
  pack?: boolean | { strategy?: "rowwise" };
};

export type QrSafeAreaBounds = { x: number; y: number; width: number; height: number };

export type QrToM0Result = {
  m0: M0String;
  /** Final canvas pixel dimensions. */
  canvasW: number;
  canvasH: number;
  /** QR matrix side length (modules-only, no quiet zone). */
  matrixSize: number;
  /** Quiet-zone modules per side. */
  quietZone: number;
  /** QR version selected (1-40). */
  version: number;
  /** ECC level actually applied. */
  errorCorrectionLevel: QrErrorCorrection;
  /**
   * Enabled channels in m0 composition order. Always present; empty when no
   * channels are enabled and safeArea isn't carved. The `data` channel is
   * always present at index 0.
   */
  channels: QrChannelOutput[];
  /** Same channel data, keyed by role for fast lookup. */
  channelByRole: Partial<Record<QrChannel, QrChannelOutput>>;
  /**
   * Stable-key → human-readable label map for every overlay-channel frame.
   * Used by `qrToM0c` to attach m0c labels for drag-into-Layout inspection.
   * Base-grid (`data`) cells are NOT labeled (would be 100s of entries).
   */
  labels: Record<StableKey, string>;
  /**
   * Inner safe-area bounds in final-canvas pixels. Present when
   * `safeArea.mode !== "none"`. Same data is also at
   * `channelByRole.safeArea?.frames[0].bounds` when carve mode is on.
   */
  safeAreaBounds?: QrSafeAreaBounds;
  /**
   * StableKey of the safe-area frame in the overlay layer. Present when
   * `safeArea.mode === "carve"`. Same as
   * `channelByRole.safeArea?.frames[0].stableKey`.
   */
  safeAreaStableKey?: StableKey;
};

// ── Internal types (still exported so tests and the QR pipeline can share) ──

export type QrMatrix = {
  /** boolean[][] indexed as [row][col]. true = dark module. Includes quiet zone. */
  modules: boolean[][];
  /** Side length INCLUDING quiet zone. */
  size: number;
  /** Quiet-zone modules per side. */
  quietZone: number;
  /** QR version (1-40). */
  version: number;
  /** ECC level applied. */
  errorCorrectionLevel: QrErrorCorrection;
};

/** A QR data segment (one input string fragment in a particular encoding mode). */
export type QrSegmentMode = "numeric" | "alphanumeric" | "byte";

/** ECC codeword + block layout per (version, level). Looked up from a table. */
export type QrEccBlocks = {
  /** EC codewords per block. */
  ecPerBlock: number;
  /** Block group 1: count of blocks. */
  group1Blocks: number;
  /** Block group 1: data codewords per block. */
  group1Data: number;
  /** Block group 2: count of blocks (may be 0). */
  group2Blocks: number;
  /** Block group 2: data codewords per block. */
  group2Data: number;
};
