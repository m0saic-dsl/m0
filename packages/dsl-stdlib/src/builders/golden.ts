/**
 * Golden ratio builders.
 *
 * Three pure-geometry primitives that approximate the golden ratio (φ ≈
 * 1.6180339887…) using integer Fibonacci ratios. The DSL itself stays
 * integer-weighted — these builders just pick a Fibonacci pair and emit
 * a normal weighted split, indistinguishable from any hand-tuned ratio.
 *
 * Why integer Fibonacci pairs:
 *   Successive Fibonacci numbers (8/5, 13/8, 21/13, 34/21, 55/34, …)
 *   converge to φ. They give us:
 *     - a knob (precision = which pair) for trading approximation error
 *       against DSL string length — 21/13 is visually golden, 144/89
 *       is mathematically golden, but 144/89 emits a much longer DSL.
 *     - integer weights, which is all the DSL accepts — no rounding to
 *       worry about, and `gcdArray` in weightedSplit can't reduce them
 *       further (consecutive Fibonacci pairs are coprime).
 *
 * Design philosophy (matches the source article on golden ratio in
 * design): φ is a guide, not a constraint. These builders give you the
 * proportion; they don't claim it's always the right choice. Use them
 * to back generators that surface the option, score with the option as
 * a soft preference, and let users opt in.
 */

import type { M0String } from "@m0saic/dsl";
import type { ContainerAxis } from "./container";
import { weightedSplit } from "./weightedSplit";
import { placeRect } from "./placeRect";
import type { PlaceRectHAlign, PlaceRectVAlign, PlaceRectResult } from "./placeRect";

// ── Fibonacci pairs that converge to φ ────────────────────

/**
 * Successive Fibonacci pairs `[larger, smaller]` whose ratio approximates
 * φ ≈ 1.61803… The closer we go (further down the table) the better the
 * approximation, at the cost of a larger total weight in the emitted DSL.
 *
 * Index 0 = 13/8 ≈ 1.625 (visually golden, very compact DSL).
 * Index 4 = 144/89 ≈ 1.61798 (mathematically negligible error).
 */
const FIBONACCI_PAIRS = [
  [13, 8],   // 1.625    — error 0.43%
  [21, 13],  // 1.6154   — error 0.16%
  [34, 21],  // 1.61905  — error 0.063%
  [55, 34],  // 1.61765  — error 0.024%
  [89, 55],  // 1.61818  — error 0.009%
  [144, 89], // 1.61798  — error 0.003%
] as const;

/** Precision presets — index into {@link FIBONACCI_PAIRS}. */
export type GoldenPrecision = "13/8" | "21/13" | "34/21" | "55/34" | "89/55" | "144/89";

const PRECISION_INDEX: Record<GoldenPrecision, number> = {
  "13/8":   0,
  "21/13":  1,
  "34/21":  2,
  "55/34":  3,
  "89/55":  4,
  "144/89": 5,
};

function pickPair(p: GoldenPrecision = "21/13"): readonly [number, number] {
  return FIBONACCI_PAIRS[PRECISION_INDEX[p] ?? 1];
}

// ── goldenSplit ───────────────────────────────────────────

/** Options for {@link goldenSplit}. */
export type GoldenSplitOptions = {
  /** Split axis. `"col"` = horizontal split (φ:1 widths), `"row"` = vertical. */
  axis: ContainerAxis;
  /**
   * Whether the LARGER (φ-weight) cell comes first. Default `true`.
   * `true`  → `[φ, 1]` (large-then-small)
   * `false` → `[1, φ]` (small-then-large)
   */
  dominantFirst?: boolean;
  /**
   * Fibonacci pair to use for the φ approximation. Higher precision = closer
   * to true φ but longer DSL. Default `"21/13"` (visually golden, compact).
   */
  precision?: GoldenPrecision;
  /** Claimant token for the large cell. Default `"F"`. */
  largeClaimant?: M0String | string;
  /** Claimant token for the small cell. Default `"F"`. */
  smallClaimant?: M0String | string;
};

