/**
 * Place Inset Rects — zero-drift, bounded-precision `placeRects`.
 *
 * `placeRects` places rects at EXACT pixels; coprime edges blow the precision
 * floor up to 100% (the layout "needs its exact canvas" and pins any parent it
 * nests into). `placeOptimizedRects` collapses the floor by MOVING edges (visual
 * drift). This builder collapses it with ZERO visual drift: quantize each rect's
 * cell OUTWARD to a coarse pitch (cheap precision), then recover the exact pixel
 * bounds with a per-rect `placement.inset` on the leaf source — a render-time
 * fractional shrink that costs no DSL tokens and no precision.
 *
 * The model (per axis, independent):
 *   - The pitch `P` is chosen from the DIVISORS of the axis — never `round()`.
 *     With a non-divisor pitch the trailing margin is `≡ axisLen mod P`, so the
 *     band gcd collapses to `gcd(P, axisLen)` (1280 @ basis 120 → P=11 → gcd 1 →
 *     precision 1280, total failure). The smallest divisor ≥ `axisLen / basis`
 *     realizes `precision = axisLen/P ≤ basis`.
 *   - Cells quantize OUTWARD (`cell ⊇ rect`) because inset only shrinks. Cells
 *     that collide after quantization (originally-disjoint rects with a gap
 *     containing no multiple of `P`) spill to separate overlay layers via
 *     `placeRects` packing — the PAINTED content (post-inset) stays disjoint, so
 *     overlap costs layers, not correctness.
 *   - Inset fractions are HALF-PIXEL-CENTERED: `(n + 0.5) / cellSize`, never
 *     `n / cellSize`. The engine FLOORS (`applyInsetToRect`:
 *     `Math.floor(f * cellW)`), and `floor((n/W)·W)` loses a pixel on real pairs
 *     ((15,22), (13,23), (15,26), …); the `+0.5` form recovers the exact px for
 *     every `n < W ≤ 7680` (swept) and degrades gracefully (±1px, ordinary ratio
 *     behavior) if the string renders at another canvas.
 *
 * Caller contract: wire `insets[i]` onto `rects[i]`'s source `placement.inset`.
 * Leaf-scoped — an inset repositions a painted SOURCE within its cell; a rect
 * whose claimant is a container cannot take one. Leaves must paint nothing
 * outside their inset box (transparent cell margins); a tile that paints a
 * cell-filling background shows the QUANTIZED cell, not the target.
 *
 * Hostile axes (prime / divisor-poor for your rect sizes) throw rather than
 * silently emit a 100%-precision string — the escapes are the self-framed
 * coarse-quantize fix (handbook feasibility-precision-quantization.md §3c),
 * `placeOptimizedRects` drift, or a higher `basis` / lower `minFill`. Runtime
 * templates (which must render at ANY canvas) pass `onHostile: "exact"` — that
 * axis places exactly and the result reports it via `hostile`.
 *
 * @example
 * // Chrome soup exact at 1280×720, precision bounded at 80×72 instead of 1280×720.
 * const { m0, insets } = placeInsetRects({
 *   rootW: 1280, rootH: 720, basis: 120,
 *   rects: [
 *     { x: 141, y: 67, w: 129, h: 43, claimant: "F" },
 *     { x: 611, y: 385, w: 590, h: 290, claimant: "F" },
 *   ],
 * });
 * // insets[0] → wire onto source 0's placement.inset; painted bounds land
 * // exactly on (141, 67, 129, 43) inside its lattice-aligned cell.
 */

import type { M0String } from "@m0saic/dsl";
import { placeRects } from "./placeRects";
import type { PlaceRectsRect, PlaceRectsLayer } from "./placeRects";

// ── Types ─────────────────────────────────────────────────

export type PlaceInsetRectsRect = PlaceRectsRect;

/**
 * Per-side fractional inset of the QUANTIZED cell (0..1 of cell width for
 * left/right, of cell height for top/bottom). Structurally compatible with the
 * object form of `@m0saic/types` `MosaicBoxFrac` — assign it directly to a
 * source's `placement.inset`. Fractions are half-pixel-centered (see module
 * doc); `0` means the edge already sits on the lattice.
 */
