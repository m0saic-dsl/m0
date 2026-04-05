/**
 * Aspect Fit builder.
 *
 * Fits a target aspect ratio inside a root canvas, emitting a m0 DSL
 * string with exactly 1 rendered frame and `-` null tiles for all
 * remaining space (letterbox / pillarbox bars).
 *
 * Supports alignment controls and optional padding.
 */

import type { M0String } from "@m0saic/dsl";
import { container } from "./container";
import {
  gcd,
  buildSingleAxisSplit,
  buildNestedSplit,
} from "./_internal/barSplit";

// ── Types ─────────────────────────────────────────────────

/** Normalized aspect ratio expressed as two positive numbers. */
export type AspectRatio = {
  readonly w: number;
  readonly h: number;
};

/** Horizontal alignment for pillarbox bars. */
export type AspectFitHAlign = "left" | "center" | "right";

/** Vertical alignment for letterbox bars. */
export type AspectFitVAlign = "top" | "center" | "bottom";

/** Options for {@link aspectFit}. */
export type AspectFitOptions = {
  /** Root canvas width in pixels. Positive integer. */
  rootW: number;
  /** Root canvas height in pixels. Positive integer. */
  rootH: number;
  /** Target aspect ratio. Both components must be positive. */
  target: AspectRatio;
  /** Horizontal alignment when pillarboxing. Default: `"center"`. */
  hAlign?: AspectFitHAlign;
  /** Vertical alignment when letterboxing. Default: `"center"`. */
  vAlign?: AspectFitVAlign;
  /**
   * Uniform padding applied to all sides, as a fraction of the root
   * dimension on that axis (0–<0.5).  0.1 = 10% of rootW inset on
   * left AND right, 10% of rootH inset on top AND bottom.
   * Per-side fields below override this when present.
   */
  padding?: number;
  /** Left padding — fraction of rootW (0–<0.5). */
  paddingLeft?: number;
  /** Right padding — fraction of rootW (0–<0.5). */
  paddingRight?: number;
  /** Top padding — fraction of rootH (0–<0.5). */
  paddingTop?: number;
  /** Bottom padding — fraction of rootH (0–<0.5). */
  paddingBottom?: number;
};

/** Result from {@link aspectFit}. */
export type AspectFitResult = {
  /** Canonical m0 string. Exactly 1 rendered frame. */
  m0: M0String;
  /** Fitted frame width in pixels (at the given root dimensions). */
  frameW: number;
  /** Fitted frame height in pixels (at the given root dimensions). */
  frameH: number;
  /** Total token count of the outermost split (0 for exact fit). */
  totalWeight: number;
};

// ── Helpers ───────────────────────────────────────────────

/**
 * Compute the maximal rect preserving `tw:th` aspect ratio inside a
 * bounding box of `boxW x boxH`.
 *
 * Uses integer cross-multiplication to avoid floating-point comparison.
 */
function fitInside(
  boxW: number,
  boxH: number,
  tw: number,
  th: number,
): { w: number; h: number } {
  const crossBox = boxW * th;
  const crossTarget = tw * boxH;

  if (crossBox === crossTarget) {
    return { w: boxW, h: boxH };
  } else if (crossBox < crossTarget) {
    return { w: boxW, h: Math.floor((boxW * th) / tw) };
  } else {
    return { w: Math.floor((boxH * tw) / th), h: boxH };
  }
}

// ── Main ──────────────────────────────────────────────────

/**
 * Fit a target aspect ratio inside a root canvas.
 *
 * Emits a m0 string with exactly 1 rendered frame (`1`) and
 * `-` null tiles filling the remaining space.
 *
 * **Padding algorithm:**
 * 1. Convert padding ratios to pixel insets against the root canvas.
 * 2. Carve out the usable region (root minus insets).
 * 3. Aspect-fit the target ratio inside the usable region.
 * 4. Align inside the usable region, then offset by insets to get
 *    root-relative bar sizes.
 *
 * @example
 * // 16:9 root, 21:9 target → letterbox (bars top + bottom)
 * aspectFit({ rootW: 1920, rootH: 1080, target: { w: 21, h: 9 } })
 *
 * @example
 * // Exact fit → bare "1"
 * aspectFit({ rootW: 1920, rootH: 1080, target: { w: 16, h: 9 } })
 */
