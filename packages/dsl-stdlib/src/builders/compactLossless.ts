/**
 * Lossless document compaction — the clean, identity-reporting counterpart
 * to {@link compactDocument}.
 *
 * `compactDocument` bundles three things behind options: null-layer removal
 * (lossless), rectangle PACKING (lossless geometry but rekeys identity by
 * rebuilding layers), and `gcdDriftPercent` GCD-snap (LOSSY — moves edges).
 * That makes "is this lossless?" depend on which options you passed.
 *
 * `compactLossless` is the unambiguous lossless path. It chains exactly two
 * geometry-preserving transforms:
 *
 *   1. {@link removePureNullLayers} — drop root-chain overlay layers that
 *      paint nothing.
 *   2. {@link reduceSplitCounts} — reduce split counts to their minimum
 *      representation (strict pixel-lossless by default; `maxDriftPx` opts
 *      into bounded drift).
 *
 * It never packs and never moves an edge beyond the (default 0) budget.
 * Rendered-leaf count and paint order are invariant, so positional
 * sidecars (sources / masks / fills) stay attached. It reports whether
 * rendered-leaf stableKeys survived (`keysStable`) and, when they didn't,
 * the `rekey` map + `liveKeys` set so hosts can migrate key-addressed
 * sidecars (labels) — the same migration contract `compactDocument` uses.
 *
 * Pure and deterministic. No I/O.
 */

import type { M0String } from "@m0saic/dsl";
import { parseM0StringToFullGraph, type EditorFrame } from "@m0saic/dsl";
import { removePureNullLayers } from "../transforms/primitives/overlay/removePureNullLayers";
import { reduceSplitCounts } from "../transforms/primitives/split/reduceSplitCounts";
import { getLayerCount } from "../queries/getLayerCount";
import { validateInputOrThrow } from "../transforms/_internal/output";
import type { CompactRekeyPair } from "./compactDocument";

export interface CompactLosslessOptions {
  /** The document to compact. */
  m0: string;
  /** Canvas width in px. Positive integer. */
  width: number;
  /** Canvas height in px. Positive integer. */
  height: number;
  /** Drop pure-null root-chain layers. Default true. */
  removeNullLayers?: boolean;
  /** Reduce split counts by weight-GCD. Default true. */
  reduceSplits?: boolean;
  /**
   * Drift budget forwarded to {@link reduceSplitCounts}. 0 (default) keeps
   * the whole operation strictly pixel-lossless.
   */
  maxDriftPx?: number;
}

export interface CompactLosslessResult {
  /** The compacted document. */
  m0: M0String;
  /** True iff every surviving rendered-leaf stableKey is unchanged. */
  keysStable: boolean;
  /** Old → new stableKey for every rendered leaf whose key changed. */
  rekey: CompactRekeyPair[];
  /** Every rendered-leaf stableKey in the compacted document. */
  liveKeys: string[];
  meta: {
    reducedSplits: number;
    layersBefore: number;
    layersAfter: number;
    /** Rendered-leaf count (invariant — identical before and after). */
    frameCount: number;
    dslLengthBefore: number;
    dslLengthAfter: number;
    /** Max per-edge drift introduced by split reduction (0 in strict mode). */
    maxDriftPx: number;
  };
}

const isRenderedLeaf = (f: EditorFrame): boolean =>
  (f.kind === "frame" || f.kind === "root") && !f.nullFrame && !f.passthroughFrame;

function renderedLeavesByLogical(m0: string, width: number, height: number): EditorFrame[] {
  return parseM0StringToFullGraph(m0, width, height)
    .filter(isRenderedLeaf)
    .sort((a, b) => (a.logicalIndex ?? 0) - (b.logicalIndex ?? 0));
}

export function compactLossless(opts: CompactLosslessOptions): CompactLosslessResult {
  const { width, height } = opts;
  if (!Number.isInteger(width) || width < 1)
    throw new Error(`compactLossless: width must be a positive integer, got ${width}`);
  if (!Number.isInteger(height) || height < 1)
    throw new Error(`compactLossless: height must be a positive integer, got ${height}`);
  const doNull = opts.removeNullLayers ?? true;
  const doReduce = opts.reduceSplits ?? true;

  const canonical = validateInputOrThrow("compactLossless", opts.m0);
  const layersBefore = getLayerCount(canonical) ?? 1;
  const before = renderedLeavesByLogical(canonical, width, height);

  let next = canonical;
  if (doNull) next = removePureNullLayers(next);

  let reducedSplits = 0;
  let maxDriftPx = 0;
  if (doReduce) {
    const r = reduceSplitCounts(next, { width, height, maxDriftPx: opts.maxDriftPx ?? 0 });
    next = r.m0;
    reducedSplits = r.reduced.length;
    maxDriftPx = r.maxDriftPx;
  }

  const after = renderedLeavesByLogical(next, width, height);
  if (after.length !== before.length) {
    throw new Error(
      "compactLossless: internal invariant — compaction changed the rendered frame count",
    );
  }

  const rekey: CompactRekeyPair[] = [];
  const liveKeys: string[] = [];
  for (let i = 0; i < before.length; i++) {
    const from = String(before[i].meta.stableKey);
    const to = String(after[i].meta.stableKey);
    liveKeys.push(to);
    if (from !== to) rekey.push({ from, to });
  }

  return {
    m0: next as M0String,
    keysStable: rekey.length === 0,
    rekey,
    liveKeys,
    meta: {
      reducedSplits,
      layersBefore,
      layersAfter: getLayerCount(next) ?? 1,
      frameCount: before.length,
      dslLengthBefore: canonical.length,
      dslLengthAfter: next.length,
      maxDriftPx,
    },
  };
}