export type PlaceInsetRectsInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PlaceInsetRectsOptions = {
  /** Root canvas width. Positive integer. */
  rootW: number;
  /** Root canvas height. Positive integer. */
  rootH: number;
  /** Rectangles to place (non-empty). */
  rects: PlaceInsetRectsRect[];
  /**
   * Target split basis per axis (max slot count). Default `120` — the per-axis
   * gcd of the modern canvas family (1080/1920/2160/3840/4320/7680), so a ≤120
   * basis stays exact across all of it. The realized pitch is the smallest
   * DIVISOR of the axis ≥ `axisLen / basis`; the realized basis may be finer
   * than this target when the coarseness guard clamps (see `minFill`).
   */
  basis?: number;
  /**
   * Coarseness floor: every rect must keep at least this fraction of its
   * quantized cell on each axis (default `0.5`). Too coarse a pitch dwarfs
   * small rects in giant cells; when the precision-target pitch violates this,
   * a finer divisor is chosen and the result reports `clamped` on that axis
   * (realized basis above target). Range (0, 1].
   */
  minFill?: number;
  /**
   * Hostile-axis behavior (pitch degenerated to 1 while `axisLen > basis` —
   * prime / divisor-poor dims where quantization buys nothing). Default
   * `"throw"`: refuse with the escapes — right for generation-time callers who
   * must not silently emit a ~100%-precision string. `"exact"`: place that
   * axis exactly (pitch 1, zero insets on it) and report it via `hostile` —
   * right for RUNTIME templates, which must render at whatever canvas they are
   * given (this matches `placeOptimizedRects`' degradation, whose pitch also
   * falls to 1 there).
   */
  onHostile?: "throw" | "exact";
  /** Token used for empty cells. Default `"-"`. */
  emptyToken?: string;
};

export type PlaceInsetRectsResult = {
  /** Composed m0 — same shape as `placeRects` (layers chained as overlays). */
  m0: M0String;
  /** Per-layer breakdown (as `placeRects`), over the QUANTIZED cells. */
  layers: PlaceRectsLayer[];
  /**
   * Per-rect `placement.inset` recovering the exact input bounds inside the
   * quantized cell. Index-aligned with input `rects`. `null` when the cell
   * already equals the target (rect fully lattice-aligned).
   */
  insets: (PlaceInsetRectsInset | null)[];
  /** The quantized cell each rect was placed in (px). Index-aligned. */
  cells: Array<{ x: number; y: number; w: number; h: number }>;
  /** Lattice pitch chosen per axis (always a divisor of the axis length). */
  pitch: { x: number; y: number };
  /** Realized split-basis bound per axis = `axisLen ÷ pitch` — the precision floor. */
  basis: { x: number; y: number };
  /** True when the `minFill` or inset-cap guard forced a finer pitch (realized basis > target). */
  clamped: { x: boolean; y: boolean };
  /**
   * True when the axis was hostile (no usable divisor pitch) and
   * `onHostile: "exact"` placed it exactly instead of throwing. That axis's
   * precision tracks the canvas — the caller opted into the degradation.
   */
  hostile: { x: boolean; y: boolean };
};

// ── Internal: per-axis divisor-pitch selection ─────────────

function divisorsAsc(n: number): number[] {
  const s = new Set<number>();
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      s.add(i);
      s.add(n / i);
    }
  }
  return [...s].sort((a, b) => a - b);
}

type AxisSpan = { start: number; size: number };

/**
 * Engine cap on a `placement.inset` edge fraction (core `assertFrac`: 0..0.49
 * inclusive). A pitch is only usable if EVERY recovered edge clears it — a rect
 * whose recovery would exceed the cap can't be emitted, so the engine throws at
 * render. `pickPitch` guards against it so templates never emit an illegal inset.
 */
const INSET_CAP = 0.49;

/** Does every span keep ≥ `minFill` of its outward-quantized cell at pitch `p`? */
function fillOk(p: number, spans: AxisSpan[], minFill: number): boolean {
  for (const s of spans) {
    const cellStart = Math.floor(s.start / p) * p;
    const cellEnd = Math.ceil((s.start + s.size) / p) * p;
    if (s.size / (cellEnd - cellStart) < minFill) return false;
  }
  return true;
}

