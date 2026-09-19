/**
 * Text → validated `M0String` for a 1D barcode, with optional HRI carve AND
 * optional structural-overlay channels.
 *
 * The canonical headline export of the in-house barcode module. Mirrors
 * `qr/qrToM0.ts`'s composition pattern but adapted to a 1D bar layout:
 *
 *   Layer 0 (base):       The full canvas in module-cell units. Each dark
 *                         bar is a `1`-claimant rect of width = bar's module
 *                         width × full bar-region height. Light spaces and
 *                         quiet zones become `-` cells. When HRI is sized
 *                         into the canvas (bounds OR carve mode), the bottom
 *                         band's cells are all `-` here.
 *   Layer 1+ (overlays):  One layer per enabled structural channel, in fixed
 *                         relative order: quietZoneLeft → quietZoneRight →
 *                         startGuard → stopGuard. Each enabled channel emits
 *                         `-{-}` logical-owner anchors at the region's
 *                         position (carries stableKey + label, paints
 *                         nothing). HRI carve sits at the deepest position
 *                         and emits a real `F` splice point — templates
 *                         splice a text source into it via
 *                         `replaceNodeByStableId`.
 *
 * The m0 DSL is pure geometry — it cannot paint text. The HRI carve
 * mechanism reserves space for the digit caption + labels the frame so
 * templates can wire in a text source.
 *
 * Pure, deterministic, no I/O.
 */

import type { M0String, StableKey } from "@m0saic/dsl";
import { placeRects, type PlaceRectsRect } from "../../builders/placeRects";
import { toM0String } from "../../constructors/toM0String";
import { queryFrames } from "../../queries/queryFrames";
import { barcodeToBars } from "./barcodeToBars";
import {
  regionsForChannel,
  STRUCTURAL_CHANNEL_ORDER,
  type ChannelContext,
  type LabeledRegion,
} from "./barcodeChannels";
import type {
  BarcodeChannel,
  BarcodeChannelConfig,
  BarcodeChannelOutput,
  BarcodeFormat,
  BarcodeFramePtr,
  BarcodeHriFrame,
  BarcodeToM0Options,
  BarcodeToM0Result,
  HumanReadableSpec,
} from "./types";

// ── Defaults ────────────────────────────────────────────────────────

const DEFAULT_MODULE_WIDTH_PX = 2;
const DEFAULT_BAR_HEIGHT_PX = 80;
const DEFAULT_HRI_HEIGHT_PCT = 0.15;

/**
 * Per-format HRI default. Code 128 callers rarely want the digit caption
 * (it's just an echo of the payload, which they already have). Product
 * codes (EAN-13 / UPC-A) traditionally render the digits underneath the
 * bars by convention, so we default `carve` for them.
 */
const FORMAT_DEFAULT_HRI: Readonly<Record<BarcodeFormat, HumanReadableSpec>> = {
  code128: { mode: "none" },
  ean13: { mode: "carve" },
  upca: { mode: "carve" },
};

// ── Helpers ─────────────────────────────────────────────────────────

function normalizeChannelEmit(cfg: BarcodeChannelConfig | undefined): boolean {
  if (cfg === undefined || cfg === false) return false;
  if (cfg === true) return true;
  return cfg.emit ?? true;
}

function resolveHriHeightModules(
  spec: HumanReadableSpec,
  heightModules: number,
  moduleWidthPx: number,
): number {
  if (spec.mode === "none") return 0;
  if (spec.heightPx !== undefined) {
    if (!Number.isFinite(spec.heightPx) || spec.heightPx <= 0) {
      throw new Error(
        `barcodeToM0: humanReadable.heightPx must be a positive number, got ${spec.heightPx}`,
      );
    }
    return Math.max(1, Math.round(spec.heightPx / moduleWidthPx));
  }
  const pct = spec.heightPct ?? DEFAULT_HRI_HEIGHT_PCT;
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 1) {
    throw new Error(
      `barcodeToM0: humanReadable.heightPct must be in (0, 1), got ${pct}`,
    );
  }
  const hriHeightPx = heightModules * moduleWidthPx * pct;
  return Math.max(1, Math.round(hriHeightPx / moduleWidthPx));
}

