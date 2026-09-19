/**
 * Bake Insets — fold per-frame render-time insets back into the m0 geometry.
 *
 * The inverse of {@link placeInsetRects}. `placeInsetRects` GENERATES recovery
 * insets: it quantizes cells to a coarse lattice (cheap m0) and hands back a
 * per-rect `placement.inset` the engine applies at render time. `bakeInsets`
 * CONSUMES those insets: given an m0 plus one inset per rendered frame, it
 * shrinks each frame's cell exactly as the engine does and re-emits the shrunk
 * rects as a single, self-contained, inset-free m0. Complexity moves out of the
 * fiber (the per-leaf `placement.inset`) and back into the base string, so the
 * string now SHOWS the final layout — the gutters an inset produced are visible
 * in the geometry instead of hidden in a render-time property.
 *
 * ## Byte-exactness with the engine
 *
 * The parse here (`queryFrames(m0,{width,height}).render()`) is the SAME parser,
 * at the SAME canvas, that the engine renders with — its frames carry integer
 * geometry in contiguous paint order. Each inset is applied with the EXACT math
 * of core's `applyInsetToRect` (ffmpegCommands.ts): `Math.floor(f · cellSize)`
 * per edge, then `Math.max(1, …)` on size. So a frame's baked rect equals the
 * rect the engine actually painted, pixel-for-pixel — the re-emitted m0 renders
 * byte-identically to the original m0 + fiber insets. The shared
 * {@link packLeafRects} core re-parses its own output and asserts every rect
 * round-trips, so a bad emit throws rather than producing a wrong string.
 *
 * ## Z-order
 *
 * Frames are baked and packed in paint order (base → top) via
 * `packLeafRects({ preserveZOrder: true })` — the minLayer constraint keeps the
 * input stacking exactly wherever rects overlap (a stronger guarantee than
 * `placeRects.importance` buckets). This is why the inset array is index-aligned
 * to paint order: the function reads and re-emits z in the same single walk.
 *
 * ## Resolution-baked
 *
 * The output is ABSOLUTE (per-pixel band decomposition) and therefore only valid
 * at `width`×`height` — the same resolution-dependent trade `rebuildRects` makes.
 * That is intended: this is a head-level inspection artifact (the third
 * `.flattened.inset.m0` save-m0 sidecar) that owns its canvas and never nests.
 * The string is "significantly longer" than the input — expected, not a defect.
 *
 * Pure and deterministic. No I/O.
 *
 * @example
 * // A 2×2 grid whose two right cells carry a 6% inset → the gutters become
 * // real geometry in the returned m0.
 * const { m0 } = bakeInsets({
 *   m0: "1{2[2(1,1),2(1,1)]}", width: 1024, height: 1024,
 *   insets: [null, null, { top: .06, right: .06, bottom: .06, left: .06 }, null],
 * });
 */

import type { M0String } from "@m0saic/dsl";
import type { PlaceInsetRectsInset } from "./placeInsetRects";
import type { PlaceRectsRect } from "./placeRects";
import { packLeafRects } from "./_internal/packLeafRects";
import { queryFrames } from "../queries/queryFrames";
import { validateInputOrThrow } from "../transforms/_internal/output";

// ── Types ─────────────────────────────────────────────────

/**
 * Per-frame inset, index-aligned to the PAINT-ORDER render frames of the input
 * m0 (`paintOrder` 0..N-1). `null` = that frame has no inset (identity). The
 * four-edge fractions (0..1 of cell width for left/right, cell height for
 * top/bottom) are the SAME fractions core resolves via `resolveBoxFrac` and
 * applies via `applyInsetToRect` — NOT the half-pixel-centered RECOVERY
 * fractions {@link placeInsetRects} emits (identical struct, different origin).
 */
export type BakeInsetsInset = PlaceInsetRectsInset | null;

export type BakeInsetsOptions = {
  /** The (typically flattened) m0 whose cell geometry to rewrite. */
  m0: string;
  /** Canvas width in px. Positive integer. MUST equal the render canvas. */
  width: number;
  /** Canvas height in px. Positive integer. MUST equal the render canvas. */
  height: number;
  /**
   * One entry per rendered frame, index-aligned to paint order. Its length MUST
   * equal the render-frame count of `m0` at (width, height) exactly, or the
   * call throws. Use `null` for frames with no inset.
   */
  insets: BakeInsetsInset[];
  /**
   * Lossless split-count tidy after packing (collapses reducible split counts
   * the band decomposition left behind; preserves geometry). Default true.
   */
  reduceSplits?: boolean;
};

export type BakeInsetsResult = {
  /** The rebuilt, inset-free m0 whose cell rects already reflect the insets. */
  m0: M0String;
  /** The baked integer rect for each input frame, in paint order. */
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  meta: {
    /** Rendered-frame count (== `insets.length`). */
    frameCount: number;
    /** How many frames actually shrank (a non-identity inset). */
    insetCount: number;
    dslLengthBefore: number;
    /** Length of the rebuilt m0 — expected to be larger (absolute rebuild). */
    dslLengthAfter: number;
    /** Overlay layer count of the rebuilt m0. */
    layersAfter: number;
  };
};

// ── Main ──────────────────────────────────────────────────

export function bakeInsets(opts: BakeInsetsOptions): BakeInsetsResult {
  const { width, height } = opts;
  if (!Number.isInteger(width) || width < 1)
    throw new Error(`bakeInsets: width must be a positive integer, got ${width}`);
  if (!Number.isInteger(height) || height < 1)
    throw new Error(`bakeInsets: height must be a positive integer, got ${height}`);

  const canonical = validateInputOrThrow("bakeInsets", opts.m0);
  const frames = queryFrames(canonical, { width, height }).render();
  if (frames.length === 0)
    throw new Error("bakeInsets: document has no rendered frames");
  if (opts.insets.length !== frames.length)
    throw new Error(
      `bakeInsets: insets length (${opts.insets.length}) must equal the render-frame count (${frames.length})`,
    );

  let insetCount = 0;
  const baked: PlaceRectsRect[] = frames.map((f, i) => {
    // Round to the exact integer render frame the engine uses (frames are
    // already integer-valued; the round + clamp is defensive).
    const x = Math.max(0, Math.round(f.x));
    const y = Math.max(0, Math.round(f.y));
    const w = Math.max(1, Math.round(f.width));
    const h = Math.max(1, Math.round(f.height));
    const inset = opts.insets[i];
    if (!inset) return { x, y, w, h };
    // EXACT mirror of core applyInsetToRect (ffmpegCommands.ts): floor per edge
    // on the integer cell, then clamp size — so l/r/t/b match bit-for-bit.
    const l = Math.floor(inset.left * w);
    const r = Math.floor(inset.right * w);
    const t = Math.floor(inset.top * h);
    const b = Math.floor(inset.bottom * h);
    if (l || r || t || b) insetCount++;
    return { x: x + l, y: y + t, w: Math.max(1, w - (l + r)), h: Math.max(1, h - (t + b)) };
  });

  // Pack in paint order, preserving z exactly wherever rects overlap.
  const pk = packLeafRects({
    rects: baked,
    width,
    height,
    preserveZOrder: true,
    reduceSplits: opts.reduceSplits ?? true,
  });

  return {
    m0: pk.m0,
    rects: baked.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
    meta: {
      frameCount: frames.length,
      insetCount,
      dslLengthBefore: canonical.length,
      dslLengthAfter: pk.m0.length,
      layersAfter: pk.layersAfter,
    },
  };
}