/**
 * Does every span's recovered edge inset clear the engine's cap at pitch `p`?
 *
 * `fillOk`/`minFill` bounds the FILL fraction — but the emitted inset is
 * half-pixel centered (`(edge+0.5)/cell`, mirroring `halfPixelFrac` below), so a
 * span that fills exactly half its cell (fill 0.5, passing `minFill 0.5`) still
 * emits `(½cell+0.5)/cell > 0.5` on the aligned edge — over the 0.49 cap. This
 * guards the emitted fraction the engine actually asserts, not the fill. Pitch 1
 * always passes (cell == span, both edges 0), so `pickPitch` always converges.
 */
function insetFracOk(p: number, spans: AxisSpan[]): boolean {
  for (const s of spans) {
    const cellStart = Math.floor(s.start / p) * p;
    const cellEnd = Math.ceil((s.start + s.size) / p) * p;
    const cellSize = cellEnd - cellStart;
    const lead = s.start - cellStart;
    const trail = cellEnd - (s.start + s.size);
    if (lead > 0 && (lead + 0.5) / cellSize > INSET_CAP) return false;
    if (trail > 0 && (trail + 0.5) / cellSize > INSET_CAP) return false;
  }
  return true;
}

/**
 * Smallest divisor of `axisLen` that is ≥ `axisLen / basis` AND passes BOTH the
 * fill guard (`fillOk`) and the inset-cap guard (`insetFracOk`, so no rect emits
 * an edge inset the engine would reject). If every precision-meeting divisor is
 * too coarse for the smallest rect, fall back to the coarsest finer divisor that
 * fits (`clamped: true` — realized basis above target). Neither guard is
 * monotone in pitch (a coarser pitch can align better with a particular rect),
 * so each candidate is tested individually — `O(σ₀(axisLen) × rects)`, trivial.
 */
function pickPitch(
  axisLen: number,
  basis: number,
  minFill: number,
  spans: AxisSpan[],
): { pitch: number; clamped: boolean } {
  const divisors = divisorsAsc(axisLen);
  const minPitch = axisLen / basis;
  const usable = (p: number) => fillOk(p, spans, minFill) && insetFracOk(p, spans);

  for (const p of divisors) {
    if (p < minPitch) continue;
    if (usable(p)) return { pitch: p, clamped: false };
  }
  const finer = divisors.filter((p) => p < minPitch);
  for (let i = finer.length - 1; i >= 0; i--) {
    if (usable(finer[i])) return { pitch: finer[i], clamped: true };
  }
  // Unreachable: pitch 1 always passes (cell == rect, fill == 1, both edges 0).
  return { pitch: 1, clamped: true };
}

// ── Internal: half-pixel-centered inset fraction ───────────

/**
 * Fraction that makes the engine's `Math.floor(f * cellDim)` recover exactly
 * `n` px. `n / cellDim` is NOT safe — `floor((n/W)·W)` can land at `n − 1`
 * (IEEE rounding); centering on `n + 0.5` gives floor a 0.5px margin instead
 * of a ~1e-13 one.
 */
const halfPixelFrac = (n: number, cellDim: number): number =>
  n === 0 ? 0 : (n + 0.5) / cellDim;

// ── Main ──────────────────────────────────────────────────

