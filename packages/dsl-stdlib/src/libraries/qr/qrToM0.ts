/**
 * Text → validated `M0String` with optional centred safe-area carve AND
 * optional structural-overlay channels.
 *
 * The first argument is any string the QR encoder accepts (URLs, plain text,
 * wifi credentials, vCard payloads, etc.). Mode (numeric / alphanumeric /
 * byte) is auto-selected for the most compact encoding. See `qrPayloadWifi`
 * etc. for canonical builders for structured payloads.
 *
 * The canonical headline export of the in-house QR module. Composition:
 *
 *   Layer 0 (base):       Uniform NxN nested grid. Cells emit `1` (dark
 *                         module) or `-` (light / quiet-zone / suppressed-by-
 *                         enabled-channel / safe-area cutout).
 *   Layer 1+ (overlays):  One layer per enabled channel, in fixed relative
 *                         order: eyes → alignmentPatterns → timingPatterns
 *                         → formatInfo → versionInfo → darkModule
 *                         → separators. Then `quiet-zone` (always emitted)
 *                         as four labeled bands on its own layer. SafeArea
 *                         (driven by the existing `safeArea` option, not the
 *                         `channels` map) sits at the deepest position
 *                         when enabled.
 *
 * Composition: brace-nested. e.g. `base{eyes{align{safeArea}}}` when all
 * are enabled. Empty channels are not emitted.
 *
 * Per-channel behaviour: each enabled channel emits a `-{<canonical pattern>}`
 * logical-owner rect at the region's position. The `-` carries the
 * stableKey + label + mask target (without painting); the `{<canonical>}`
 * overlay paints the real QR pattern the encoder computed. Underlying base
 * cells at the region are suppressed so nothing double-paints. Visual output
 * with channels on is identical to channels off — the channels API is purely
 * a structural-marker layer.
 *
 * Timing patterns are split into two sub-layers (H and V) because their
 * regions mutually subdivide each other's spans — keeping each on its own
 * layer preserves `one anchor per region`. Other channels with intra-channel
 * conflicts will be split similarly if/when that comes up.
 *
 * Pure, deterministic, no I/O. Pairs with `qrToMatrix` (raw matrix) and
 * `qrToRects` (one rect per dark module).
 */

import type { M0String, StableKey } from "@m0saic/dsl";
import { placeRect } from "../../builders/placeRect";
import { placeRects, type PlaceRectsRect } from "../../builders/placeRects";
import { toM0String } from "../../constructors/toM0String";
import { queryFrames } from "../../queries/queryFrames";
import { replaceNodeByStableId } from "../../transforms/primitives/replace/replaceNodeByStableId";
import {
  getAlignmentPatternRegions,
  getDarkModuleCell,
  getFinderPatternCells,
  getFormatInfoRegions,
  getSeparatorRegions,
  getTimingPatternRegions,
  getVersionInfoRegions,
  type QrCellRegion,
} from "./matrix";
import { packDarkCells, type PackDarkCellsStrategy } from "./packDarkCells";
import { qrToMatrix } from "./qrToMatrix";
import type {
  QrChannel,
  QrChannelConfig,
  QrChannelOutput,
  QrErrorCorrection,
  QrFramePtr,
  QrSafeAreaBounds,
  QrToM0Options,
  QrToM0Result,
} from "./types";

/**
 * Canonical safe-area cell span in carve mode. V1 of this code uses a fixed
 * span (matches the brand-QR proportions at V6+: ~13 cells of logo region
 * with 1 cell of "padding" margin on each side = 15 cells total).
 *
 * Smaller QR versions (V1-V3) can't hold a 15-cell safe area without
 * overlapping function patterns; the caller must force a higher version or
 * skip safe-area carve. See the throw below.
 */
const SAFE_AREA_CELLS = 15;

/** Default pixel size per cell when no safe-area sizing is requested. */
const DEFAULT_PX_PER_CELL = 25;

// ── Channel ordering + naming ──────────────────────────────────────

