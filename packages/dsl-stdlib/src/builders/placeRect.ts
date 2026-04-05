/**
 * Place Rect builder.
 *
 * Places an exact pixel-sized rectangle inside a root canvas, emitting
 * a m0 string with exactly 1 rendered frame and `-` null tiles
 * for all remaining space.
 *
 * Unlike Aspect Fit (which works from ratios), Place Rect takes exact
 * pixel dimensions. This is useful when you know the precise inner
 * canvas size you need — e.g. placing a grid-safe region inside a
 * larger root.
 */

import type { M0String } from "@m0saic/dsl";
import { container } from "./container";
import {
  buildSingleAxisSplit,
  buildNestedSplit,
} from "./_internal/barSplit";

// ── Types ─────────────────────────────────────────────────

/** Horizontal alignment. */
export type PlaceRectHAlign = "left" | "center" | "right";

/** Vertical alignment. */
export type PlaceRectVAlign = "top" | "center" | "bottom";

/** Options for {@link placeRect}. */
export type PlaceRectOptions = {
  /** Root canvas width in pixels. Positive integer. */
  rootW: number;
  /** Root canvas height in pixels. Positive integer. */
  rootH: number;
  /** Inner rect width in pixels. Positive integer, must be <= rootW. */
  rectW: number;
  /** Inner rect height in pixels. Positive integer, must be <= rootH. */
  rectH: number;
  /** Horizontal alignment. Default: `"center"`. */
  hAlign?: PlaceRectHAlign;
  /** Vertical alignment. Default: `"center"`. */
  vAlign?: PlaceRectVAlign;
};

/** Result from {@link placeRect}. */
export type PlaceRectResult = {
  /** Canonical m0 string. Exactly 1 rendered frame. */
  m0: M0String;
  /** Placed rect width in pixels. */
  rectW: number;
  /** Placed rect height in pixels. */
  rectH: number;
  /** Total token count of the outermost split (0 for exact fit). */
  totalWeight: number;
};

// ── Main ──────────────────────────────────────────────────

/**
 * Place an exact pixel-sized rectangle inside a root canvas.
 *
 * Emits a m0 string with exactly 1 rendered frame (`1`) and
 * `-` null tiles filling the remaining space.
 *
 * @example
 * // Center a 1740x975 region inside 1920x1080
 * placeRect({ rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975 })
 *
 * @example
 * // Exact fit → bare "1"
 * placeRect({ rootW: 1920, rootH: 1080, rectW: 1920, rectH: 1080 })
 */
export function placeRect(opts: PlaceRectOptions): PlaceRectResult {
  const { rootW, rootH, rectW, rectH, hAlign = "center", vAlign = "center" } = opts;

  // ── Input validation ──
  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error(`placeRect: rootW must be a positive integer, got ${rootW}`);
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error(`placeRect: rootH must be a positive integer, got ${rootH}`);
  if (!Number.isInteger(rectW) || rectW < 1)
    throw new Error(`placeRect: rectW must be a positive integer, got ${rectW}`);
  if (!Number.isInteger(rectH) || rectH < 1)
    throw new Error(`placeRect: rectH must be a positive integer, got ${rectH}`);
  if (rectW > rootW)
    throw new Error(`placeRect: rectW (${rectW}) must be <= rootW (${rootW})`);
  if (rectH > rootH)
    throw new Error(`placeRect: rectH (${rectH}) must be <= rootH (${rootH})`);

  // ── Compute bars ──
  const hGap = rootW - rectW;
  let leftBar: number;
  let rightBar: number;
  switch (hAlign) {
    case "left":
      leftBar = 0;
      rightBar = hGap;
      break;
    case "right":
      leftBar = hGap;
      rightBar = 0;
      break;
    case "center":
    default:
      leftBar = Math.floor(hGap / 2);
      rightBar = hGap - leftBar;
      break;
  }

  const vGap = rootH - rectH;
  let topBar: number;
  let bottomBar: number;
  switch (vAlign) {
    case "top":
      topBar = 0;
      bottomBar = vGap;
      break;
    case "bottom":
      topBar = vGap;
      bottomBar = 0;
      break;
    case "center":
    default:
      topBar = Math.floor(vGap / 2);
      bottomBar = vGap - topBar;
      break;
  }

  // ── Build DSL ──
  const hasHBars = leftBar > 0 || rightBar > 0;
  const hasVBars = topBar > 0 || bottomBar > 0;

  let m0: M0String;
  let totalWeight = 0;

  if (!hasHBars && !hasVBars) {
    m0 = container(["1"], "col");
  } else if (!hasHBars) {
    const r = buildSingleAxisSplit(topBar, rectH, bottomBar, "row");
    m0 = r.m0;
    totalWeight = r.totalWeight;
  } else if (!hasVBars) {
    const r = buildSingleAxisSplit(leftBar, rectW, rightBar, "col");
    m0 = r.m0;
    totalWeight = r.totalWeight;
  } else {
    const r = buildNestedSplit(topBar, bottomBar, leftBar, rightBar, rectW, rectH);
    m0 = r.m0;
    totalWeight = r.totalWeight;
  }

  return { m0, rectW, rectH, totalWeight };
}