export function placeInsetRects(opts: PlaceInsetRectsOptions): PlaceInsetRectsResult {
  const { rootW, rootH, rects, emptyToken, basis = 120, minFill = 0.5, onHostile = "throw" } = opts;

  // ── Validation (mirrors placeRects / placeOptimizedRects) ──
  if (!Number.isInteger(rootW) || rootW < 1)
    throw new Error(`placeInsetRects: rootW must be a positive integer, got ${rootW}`);
  if (!Number.isInteger(rootH) || rootH < 1)
    throw new Error(`placeInsetRects: rootH must be a positive integer, got ${rootH}`);
  if (rects.length === 0)
    throw new Error("placeInsetRects: rects must be non-empty.");
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (!Number.isInteger(r.x) || r.x < 0)
      throw new Error(`placeInsetRects: rects[${i}].x must be a non-negative integer, got ${r.x}`);
    if (!Number.isInteger(r.y) || r.y < 0)
      throw new Error(`placeInsetRects: rects[${i}].y must be a non-negative integer, got ${r.y}`);
    if (!Number.isInteger(r.w) || r.w < 1)
      throw new Error(`placeInsetRects: rects[${i}].w must be a positive integer, got ${r.w}`);
    if (!Number.isInteger(r.h) || r.h < 1)
      throw new Error(`placeInsetRects: rects[${i}].h must be a positive integer, got ${r.h}`);
    if (r.x + r.w > rootW)
      throw new Error(`placeInsetRects: rects[${i}] (x=${r.x}, w=${r.w}) overflows rootW=${rootW}`);
    if (r.y + r.h > rootH)
      throw new Error(`placeInsetRects: rects[${i}] (y=${r.y}, h=${r.h}) overflows rootH=${rootH}`);
  }
  if (!(basis >= 1))
    throw new Error(`placeInsetRects: basis must be ≥ 1, got ${basis}`);
  if (!(minFill > 0 && minFill <= 1))
    throw new Error(`placeInsetRects: minFill must be in (0, 1], got ${minFill}`);

  // ── Per-axis pitch from the axis's divisors ──
  const px = pickPitch(rootW, basis, minFill, rects.map((r) => ({ start: r.x, size: r.w })));
  const py = pickPitch(rootH, basis, minFill, rects.map((r) => ({ start: r.y, size: r.h })));

  // Hostile axis: the pitch degenerated to 1 while the precision target was
  // real (axisLen > basis) — quantization bought nothing and the emit would be
  // a silent ~100%-precision string. Refuse with the escapes, unless the caller
  // opted into runtime degradation (`onHostile: "exact"` — reported, not
  // silent). An axis that already fits the budget — axisLen ≤ basis — passes
  // through exact and is NOT hostile.
  const hostile = { x: false, y: false };
  for (const [axisName, axisLen, pick] of [
    ["x", rootW, px],
    ["y", rootH, py],
  ] as const) {
    if (pick.pitch === 1 && axisLen > basis) {
      if (onHostile === "exact") {
        hostile[axisName] = true;
        continue;
      }
      throw new Error(
        `placeInsetRects: axis ${axisName} (${axisLen}px) has no usable divisor pitch for ` +
          `basis ${basis} with minFill ${minFill} — the emit would be ~100% precision. ` +
          `Escapes: build in a self-framed P-divisible frame (handbook ` +
          `feasibility-precision-quantization.md §3c, fix six), accept drift via ` +
          `placeOptimizedRects, raise basis / lower minFill, or pass ` +
          `onHostile: "exact" (runtime templates: render exactly and report it).`,
      );
    }
  }

  // ── Quantize cells OUTWARD to the lattice (cell ⊇ rect) ──
  const cells = rects.map((r) => {
    const cx = Math.floor(r.x / px.pitch) * px.pitch;
    const cy = Math.floor(r.y / py.pitch) * py.pitch;
    const cw = Math.ceil((r.x + r.w) / px.pitch) * px.pitch - cx;
    const ch = Math.ceil((r.y + r.h) / py.pitch) * py.pitch - cy;
    return { x: cx, y: cy, w: cw, h: ch };
  });

  // ── Place the cells; placeRects spills quantization-collided cells to layers ──
  const placed = placeRects({
    rootW,
    rootH,
    rects: cells.map((c, i) => ({
      ...c,
      claimant: rects[i].claimant,
      importance: rects[i].importance,
    })),
    emptyToken,
  });

  // ── Recover exact bounds: half-pixel-centered fractional shrink per edge ──
  const insets = rects.map((r, i): PlaceInsetRectsInset | null => {
    const c = cells[i];
    const left = r.x - c.x;
    const right = c.x + c.w - (r.x + r.w);
    const top = r.y - c.y;
    const bottom = c.y + c.h - (r.y + r.h);
    if (left === 0 && right === 0 && top === 0 && bottom === 0) return null;
    return {
      top: halfPixelFrac(top, c.h),
      right: halfPixelFrac(right, c.w),
      bottom: halfPixelFrac(bottom, c.h),
      left: halfPixelFrac(left, c.w),
    };
  });

  return {
    m0: placed.m0,
    layers: placed.layers,
    insets,
    cells,
    pitch: { x: px.pitch, y: py.pitch },
    basis: { x: rootW / px.pitch, y: rootH / py.pitch },
    clamped: { x: px.clamped, y: py.clamped },
    hostile,
  };
}