/**
 * Build a single golden-ratio split — two cells weighted φ:1 (or 1:φ).
 * The two-column asymmetric layout that the design article centers on.
 *
 * @example
 * goldenSplit({ axis: "col" })
 * // => "21(0,0,0,0,0,0,0,0,0,0,0,0,F,0,0,0,0,0,0,0,F)"
 * //    (13 slots claim left cell, 8 slots claim right cell, ratio 13:8 ≈ φ)
 *
 * @example
 * goldenSplit({ axis: "col", precision: "13/8", largeClaimant: "F", smallClaimant: "F" })
 * // => "21(0,...0,F,0,...,0,F)"  // shortest DSL, ratio 13:8
 */
export function goldenSplit(opts: GoldenSplitOptions): M0String {
  const {
    axis,
    dominantFirst = true,
    precision = "21/13",
    largeClaimant = "F",
    smallClaimant = "F",
  } = opts;

  const [large, small] = pickPair(precision);
  const weights = dominantFirst ? [large, small] : [small, large];
  const claimants = dominantFirst
    ? [String(largeClaimant), String(smallClaimant)]
    : [String(smallClaimant), String(largeClaimant)];

  return weightedSplit(weights, axis, { claimants, mode: "literal" });
}

// ── goldenSpiral ──────────────────────────────────────────

/** Which corner the spiral wraps around (visually). */
export type GoldenSpiralCorner = "tl" | "tr" | "bl" | "br";

/** Options for {@link goldenSpiral}. */
export type GoldenSpiralOptions = {
  /**
   * Number of recursive splits. Each level halves on the perpendicular axis
   * relative to the previous. Typical range 3–6:
   *   - 3: very simple "L" composition
   *   - 4–5: classic spiral, recognizable
   *   - 6: high-fidelity spiral, longer DSL
   *   - 7+: visually similar to 6 but DSL grows substantially
   */
  depth: number;
  /**
   * Corner the spiral originates from. Determines which children carry
   * the recursion (left/right alternation as the axis flips).
   */
  direction?: GoldenSpiralCorner;
  /** Fibonacci pair precision per split. Default `"21/13"`. */
  precision?: GoldenPrecision;
};

/**
 * Recursive golden splits that approximate a Fibonacci/golden spiral.
 *
 * At each level, the larger cell from the parent split gets re-split on
 * the *perpendicular* axis. The spiral direction controls which child
 * carries the recursion at each step:
 *
 *   "tl" — large cell on the right, then bottom, then left, then top, ...
 *   "tr" — large cell on the left, then bottom, then right, then top, ...
 *   "bl" — large cell on the right, then top, then left, then bottom, ...
 *   "br" — large cell on the left, then top, then right, then bottom, ...
 *
 * @example
 * goldenSpiral({ depth: 4, direction: "br" })
 */
export function goldenSpiral(opts: GoldenSpiralOptions): M0String {
  const { depth, direction = "br", precision = "21/13" } = opts;

  if (!Number.isInteger(depth) || depth < 1) {
    throw new Error(`goldenSpiral: depth must be a positive integer, got ${depth}`);
  }
  if (depth > 10) {
    throw new Error(`goldenSpiral: depth ${depth} produces an impractically long DSL (limit 10)`);
  }

  // Direction maps to (startAxis, dominantStartsFirst, axisFlipParity).
  // The "direction" name describes the visual outer-to-inner spiral path.
  const startAxis: ContainerAxis = direction === "tl" || direction === "tr" ? "col" : "col";
  // For the four corners, the first split is always horizontal (col); the
  // dominantFirst flag controls whether the large cell is on left or right.
  // Subsequent levels flip axis (col↔row) and may flip dominantFirst based
  // on whether the spiral wraps clockwise or counter-clockwise.
  const cornerToInitial: Record<GoldenSpiralCorner, { dominantFirstStart: boolean; clockwise: boolean }> = {
    tl: { dominantFirstStart: false, clockwise: true  },  // large on right, wrap clockwise
    tr: { dominantFirstStart: true,  clockwise: false },  // large on left, wrap counter-clockwise
    bl: { dominantFirstStart: false, clockwise: false },  // large on right, wrap counter-clockwise
    br: { dominantFirstStart: true,  clockwise: true  },  // large on left, wrap clockwise
  };
  const { dominantFirstStart, clockwise } = cornerToInitial[direction];

  // Build inside-out: innermost cell is just `F`, then wrap depth-1 times.
  let inner: string = "F";
  for (let level = depth - 1; level >= 0; level--) {
    const axis: ContainerAxis = (level % 2 === 0) === (startAxis === "col") ? "col" : "row";
    // Dominant-first alternates per level when the spiral wraps clockwise
    // (each step turns 90°, which flips the side the large cell sits on).
    const dominantFirst = level % 2 === 0
      ? dominantFirstStart
      : (clockwise ? !dominantFirstStart : dominantFirstStart);

    inner = goldenSplit({
      axis,
      dominantFirst,
      precision,
      // The "smaller" cell at this level holds the next inner spiral; the
      // "larger" cell is a normal F leaf.
      largeClaimant: "F",
      smallClaimant: inner,
    });
  }

  return inner as M0String;
}

