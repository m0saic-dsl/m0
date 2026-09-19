/**
 * Linear scale + axis-tick math — the deterministic value→pixel primitives
 * shared across data-driven layouts (charts, timelines, gauges, sparklines).
 *
 * This is a faithful, dependency-free port of the math the OSS ecosystem
 * standardized on: the Chart.js `LinearScale` tick generator (MIT), which
 * itself implements the Heckbert "nice numbers" rule (Graphics Gems, 1990).
 * Kept here in dsl-stdlib so every m0saic template/tool computes axes the same
 * way (no drift), the same place the layout builders live.
 *
 * Reference studied: chart.js@4.5.1 — `niceNum` (helpers) and `generateTicks`
 * (LinearScaleBase, bounds:"ticks").
 */

/**
 * Round a range up to a "nice" magnitude — by default 1, 2, 5, or 10 × 10^k.
 * Port of Chart.js `niceNum` (Heckbert nice-number rule), generalized: `steps`
 * is the sorted set of sub-decade fractions to snap to (default Chart.js's
 * `[1, 2, 5]`); past the largest it rounds up a decade (×10). The bar-graph
 * axis passes `[1, 2, 2.5, 5]` so e.g. 0..120 → step 25 (6 ticks), not 50.
 */
export function niceNum(range: number, steps: number[] = [1, 2, 5]): number {
  const niceRange = Math.pow(10, Math.floor(Math.log10(range)));
  const fraction = range / niceRange;
  const niceFraction = steps.find((s) => fraction <= s) ?? 10;
  return niceFraction * niceRange;
}

/** A resolved linear scale: domain bounds, the nice step, and the tick list. */
export interface LinearScale {
  /** Domain lower bound (a multiple of `step`). */
  min: number;
  /** Domain upper bound (a multiple of `step`). */
  max: number;
  /** Spacing between adjacent ticks (a nice 1/2/5×10^k value). */
  step: number;
  /** Tick values, min → max inclusive. */
  ticks: number[];
}

/** Options for {@link linearScale}. */
export interface LinearScaleOptions {
  /** Force the domain to include 0 (Chart.js `beginAtZero`). Default `true`. */
  beginAtZero?: boolean;
  /** Upper bound on tick count (Chart.js `maxTicksLimit`). Default `11`. */
  maxTicks?: number;
  /** Explicit domain override; when set, that bound is used verbatim. */
  min?: number;
  max?: number;
}

/**
 * Compute a "nice" linear scale (round-number ticks) for a data range — the
 * canonical Chart.js `generateTicks` path (bounds: "ticks"), reduced to the
 * single-axis case. Deterministic.
 *
 * @example
 * linearScale(0, 9800)            // step 1000 → ticks [0,1000,…,10000]
 * linearScale(0, 85, { maxTicks: 6 })  // step 20 → [0,20,40,60,80,100]
 */
export function linearScale(dataMin: number, dataMax: number, opts: LinearScaleOptions = {}): LinearScale {
  const beginAtZero = opts.beginAtZero ?? true;
  const maxTicks = Math.max(2, opts.maxTicks ?? 11);

  let rmin = opts.min ?? dataMin;
  let rmax = opts.max ?? dataMax;
  if (beginAtZero) {
    if (rmin > 0) rmin = 0;
    if (rmax < 0) rmax = 0;
  }
  if (rmax === rmin) rmax = rmin + 1; // degenerate guard

  const maxSpaces = maxTicks - 1;
  let spacing = niceNum((rmax - rmin) / maxSpaces);
  const numSpaces = Math.ceil(rmax / spacing) - Math.floor(rmin / spacing);
  if (numSpaces > maxSpaces) {
    spacing = niceNum((numSpaces * spacing) / maxSpaces);
  }

  const min = opts.min ?? Math.floor(rmin / spacing) * spacing;
  const max = opts.max ?? Math.ceil(rmax / spacing) * spacing;

  const ticks: number[] = [];
  const decimals = decimalPlaces(spacing);
  const eps = spacing * 1e-6;
  for (let v = min; v <= max + eps; v += spacing) {
    ticks.push(round(v, decimals));
  }
  return { min, max, step: spacing, ticks };
}

/**
 * Project a data value to a pixel coordinate within `[pxStart, pxEnd]` (linear
 * interpolation — Chart.js `getPixelForValue`). For a y-axis pass
 * `pxStart=bottom, pxEnd=top` so larger values map upward.
 */
export function project(value: number, domainMin: number, domainMax: number, pxStart: number, pxEnd: number): number {
  const span = domainMax - domainMin;
  const t = span === 0 ? 0 : (value - domainMin) / span;
  return pxStart + t * (pxEnd - pxStart);
}

/**
 * Evenly spaced category centers across `[pxStart, pxEnd]` — the default
 * category axis for line/bar charts. `offset=false` (line default) puts the
 * first/last categories on the edges; `offset=true` (bar default) insets them
 * by half a band.
 */
export function categoryCenters(count: number, pxStart: number, pxEnd: number, offset = false): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(pxStart + pxEnd) / 2];
  const width = pxEnd - pxStart;
  if (offset) {
    const band = width / count;
    return Array.from({ length: count }, (_, i) => pxStart + band * (i + 0.5));
  }
  return Array.from({ length: count }, (_, i) => pxStart + (width * i) / (count - 1));
}

/** Format a tick value with thousands separators (Chart.js default numeric formatter). */
export function formatTick(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function decimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step === 0) return 0;
  const s = String(step);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