export function aspectFit(opts: AspectFitOptions): AspectFitResult {
  const { rootW, rootH, target, hAlign = "center", vAlign = "center" } = opts;

  // ── Input validation ──────────────────────────────────
  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error(
      `aspectFit: rootW must be a positive integer, got ${rootW}`,
    );
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error(
      `aspectFit: rootH must be a positive integer, got ${rootH}`,
    );
  if (typeof target?.w !== "number" || target.w <= 0)
    throw new Error(`aspectFit: target.w must be positive, got ${target?.w}`);
  if (typeof target?.h !== "number" || target.h <= 0)
    throw new Error(`aspectFit: target.h must be positive, got ${target?.h}`);

  // ── Step 1: Resolve padding ratios → pixel insets against root ──
  const padL = opts.paddingLeft ?? opts.padding ?? 0;
  const padR = opts.paddingRight ?? opts.padding ?? 0;
  const padT = opts.paddingTop ?? opts.padding ?? 0;
  const padB = opts.paddingBottom ?? opts.padding ?? 0;

  if (padL < 0 || padR < 0 || padT < 0 || padB < 0)
    throw new Error("aspectFit: padding values must be non-negative");
  if (padL + padR >= 1)
    throw new Error(
      `aspectFit: paddingLeft + paddingRight must be < 1, got ${padL + padR}`,
    );
  if (padT + padB >= 1)
    throw new Error(
      `aspectFit: paddingTop + paddingBottom must be < 1, got ${padT + padB}`,
    );

  const insetL = Math.floor(rootW * padL);
  const insetR = Math.floor(rootW * padR);
  const insetT = Math.floor(rootH * padT);
  const insetB = Math.floor(rootH * padB);

  // ── Step 2: Carve out usable region ──
  const usableW = rootW - insetL - insetR;
  const usableH = rootH - insetT - insetB;

  if (usableW < 1 || usableH < 1)
    throw new Error(
      "aspectFit: padding is too large for the given dimensions",
    );

  // Normalize target ratio to integers for cross-multiplication
  let tw = target.w;
  let th = target.h;
  if (!Number.isInteger(tw) || !Number.isInteger(th)) {
    const scale = 1_000_000;
    tw = Math.round(tw * scale);
    th = Math.round(th * scale);
  }
  const rg = gcd(tw, th);
  tw /= rg;
  th /= rg;

  // ── Step 3: Aspect-fit target inside the usable region ──
  const fit = fitInside(usableW, usableH, tw, th);

  if (fit.w < 1 || fit.h < 1)
    throw new Error(
      "aspectFit: target ratio is too extreme for the given root dimensions",
    );

  const frameW = fit.w;
  const frameH = fit.h;

  // ── Step 4: Align inside the usable region ──
  const hGapUsable = usableW - frameW;
  let leftWithinUsable: number;
  let rightWithinUsable: number;
  switch (hAlign) {
    case "left":
      leftWithinUsable = 0;
      rightWithinUsable = hGapUsable;
      break;
    case "right":
      leftWithinUsable = hGapUsable;
      rightWithinUsable = 0;
      break;
    case "center":
    default:
      leftWithinUsable = Math.floor(hGapUsable / 2);
      rightWithinUsable = hGapUsable - leftWithinUsable;
      break;
  }

  const vGapUsable = usableH - frameH;
  let topWithinUsable: number;
  let bottomWithinUsable: number;
  switch (vAlign) {
    case "top":
      topWithinUsable = 0;
      bottomWithinUsable = vGapUsable;
      break;
    case "bottom":
      topWithinUsable = vGapUsable;
      bottomWithinUsable = 0;
      break;
    case "center":
    default:
      topWithinUsable = Math.floor(vGapUsable / 2);
      bottomWithinUsable = vGapUsable - topWithinUsable;
      break;
  }

  // ── Step 5: Convert to root-relative bars ──
  const leftBar = insetL + leftWithinUsable;
  const rightBar = insetR + rightWithinUsable;
  const topBar = insetT + topWithinUsable;
  const bottomBar = insetB + bottomWithinUsable;

  // ── Step 6: Build DSL ──
  const hasHBars = leftBar > 0 || rightBar > 0;
  const hasVBars = topBar > 0 || bottomBar > 0;

  let m0: M0String;
  let totalWeight = 0;

  if (!hasHBars && !hasVBars) {
    // Exact fit
    m0 = container(["1"], "col");
  } else if (!hasHBars) {
    // Vertical bars only (letterbox)
    const r = buildSingleAxisSplit(topBar, frameH, bottomBar, "row");
    m0 = r.m0;
    totalWeight = r.totalWeight;
  } else if (!hasVBars) {
    // Horizontal bars only (pillarbox)
    const r = buildSingleAxisSplit(leftBar, frameW, rightBar, "col");
    m0 = r.m0;
    totalWeight = r.totalWeight;
  } else {
    // Both axes (padding or non-uniform padding)
    const r = buildNestedSplit(
      topBar,
      bottomBar,
      leftBar,
      rightBar,
      frameW,
      frameH,
    );
    m0 = r.m0;
    totalWeight = r.totalWeight;
  }

  return { m0, frameW, frameH, totalWeight };
}
