/**
 * One-shot SVG → M0String conversion.
 *
 * Composes the four pipeline steps:
 *   parseSvg → extractGeometry → inferGrid → rectsToM0
 *
 * Returns a validated, branded `M0String`. For exploratory use cases
 * (e.g. the SVG → Mosaic wizard) prefer {@link enumerateSvgToM0}, which
 * returns the full SvgToM0Variant including char-length / rect-count metadata.
 *
 * Pure, deterministic, no I/O.
 */

import type { M0String } from "@m0saic/dsl";
import { extractGeometry } from "./extractGeometry";
import { inferGrid } from "./inferGrid";
import { parseSvg } from "./parseSvg";
import { rectsToM0 } from "./rectsToM0";
import type { SvgToM0Options } from "./types";

export function svgToM0(svg: string, opts: SvgToM0Options = {}): M0String {
  const parsed = parseSvg(svg);
  const shapes = extractGeometry(parsed.paths);
  if (shapes.length === 0) {
    throw new Error("svgToM0: SVG contains no <path> elements with a d attribute");
  }
  const grid = inferGrid(shapes, parsed.viewBox, {
    driftPercent: opts.driftPercent,
    driftMode: opts.driftMode,
  });
  const variant = rectsToM0(grid, {
    packing: opts.packing,
  });
  return variant.m0;
}