// ── goldenRect ────────────────────────────────────────────

/** Result from {@link goldenRect}. */
export type GoldenRectResult = PlaceRectResult & {
  /** True when the canvas was wider than tall (landscape golden rect). */
  landscape: boolean;
};

/** Options for {@link goldenRect}. */
export type GoldenRectOptions = {
  /** Outer canvas width in pixels. Positive integer. */
  rootW: number;
  /** Outer canvas height in pixels. Positive integer. */
  rootH: number;
  /**
   * Force orientation. Default `"auto"` picks landscape (1.618:1) when the
   * canvas is wider than φ-tall, otherwise portrait (1:1.618).
   */
  orientation?: "auto" | "landscape" | "portrait";
  /** Horizontal alignment inside the canvas. Default `"center"`. */
  hAlign?: PlaceRectHAlign;
  /** Vertical alignment inside the canvas. Default `"center"`. */
  vAlign?: PlaceRectVAlign;
};

const PHI = 1.6180339887498949;

/**
 * Compute the largest 1.618:1 (or 1:1.618) rectangle that fits inside
 * the canvas, then wrap it in a `placeRect` so the outer canvas keeps
 * the user's chosen dimensions. The classic "design with golden
 * rectangle" pattern from the source article (their example: 960×594
 * canvas), generalized to arbitrary canvas sizes via letterboxing.
 *
 * @example
 * goldenRect({ rootW: 1920, rootH: 1080 })
 * // landscape: rect ≈ 1747×1080 (1080 × φ ≈ 1747), pillarboxed in 1920×1080
 *
 * @example
 * goldenRect({ rootW: 1080, rootH: 1920, orientation: "portrait" })
 * // portrait: rect ≈ 1080×1747, letterboxed in 1080×1920
 */
export function goldenRect(opts: GoldenRectOptions): GoldenRectResult {
  const {
    rootW,
    rootH,
    orientation = "auto",
    hAlign = "center",
    vAlign = "center",
  } = opts;

  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error("goldenRect: rootW must be a positive integer");
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error("goldenRect: rootH must be a positive integer");

  const canvasAR = rootW / rootH;
  const landscape =
    orientation === "landscape" ? true :
    orientation === "portrait"  ? false :
    canvasAR >= 1; // auto

  let rectW: number, rectH: number;
  if (landscape) {
    // Target rect: width:height = φ:1 (wider than tall)
    if (rootW / rootH >= PHI) {
      // Canvas is wider than φ — height-constrained.
      rectH = rootH;
      rectW = Math.round(rootH * PHI);
    } else {
      // Canvas is taller-or-equal-φ — width-constrained.
      rectW = rootW;
      rectH = Math.round(rootW / PHI);
    }
  } else {
    // Target rect: width:height = 1:φ (taller than wide)
    if (rootH / rootW >= PHI) {
      // Canvas is taller than 1:φ — width-constrained.
      rectW = rootW;
      rectH = Math.round(rootW * PHI);
    } else {
      // Canvas is wider-or-equal-1:φ — height-constrained.
      rectH = rootH;
      rectW = Math.round(rootH / PHI);
    }
  }

  // Clamp in case rounding pushed us slightly past the canvas.
  rectW = Math.min(rectW, rootW);
  rectH = Math.min(rectH, rootH);

  const placed = placeRect({ rootW, rootH, rectW, rectH, hAlign, vAlign });
  return { ...placed, landscape };
}