// ── Main ────────────────────────────────────────────────────────────

export function barcodeToM0(
  text: string,
  opts: BarcodeToM0Options = {},
): BarcodeToM0Result {
  const format: BarcodeFormat = opts.format ?? "code128";
  const moduleWidthPx = opts.moduleWidthPx ?? DEFAULT_MODULE_WIDTH_PX;
  const heightPx = opts.heightPx ?? DEFAULT_BAR_HEIGHT_PX;
  const humanReadable: HumanReadableSpec =
    opts.humanReadable ?? FORMAT_DEFAULT_HRI[format];

  if (!Number.isInteger(moduleWidthPx) || moduleWidthPx < 1) {
    throw new Error(
      `barcodeToM0: moduleWidthPx must be a positive integer, got ${moduleWidthPx}`,
    );
  }
  if (!Number.isFinite(heightPx) || heightPx <= 0) {
    throw new Error(
      `barcodeToM0: heightPx must be a positive number, got ${heightPx}`,
    );
  }

  // 1. Generate the 1D bar pattern (includes quiet zones).
  const bars = barcodeToBars(text, {
    format,
    quietZoneModules: opts.quietZoneModules,
  });
  const { modulesWide, quietZoneModules } = bars;

  // 2. Resolve canvas dimensions in module units.
  const heightModules = Math.max(1, Math.round(heightPx / moduleWidthPx));
  const hriHeightModules = resolveHriHeightModules(
    humanReadable,
    heightModules,
    moduleWidthPx,
  );
  const canvasHeightModules = heightModules + hriHeightModules;

  const canvasW = modulesWide * moduleWidthPx;
  const canvasH = canvasHeightModules * moduleWidthPx;
  const queryCtx = { width: canvasW, height: canvasH };

  // 3. Base layer — every dark bar becomes a `1`-claimant rect spanning the
  // full bar-region height. Light spaces + quiet zones become `-` cells.
  // When HRI is sized into the canvas (bounds OR carve mode), the bottom
  // band's cells are all `-` here.
  const darkBars = bars.bars.filter((b) => b.ink === "dark");
  if (darkBars.length === 0) {
    throw new Error("barcodeToM0: encoder produced no dark bars — input is unrenderable");
  }
  const baseRects: PlaceRectsRect[] = darkBars.map((b) => ({
    x: b.x,
    y: 0,
    w: b.widthModules,
    h: heightModules,
    claimant: "1",
  }));
  const baseResult = placeRects({
    rootW: modulesWide,
    rootH: canvasHeightModules,
    rects: baseRects,
  });
  // baseResult must produce exactly one layer — bar rects never overlap.
  if (baseResult.layers.length !== 1) {
    throw new Error(
      `barcodeToM0: base layer unexpectedly produced ${baseResult.layers.length} layers — barcode bars should never overlap`,
    );
  }
  const baseM0 = String(baseResult.m0);

  // 4. Structural channel overlays. Each enabled channel emits `-{-}`
  // logical-owner anchors at its region — pure structural markers.
  const channelCtx: ChannelContext = {
    format,
    innerModules: modulesWide - 2 * quietZoneModules,
    modulesWide,
    quietZoneModules,
    heightModules,
  };

  type PendingChannel = {
    channel: BarcodeChannel;
    regions: LabeledRegion[];
    overlayM0: string;
  };
  const pendingChannels: PendingChannel[] = [];

  for (const channel of STRUCTURAL_CHANNEL_ORDER) {
    if (!normalizeChannelEmit(opts.channels?.[channel])) continue;
    const regions = regionsForChannel(channel, channelCtx);
    if (regions.length === 0) continue;
    const rects: PlaceRectsRect[] = regions.map((lr) => ({
      x: lr.region.col,
      y: lr.region.row,
      w: lr.region.w,
      h: lr.region.h,
      claimant: "-{-}",
    }));
    const result = placeRects({
      rootW: modulesWide,
      rootH: canvasHeightModules,
      rects,
    });
    pendingChannels.push({
      channel,
      regions,
      overlayM0: String(result.m0),
    });
  }

  // 5. HRI carve — deepest overlay layer. One splice-point `F` per HRI
  // frame (Code 128: 1; EAN-13: 3; UPC-A: 4). Frames sit in the same
  // horizontal HRI band but at different x positions; gaps between them
  // (under the guards) become `-` cells automatically. Templates splice a
  // text source into each F via `replaceNodeByStableId`.
  let hriCarveOverlayM0: string | null = null;
  if (humanReadable.mode === "carve") {
    const hriRects: PlaceRectsRect[] = bars.hriFrames.map((f) => ({
      x: f.x,
      y: heightModules,
      w: f.w,
      h: hriHeightModules,
      claimant: "F",
    }));
    const result = placeRects({
      rootW: modulesWide,
      rootH: canvasHeightModules,
      rects: hriRects,
    });
    hriCarveOverlayM0 = String(result.m0);
  }

  // 6. Compose: base{ ch0{ ch1{ ... { hri }}}}.
  const overlayLayers: string[] = pendingChannels.map((pc) => pc.overlayM0);
  if (hriCarveOverlayM0) overlayLayers.push(hriCarveOverlayM0);

  let innerStack = "";
  for (let i = overlayLayers.length - 1; i >= 0; i--) {
    innerStack = innerStack
      ? `${overlayLayers[i]}{${innerStack}}`
      : overlayLayers[i];
  }
  const composedRaw = innerStack ? `${baseM0}{${innerStack}}` : baseM0;
  const finalM0: M0String = toM0String(composedRaw, "barcodeToM0");

  // 7. Walk the composed m0 to extract stable keys for the `bars` channel
  // (one per dark bar in document order) + each overlay anchor.
  const q = queryFrames(String(finalM0), queryCtx);
  const editorFrames = q.editor();
  const logical = q.logical();

  // Build an x,y,w,h → stableKey map for logical-owner anchors. When the
  // same pixel bounds are shared between an unrelated cell at a SHALLOWER
  // overlay depth and the real anchor at a deeper one, pick the shallowest
  // logical-owner (matches QR's convention in qrToM0.ts).
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

  // 7a. `bars` channel — one frame per dark bar, in document order. The
  // logical walk yields rendered leaves in m0 order; the first N entries
  // are the bar paints (in left-to-right order), and the LAST entry is
  // the HRI splice-point F (when carved). Strip the HRI from the bar slice.
  const numBars = darkBars.length;
  if (logical.length < numBars) {
    throw new Error(
      `barcodeToM0: logical leaves (${logical.length}) < dark bars (${numBars}) — composition mismatch`,
    );
  }

  const barsFrames: BarcodeFramePtr[] = [];
  for (let i = 0; i < numBars; i++) {
    const dbar = darkBars[i];
    const leaf = logical[i];
    const stableKey = leaf.meta.stableKey as unknown as StableKey;
    barsFrames.push({
      stableKey,
      bounds: {
        x: dbar.x * moduleWidthPx,
        y: 0,
        width: dbar.widthModules * moduleWidthPx,
        height: heightModules * moduleWidthPx,
      },
      cellBounds: {
        row: 0,
        col: dbar.x,
        w: dbar.widthModules,
        h: heightModules,
      },
    });
    labels[stableKey] = `barcode-bar-${i}`;
  }

  // 7b. Structural-channel anchors — look up by pixel bounds.
  const channelOutputs: BarcodeChannelOutput[] = [
    { channel: "bars", layerIndex: 0, frames: barsFrames },
  ];
  let layerIdx = 1;
  for (const pc of pendingChannels) {
    const frames: BarcodeFramePtr[] = [];
    for (const lr of pc.regions) {
      const pxX = lr.region.col * moduleWidthPx;
      const pxY = lr.region.row * moduleWidthPx;
      const pxW = lr.region.w * moduleWidthPx;
      const pxH = lr.region.h * moduleWidthPx;
      const slot = ownerByPos.get(`${pxX},${pxY},${pxW},${pxH}`);
      if (!slot) {
        throw new Error(
          `barcodeToM0: no logical-owner anchor at px ${pxX},${pxY},${pxW},${pxH} (channel=${pc.channel}, label=${lr.label})`,
        );
      }
      frames.push({
        stableKey: slot.key,
        bounds: { x: pxX, y: pxY, width: pxW, height: pxH },
        cellBounds: lr.region,
      });
      labels[slot.key] = lr.label;
    }
    channelOutputs.push({ channel: pc.channel, layerIndex: layerIdx, frames });
    layerIdx += 1;
  }

  // 7c. HRI frames — one per `bars.hriFrames[i]`. For Code 128 there is
  // exactly one frame; for EAN-13 there are 3 (leading / left / right);
  // for UPC-A there are 4 (leading / left / right / trailing).
  //
  // Carve mode: each frame gets a splice-point F. The Fs are placed in
  // left-to-right order in the HRI layer, so they appear at the END of
  // the logical leaves walk in the same order (matches qrToM0's safe-area
  // convention generalized to N frames).
  //
  // Bounds mode: frame bounds are returned without stableKeys (no Fs are
  // emitted in the m0).
  const humanReadableFrames: BarcodeHriFrame[] = [];
  if (humanReadable.mode !== "none") {
    const hriFrameSpecs = bars.hriFrames;
    if (humanReadable.mode === "carve") {
      const startIdx = logical.length - hriFrameSpecs.length;
      const hriOutputFrames: BarcodeFramePtr[] = [];
      for (let i = 0; i < hriFrameSpecs.length; i++) {
        const spec = hriFrameSpecs[i];
        const frameBounds = {
          x: spec.x * moduleWidthPx,
          y: heightModules * moduleWidthPx,
          width: spec.w * moduleWidthPx,
          height: hriHeightModules * moduleWidthPx,
        };
        const stableKey = logical[startIdx + i].meta
          .stableKey as unknown as StableKey;
        const label = `barcode-hri-${spec.role}`;
        humanReadableFrames.push({
          text: spec.text,
          bounds: frameBounds,
          stableKey,
        });
        labels[stableKey] = label;
        hriOutputFrames.push({
          stableKey,
          bounds: frameBounds,
          cellBounds: {
            row: heightModules,
            col: spec.x,
            w: spec.w,
            h: hriHeightModules,
          },
        });
      }
      channelOutputs.push({
        channel: "humanReadable",
        layerIndex: layerIdx,
        frames: hriOutputFrames,
      });
    } else {
      // bounds mode — emit the frame layout without stableKeys.
      for (const spec of hriFrameSpecs) {
        humanReadableFrames.push({
          text: spec.text,
          bounds: {
            x: spec.x * moduleWidthPx,
            y: heightModules * moduleWidthPx,
            width: spec.w * moduleWidthPx,
            height: hriHeightModules * moduleWidthPx,
          },
        });
      }
    }
  }

  // 8. Build channelByRole lookup.
  const channelByRole: Partial<Record<BarcodeChannel, BarcodeChannelOutput>> = {};
  for (const c of channelOutputs) {
    channelByRole[c.channel] = c;
  }

  return {
    m0: finalM0,
    canvasW,
    canvasH,
    format,
    modulesWide,
    quietZoneModules,
    payload: bars.payload,
    humanReadableText: bars.humanReadableText,
    channels: channelOutputs,
    channelByRole,
    labels,
    humanReadableFrames,
  };
}
