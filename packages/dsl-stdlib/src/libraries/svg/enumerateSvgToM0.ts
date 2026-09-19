/**
 * Enumerate SVG → M0String variants across the conversion option space.
 *
 * Computes the cartesian product over `{ driftPercent[] × driftMode[] × packing[] }`
 * and returns one {@link SvgToM0Variant} per *distinct* output. Variants are
 * returned ordered by ascending `charLen` — shortest first, which is what the
 * wizard's "best candidates" UI wants by default.
 *
 * The parse / geometry / grid steps are run once per (driftPercent, driftMode)
 * pair; packing variants share the same inferred grid. Invalid combinations
 * (e.g. driftPercent > 0 with no viewBox, or gcd-snap-with-no-divisor-fits)
 * are silently skipped — they would otherwise throw or fall back. Callers
 * can inspect `variant.options.driftMode` vs the requested mode (via meta
 * threading; not exposed at this layer yet) for the fallback case.
 *
 * Dedup happens in two passes:
 *  1. (driftPercent, driftMode) pairs whose `inferGrid` produces an identical
 *     grid are collapsed (e.g. gcd-snap @ 0% silently falls back to cluster).
 *  2. After packing variants are emitted, anything producing a byte-identical
 *     `m0` string is collapsed to ONE variant — the most lossless one
 *     (lowest driftPercent), breaking final ties by first-seen enumeration
 *     order. This handles degenerate shapes (e.g. a single-rect SVG where
 *     every drift × mode × packing combo collapses to one frame): the caller
 *     gets one variant, not four indistinguishable rows.
 *
 * Pure, deterministic, no I/O.
 */

import { extractGeometry } from "./extractGeometry";
import { inferGrid } from "./inferGrid";
import { parseSvg } from "./parseSvg";
import { rectsToM0 } from "./rectsToM0";
import type {
  DriftMode,
  PackingMode,
  SvgToM0Variant,
} from "./types";

export type EnumerateSpace = {
  /** Drift tolerances to sweep. Default `[0, 0.5, 1.0, 2.0]` (% of canvas min dim). */
  driftPercent?: number[];
  /** Grid-inference modes to sweep. Default `["cluster", "gcd-snap"]`. */
  driftMode?: DriftMode[];
  /** Packing strategies to sweep. Default `["one", "multi"]`. */
  packing?: PackingMode[];
};

const DEFAULT_SPACE: Required<EnumerateSpace> = {
  driftPercent: [0, 0.5, 1.0, 2.0],
  driftMode: ["cluster", "gcd-snap"],
  packing: ["one", "multi"],
};

export function enumerateSvgToM0(
  svg: string,
  space: EnumerateSpace = {},
): SvgToM0Variant[] {
  const merged: Required<EnumerateSpace> = {
    driftPercent: space.driftPercent ?? DEFAULT_SPACE.driftPercent,
    driftMode: space.driftMode ?? DEFAULT_SPACE.driftMode,
    packing: space.packing ?? DEFAULT_SPACE.packing,
  };

  const parsed = parseSvg(svg);
  const shapes = extractGeometry(parsed.paths);
  if (shapes.length === 0) {
    throw new Error(
      "enumerateSvgToM0: SVG contains no <path> elements with a d attribute",
    );
  }

  const variants: SvgToM0Variant[] = [];
  // Dedupe (driftPercent, driftMode) keys so we don't re-run inferGrid for
  // pairs that materially produce the same grid (e.g. gcd-snap at
  // driftPercent=0 silently falls back to cluster).
  const seenGridKeys = new Set<string>();

  for (const driftPercent of merged.driftPercent) {
    for (const driftMode of merged.driftMode) {
      // No viewBox + driftPercent>0 → inferGrid throws; skip silently here so
      // we yield at least one variant for headerless SVGs.
      if (driftPercent > 0 && !parsed.viewBox) continue;

      let grid;
      try {
        grid = inferGrid(shapes, parsed.viewBox, { driftPercent, driftMode });
      } catch {
        continue;
      }

      // Stable key derived from the inferred grid lines + effective mode.
      // Two (driftPercent, driftMode) pairs that yield the same grid are
      // collapsed; their packing variants would be byte-identical anyway.
      const effective = grid.meta?.effectiveDriftMode ?? driftMode;
      const gridKey = [
        effective,
        grid.xLines.length,
        grid.yLines.length,
        grid.xLines.join(","),
        grid.yLines.join(","),
      ].join("|");
      if (seenGridKeys.has(gridKey)) continue;
      seenGridKeys.add(gridKey);

      for (const packing of merged.packing) {
        const variant = rectsToM0(grid, { packing });
        // Surface the (driftPercent, driftMode) actually requested in the
        // returned options, even when inferGrid silently fell back to cluster.
        // The grid's meta.effectiveDriftMode tells the truth about what ran.
        variants.push({
          ...variant,
          options: {
            driftPercent,
            driftMode,
            packing,
          },
        });
      }
    }
  }

  // Second dedup pass: collapse variants that emit byte-identical m0 strings
  // to one entry, preferring the most lossless (lowest driftPercent). On
  // exact-tie, the first-seen wins (deterministic via enumeration order — the
  // outer loops fix the order `driftPercent → driftMode → packing`).
  const byM0 = new Map<string, SvgToM0Variant>();
  for (const v of variants) {
    const key = String(v.m0);
    const prev = byM0.get(key);
    if (!prev) {
      byM0.set(key, v);
    } else if (v.options.driftPercent < prev.options.driftPercent) {
      byM0.set(key, v);
    }
  }
  const deduped = Array.from(byM0.values());

  deduped.sort((a, b) => a.charLen - b.charLen);
  return deduped;
}