/**
 * Fixed composition order for overlay channels in the m0. Whichever subset
 * is enabled appears in this order; quiet-zone is always after channels;
 * safeArea is always deepest when enabled.
 */
type StructuralChannel = Exclude<QrChannel, "data" | "safeArea">;
const OVERLAY_CHANNEL_ORDER: readonly StructuralChannel[] = [
  "eyes",
  "alignmentPatterns",
  "timingPatterns",
  "formatInfo",
  "versionInfo",
  "darkModule",
  "separators",
  "quietZone",
];

type NormalizedChannelConfig = { emit: boolean; suppressBase: boolean };

function normalizeChannelConfig(
  cfg: QrChannelConfig | undefined,
): NormalizedChannelConfig {
  if (cfg === undefined || cfg === false) return { emit: false, suppressBase: false };
  if (cfg === true) return { emit: true, suppressBase: false };
  return { emit: cfg.emit ?? true, suppressBase: cfg.suppressBase ?? false };
}

// ── Per-channel region + label helpers ─────────────────────────────

/** A region tagged with its intended human-readable label for m0c output. */
type LabeledRegion = { region: QrCellRegion; label: string };

function regionsForChannel(
  channel: StructuralChannel,
  version: number,
  matrixSize: number,
  quietZone: number,
): LabeledRegion[] {
  switch (channel) {
    case "eyes":
      return getFinderPatternCells(version).map((f) => ({
        region: f.region,
        label: `qr-eye-${f.corner}`,
      }));
    case "alignmentPatterns":
      return getAlignmentPatternRegions(version).map((region, i) => ({
        region,
        label: `qr-align-${i}`,
      }));
    case "timingPatterns": {
      const { horizontal, vertical } = getTimingPatternRegions(version);
      return [
        { region: horizontal, label: "qr-timing-h" },
        { region: vertical, label: "qr-timing-v" },
      ];
    }
    case "formatInfo":
      return getFormatInfoRegions(version).map((f) => ({
        region: f.region,
        label: `qr-formatinfo-${f.instance}-${f.leg}`,
      }));
    case "versionInfo":
      return getVersionInfoRegions(version).map((v) => ({
        region: v.region,
        label: `qr-versioninfo-${v.instance}`,
      }));
    case "darkModule": {
      const { row, col } = getDarkModuleCell(version);
      return [{ region: { row, col, w: 1, h: 1 }, label: "qr-darkmodule" }];
    }
    case "separators":
      return getSeparatorRegions(version).map((s) => ({
        region: s.region,
        label: `qr-separator-${s.corner}-${s.leg}`,
      }));
    case "quietZone": {
      // Four bands of the QZ ring. Coords are matrix-relative (no QZ
      // offset); the QZ region itself extends OUTSIDE the data matrix.
      if (quietZone <= 0) return [];
      const QZ = quietZone;
      const N = matrixSize + 2 * QZ;
      const regions: LabeledRegion[] = [
        {
          region: { row: -QZ, col: -QZ, w: N, h: QZ },
          label: "qr-quiet-zone-top",
        },
        {
          region: { row: matrixSize, col: -QZ, w: N, h: QZ },
          label: "qr-quiet-zone-bottom",
        },
      ];
      if (matrixSize > 0) {
        regions.push({
          region: { row: 0, col: -QZ, w: QZ, h: matrixSize },
          label: "qr-quiet-zone-left",
        });
        regions.push({
          region: { row: 0, col: matrixSize, w: QZ, h: matrixSize },
          label: "qr-quiet-zone-right",
        });
      }
      return regions;
    }
  }
}

/**
 * Build the m0 fragment that paints a region's canonical bit pattern.
 *
 * Samples `modules[r][c]` inside the region's bounds (quiet-zone-adjusted)
 * and emits a `<w>[<w>(c1,c2,…),<w>(…),…]` grid where each cell is `1`
 * (dark module) or `-` (light). This is the actual QR data the encoder
 * already produced — we're just rewrapping it so the channel overlay
 * carries scannable content instead of a hollow F placeholder.
 *
 * For 1×N or N×1 strips (timing patterns, format-info legs, separator
 * legs), the grid degenerates to `<N>(c1,…)` (single row) or `<N>[…]`
 * (single col). For a 1×1 region (dark module), it's a bare `1`/`-`.
 */
function buildCanonicalRegionM0(
  modules: boolean[][],
  region: QrCellRegion,
  quietZone: number,
): string {
  const { row, col, w, h } = region;
  if (w === 1 && h === 1) {
    return modules[row + quietZone][col + quietZone] ? "1" : "-";
  }
  if (h === 1) {
    const cells: string[] = [];
    for (let dc = 0; dc < w; dc++) {
      cells.push(modules[row + quietZone][col + dc + quietZone] ? "1" : "-");
    }
    return `${w}(${cells.join(",")})`;
  }
  if (w === 1) {
    const cells: string[] = [];
    for (let dr = 0; dr < h; dr++) {
      cells.push(modules[row + dr + quietZone][col + quietZone] ? "1" : "-");
    }
    return `${h}[${cells.join(",")}]`;
  }
  const rowFragments: string[] = [];
  for (let dr = 0; dr < h; dr++) {
    const cells: string[] = [];
    for (let dc = 0; dc < w; dc++) {
      cells.push(modules[row + dr + quietZone][col + dc + quietZone] ? "1" : "-");
    }
    rowFragments.push(`${w}(${cells.join(",")})`);
  }
  return `${h}[${rowFragments.join(",")}]`;
}

/**
 * Build the overlay m0 for a set of regions via `placeRects`.
 *
 * Each region becomes a `-{<content>}` rect — the `-` is a logical-owner
 * anchor (carries the stableKey/label/mask target without painting), and
 * the `{<content>}` overlay paints either the canonical bit pattern (for
 * a channel region) or all-null (for a quiet-zone/separator strip).
 *
 * `placeRects` packs as many rects as possible onto one layer; when two
 * compound-claimant regions would subdivide each other's spans (e.g.
 * timing-H and timing-V mutually subdivide) it auto-promotes one to a
 * higher layer. The returned m0 is the composed multi-layer expression,
 * so a single overlay-body slot in qrToM0's chain can hold any number of
 * sub-layers transparently.
 */
function buildRegionOverlay(
  regions: { region: QrCellRegion; content: string }[],
  N: number,
  quietZone: number,
): { m0: string; layerCount: number } {
  const rects: PlaceRectsRect[] = regions.map((r) => ({
    x: r.region.col + quietZone,
    y: r.region.row + quietZone,
    w: r.region.w,
    h: r.region.h,
    claimant: `-{${r.content}}`,
  }));
  const result = placeRects({ rootW: N, rootH: N, rects });
  return { m0: String(result.m0), layerCount: result.layers.length };
}

// ── Main ────────────────────────────────────────────────────────────

export function qrToM0(text: string, opts: QrToM0Options = {}): QrToM0Result {
  const ecc: QrErrorCorrection = opts.errorCorrectionLevel ?? "M";
  const quietZone = opts.quietZoneModules ?? 4;
  const safeArea = opts.safeArea ?? { mode: "none" };

  // 1. Generate the QR matrix (modules + size with quiet zone).
  const matrix = qrToMatrix(text, {
    errorCorrectionLevel: ecc,
    version: opts.version,
    quietZoneModules: quietZone,
  });
  const N = matrix.size;
  const QZ = matrix.quietZone;
  const matrixSize = N - 2 * QZ;

  // 2. Resolve the safe-area cell range (centered) when the mode demands it.
  let safeAreaCellsStart = 0;
  let safeAreaCellsEnd = 0;
  if (safeArea.mode !== "none") {
    safeAreaCellsStart = Math.floor((N - SAFE_AREA_CELLS) / 2);
    safeAreaCellsEnd = safeAreaCellsStart + SAFE_AREA_CELLS;
    if (safeAreaCellsStart < 0 || safeAreaCellsEnd > N) {
      throw new Error(
        `qrToM0: safe area (${SAFE_AREA_CELLS} cells) does not fit in a ${N}-cell canvas. Force a larger version via opts.version.`,
      );
    }
  }

  // 3. Compute canvas pixel dimensions + the inner-logo safe-area bounds.
  let canvasW: number;
  let canvasH: number;
  let safeAreaBoundsPx: QrSafeAreaBounds | undefined;
  let innerLogoBox: { w: number; h: number; safeAreaSquarePx: number } | null = null;

  if (safeArea.mode === "none") {
    const pxPerCell = DEFAULT_PX_PER_CELL;
    canvasW = canvasH = N * pxPerCell;
  } else {
    if (!safeArea.size) {
      throw new Error(`qrToM0: safeArea.mode "${safeArea.mode}" requires safeArea.size`);
    }
    const { width: W, height: H } = safeArea.size;
    if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) {
      throw new Error(
        `qrToM0: safeArea.size must have positive width and height, got ${W}×${H}`,
      );
    }
    const paddingPct = safeArea.paddingPct ?? 0;
    if (!Number.isFinite(paddingPct) || paddingPct < 0 || paddingPct >= 50) {
      throw new Error(
        `qrToM0: paddingPct must be in [0, 50), got ${paddingPct}`,
      );
    }
    const wRect = Math.max(1, Math.ceil(W));
    const hRect = Math.max(1, Math.ceil(H));
    const pad = (paddingPct / 100) * Math.max(wRect, hRect);
    const targetSquarePx = Math.max(wRect, hRect) + 2 * pad;
    const pxPerCell = Math.max(1, Math.ceil(targetSquarePx / SAFE_AREA_CELLS));
    const safeAreaSquarePx = SAFE_AREA_CELLS * pxPerCell;
    canvasW = canvasH = N * pxPerCell;

    const safeAreaTopLeftX = safeAreaCellsStart * pxPerCell;
    const leftBar = Math.floor((safeAreaSquarePx - wRect) / 2);
    const topBar = Math.floor((safeAreaSquarePx - hRect) / 2);
    safeAreaBoundsPx = {
      x: safeAreaTopLeftX + leftBar,
      y: safeAreaTopLeftX + topBar,
      width: wRect,
      height: hRect,
    };
    innerLogoBox = { w: wRect, h: hRect, safeAreaSquarePx };
  }

  const pxPerCell = canvasW / N;
  const queryCtx = { width: canvasW, height: canvasH };

  // 4. Normalize per-channel config and gather suppressed cells.
  //
  // When safe-area carve is on, drop any channel region whose cells are
  // fully inside the carve square — the base cells there are suppressed,
  // so emitting a logical-owner anchor at that position would label a
  // region that has no actual paint. Common case: an alignment pattern
  // that happens to land under the carved logo area.
  const safeAreaCarveCells: { row: number; col: number; w: number; h: number } | null =
    safeArea.mode === "carve"
      ? {
          row: safeAreaCellsStart - QZ,
          col: safeAreaCellsStart - QZ,
          w: SAFE_AREA_CELLS,
          h: SAFE_AREA_CELLS,
        }
      : null;
  function regionInsideCarve(region: QrCellRegion): boolean {
    if (!safeAreaCarveCells) return false;
    const sa = safeAreaCarveCells;
    return (
      region.row >= sa.row &&
      region.col >= sa.col &&
      region.row + region.h <= sa.row + sa.h &&
      region.col + region.w <= sa.col + sa.w
    );
  }
  const channelConfigs = OVERLAY_CHANNEL_ORDER.map((channel) => {
    const cfg = normalizeChannelConfig(opts.channels?.[channel]);
    const allRegions = cfg.emit
      ? regionsForChannel(channel, matrix.version, matrixSize, QZ)
      : [];
    const regions = allRegions.filter((r) => !regionInsideCarve(r.region));
    return { channel, cfg, regions };
  });

  // Build a suppression mask: true at (r,c) means "set to '-' in base grid".
  //
  // Channels default to pure structural anchors — they don't modify the
  // base, so the canonical QR keeps scanning regardless of which channels
  // are on. Two things suppress base cells:
  //   1. a safe-area CARVE (physically removing the centre region to
  //      splice a logo/media in), and
  //   2. a channel opting in via `suppressBase: true` — for callers that
  //      splice a full-coverage visual into the anchor and don't want the
  //      styled base modules peeking past its rounded edges.
  const suppress: boolean[][] = Array.from({ length: N }, () =>
    new Array<boolean>(N).fill(false),
  );
  for (const { cfg, regions } of channelConfigs) {
    if (!cfg.emit || !cfg.suppressBase) continue;
    for (const lr of regions) {
      for (let r = 0; r < lr.region.h; r++) {
        for (let c = 0; c < lr.region.w; c++) {
          suppress[lr.region.row + QZ + r][lr.region.col + QZ + c] = true;
        }
      }
    }
  }
  if (safeArea.mode === "carve") {
    for (let r = safeAreaCellsStart; r < safeAreaCellsEnd; r++) {
      for (let c = safeAreaCellsStart; c < safeAreaCellsEnd; c++) {
        suppress[r][c] = true;
      }
    }
  }

  // 5. Build the base layer.
  const packEnabled = opts.pack === true ||
    (typeof opts.pack === "object" && opts.pack !== null);
  const packStrategy: PackDarkCellsStrategy =
    (typeof opts.pack === "object" && opts.pack !== null && opts.pack.strategy) ||
    "rowwise";

  let baseM0: string;
  let packedRects: PlaceRectsRect[] = [];

  if (packEnabled) {
    packedRects = packDarkCells(matrix.modules, suppress, N, { strategy: packStrategy });
    if (packedRects.length === 0) {
      throw new Error(
        "qrToM0: pack: true with no remaining dark cells (all suppressed) — disable pack or fewer channels.",
      );
    }
    const baseResult = placeRects({ rootW: N, rootH: N, rects: packedRects });
    if (baseResult.layers.length !== 1) {
      throw new Error(
        `qrToM0: packed base unexpectedly produced ${baseResult.layers.length} layers — QR cells should never overlap`,
      );
    }
    baseM0 = String(baseResult.layers[0].m0);
  } else {
    // Built as a raw string (same approach as before) since quiet-zone rows
    // are all `-` and `container` would reject them.
    const rowFragments: string[] = [];
    for (let r = 0; r < N; r++) {
      const cells: string[] = [];
      for (let c = 0; c < N; c++) {
        if (suppress[r][c]) cells.push("-");
        else cells.push(matrix.modules[r][c] ? "1" : "-");
      }
      rowFragments.push(`${N}(${cells.join(",")})`);
    }
    baseM0 = `${N}[${rowFragments.join(",")}]`;
  }

  // 6. Per-channel overlay layers, one per channel. Channels whose
  //    regions mutually subdivide are split into multiple sub-layers
  //    (today: timing). For each channel we may emit 0, 1, or more
  //    overlay layers — same `channel` role, different layerIndex.
  type PendingChannel = {
    channel: Exclude<QrChannel, "data">;
    regions: QrCellRegion[];
    labels: string[];
    overlayM0: string;
  };
  const pendingChannels: PendingChannel[] = [];

  for (const { channel, cfg, regions } of channelConfigs) {
    if (!cfg.emit || regions.length === 0) continue;

    // ALL channels emit `-{-}` — a logical-owner anchor carrying the
    // channel/region's stableKey + label, painting nothing itself. Same
    // shape separators use. The base layer is left intact, so the
    // canonical QR keeps scanning regardless of which channels are on.
    // Templates that want a per-channel visual (e.g. rounded eyes) splice
    // their own content into the anchor via `replaceNodeByStableId`.
    const rects: PlaceRectsRect[] = regions.map((lr) => ({
      x: lr.region.col + QZ,
      y: lr.region.row + QZ,
      w: lr.region.w,
      h: lr.region.h,
      claimant: "-{-}",
    }));
    const result = placeRects({ rootW: N, rootH: N, rects });
    pendingChannels.push({
      channel,
      regions: regions.map((lr) => lr.region),
      labels: regions.map((lr) => lr.label),
      overlayM0: String(result.m0),
    });
  }

  // 7. SafeArea overlay (deepest channel when carving). Stays a real F
  //    (splice-point semantics), uses `placeRect` directly because the
  //    carved region has a special inner-letterbox case that `placeRects`
  //    doesn't handle.
  if (safeArea.mode === "carve") {
    const outerPlace = placeRect({
      rootW: N,
      rootH: N,
      rectW: SAFE_AREA_CELLS,
      rectH: SAFE_AREA_CELLS,
    });
    let safeAreaOverlayM0 = String(outerPlace.m0);
    if (innerLogoBox && (innerLogoBox.w !== innerLogoBox.h ||
        innerLogoBox.w !== innerLogoBox.safeAreaSquarePx)) {
      const innerPlace = placeRect({
        rootW: innerLogoBox.safeAreaSquarePx,
        rootH: innerLogoBox.safeAreaSquarePx,
        rectW: innerLogoBox.w,
        rectH: innerLogoBox.h,
      });
      const outerFrames = queryFrames(safeAreaOverlayM0).logical();
      if (outerFrames.length !== 1) {
        throw new Error(
          `qrToM0: outer placeRect produced ${outerFrames.length} frames (expected 1)`,
        );
      }
      const outerFKey = outerFrames[0].meta.stableKey as unknown as string;
      safeAreaOverlayM0 = replaceNodeByStableId(
        safeAreaOverlayM0,
        outerFKey,
        String(innerPlace.m0),
      );
    }
    pendingChannels.push({
      channel: "safeArea",
      regions: [{
        row: safeAreaCellsStart - QZ,
        col: safeAreaCellsStart - QZ,
        w: SAFE_AREA_CELLS,
        h: SAFE_AREA_CELLS,
      }],
      labels: ["qr-safe-area"],
      overlayM0: safeAreaOverlayM0,
    });
  }

  // 9. Compose: chain overlays as nested. base{ ch0 { ch1 { ... } } }.
  let innerStack = "";
  for (let i = pendingChannels.length - 1; i >= 0; i--) {
    innerStack = innerStack
      ? `${pendingChannels[i].overlayM0}{${innerStack}}`
      : pendingChannels[i].overlayM0;
  }
  const composedRaw = innerStack ? `${baseM0}{${innerStack}}` : baseM0;
  const finalM0: M0String = toM0String(composedRaw, "qrToM0");

  // 10. Walk the composed m0 to extract stable keys.
  //
  // All channels emit `-{-}` logical-owner anchors. We pick the OUTERMOST
  // `null` frame at each rect's pixel bounds — that's the anchor carrying
  // the channel's stableKey + label. The inner `-` of the overlay body
  // sits at the same bounds but a deeper structural depth.
  const q = queryFrames(String(finalM0), queryCtx);
  const editorFrames = q.editor();
  const logical = q.logical();
  // Only nulls flagged `isLogicalOwner` qualify as anchors. When channels
  // nest (e.g. `base{eyes{align{qz{…}}}}`), the same pixel bounds can be
  // shared by an unrelated grid cell at a SHALLOWER overlay depth AND
  // the real anchor at a deeper one — picking by depth alone would land
  // on the cell instead of the anchor and silently mis-label.
  const ownerByPos = new Map<string, { key: StableKey; depth: number }>();
  for (const f of editorFrames) {
    if (f.kind !== "null") continue;
    if (!(f as unknown as { isLogicalOwner?: boolean }).isLogicalOwner) continue;
    const k = `${f.x},${f.y},${f.width},${f.height}`;
    const slot = ownerByPos.get(k);
    if (!slot || f.meta.structuralDepth < slot.depth) {
      ownerByPos.set(k, {
        key: f.meta.stableKey as unknown as StableKey,
        depth: f.meta.structuralDepth,
      });
    }
  }

  const labels: Record<StableKey, string> = {};

  // Data-channel frames (packed rects only — un-packed cells aren't tracked).
  // Packed rects sit at the base layer as `1` paints — match against the
  // logical walk, which only emits rendered leaves (skipping the channel
  // overlays). The packed rects come first in logical order.
  const dataChannelFrames: QrFramePtr[] = [];
  if (packEnabled) {
    for (let i = 0; i < packedRects.length; i++) {
      const r = packedRects[i];
      const stableKey = logical[i].meta.stableKey as unknown as StableKey;
      dataChannelFrames.push({
        stableKey,
        bounds: {
          x: r.x * pxPerCell,
          y: r.y * pxPerCell,
          width: r.w * pxPerCell,
          height: r.h * pxPerCell,
        },
        cellBounds: {
          row: r.y - QZ,
          col: r.x - QZ,
          w: r.w,
          h: r.h,
        },
      });
      labels[stableKey] = `qr-pack-${i}`;
    }
  }

  // Assign stable keys + labels per overlay layer via bounds lookup.
  // SafeArea is special: the splice-point F is a rendered leaf at the
  // inner-logo bounds (potentially sub-cell-precise), so we still pull
  // its key from the logical walk's last entry.
  const channelOutputs: QrChannelOutput[] = [
    { channel: "data", layerIndex: 0, frames: dataChannelFrames },
  ];

  let layerIdx = 1;
  let safeAreaStableKey: StableKey | undefined;

  for (const pc of pendingChannels) {
    const frames: QrFramePtr[] = [];
    const indexed = pc.regions.map((r, i) => ({ r, label: pc.labels[i], i }));
    indexed.sort((a, b) => a.r.row - b.r.row || a.r.col - b.r.col);

    for (const { r, label } of indexed) {
      let stableKey: StableKey;
      let bounds: QrSafeAreaBounds;
      if (pc.channel === "safeArea") {
        // The safeArea F is the last rendered logical leaf in document order.
        stableKey = logical[logical.length - 1].meta.stableKey as unknown as StableKey;
        bounds = safeAreaBoundsPx!;
        safeAreaStableKey = stableKey;
      } else {
        const pxX = (r.col + QZ) * pxPerCell;
        const pxY = (r.row + QZ) * pxPerCell;
        const pxW = r.w * pxPerCell;
        const pxH = r.h * pxPerCell;
        const slot = ownerByPos.get(`${pxX},${pxY},${pxW},${pxH}`);
        if (!slot) {
          throw new Error(
            `qrToM0: no logical-owner anchor at px ${pxX},${pxY},${pxW},${pxH} (channel=${pc.channel}, label=${label})`,
          );
        }
        stableKey = slot.key;
        bounds = { x: pxX, y: pxY, width: pxW, height: pxH };
      }
      frames.push({
        stableKey,
        bounds,
        cellBounds: { row: r.row, col: r.col, w: r.w, h: r.h },
      });
      labels[stableKey] = label;
    }
    channelOutputs.push({ channel: pc.channel, layerIndex: layerIdx, frames });
    layerIdx += 1;
  }

  // Build the channelByRole lookup. Channels emitted on multiple layers
  // (e.g. timingPatterns) get merged — the role's `frames` is the union.
  const channelByRole: Partial<Record<QrChannel, QrChannelOutput>> = {};
  for (const c of channelOutputs) {
    const existing = channelByRole[c.channel];
    if (!existing) {
      channelByRole[c.channel] = c;
    } else {
      channelByRole[c.channel] = {
        channel: c.channel,
        layerIndex: existing.layerIndex,
        frames: [...existing.frames, ...c.frames],
      };
    }
  }

  return {
    m0: finalM0,
    canvasW,
    canvasH,
    matrixSize,
    quietZone: QZ,
    version: matrix.version,
    errorCorrectionLevel: matrix.errorCorrectionLevel,
    channels: channelOutputs,
    channelByRole,
    labels,
    ...(safeAreaBoundsPx ? { safeAreaBounds: safeAreaBoundsPx } : {}),
    ...(safeAreaStableKey ? { safeAreaStableKey } : {}),
  };
}
