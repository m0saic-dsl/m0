import {
  parseM0StringToRenderFrames,
  type RenderFrame,
} from "@m0saic/dsl";

/**
 * quantizationSpread / isQuantizationImperceptible
 * ------------------------------------------------------------------
 * Measure how far an m0 layout's *actual* rendered geometry drifts from its
 * *ideal* (sub-pixel) geometry at a given canvas — i.e. the visible cost of
 * QUANTIZATION (the engine spreading the fractional remainder when a split's
 * weight basis doesn't divide the axis evenly).
 *
 * The result is a single number: the largest absolute deviation, in pixels, of
 * any frame's edge position OR size from where infinitely-precise math would put
 * it. Zero ⇒ the layout renders exactly (the basis divides the axis). Larger ⇒
 * more drift; once it crosses the eye's threshold (~1px) the layout reads as
 * "unevenly spaced".
 *
 * How "ideal" is obtained: re-parse the SAME string at a high-resolution
 * multiple of the canvas and divide back down. Parse cost is proportional to the
 * string's cell count, NOT the resolution, so the reference parse is cheap. The
 * reference scale is capped so enormous layouts don't overflow.
 *
 * This is the deciding primitive behind "use a portable weight-based split when
 * it's imperceptible, else bake exact pixels with placeRects" — it needs nothing
 * but the m0 string and the target canvas.
 */

export type QuantizationSpreadResult = {
  /**
   * Largest absolute deviation (px) of any frame's edge position or size from
   * its ideal value at this canvas. 0 ⇒ renders exactly.
   */
  maxSpreadPx: number;
  /** logicalIndex of the worst-drifting frame (-1 if there were no frames). */
  worstLogicalIndex: number;
};

const DEFAULT_REF_SCALE = 16;
// Keep the reference parse's longest axis under this so huge canvases don't
// produce absurd intermediate coordinates. Accuracy of "ideal" is ~0.5/ref px.
const MAX_REF_AXIS = 60000;

/**
 * Measure the worst-case quantization drift of `m0` rendered at `width`×`height`.
 * Throws (via the parser) if the string is invalid or infeasible at this size.
 */
export function quantizationSpread(
  m0: string,
  width: number,
  height: number,
  opts?: { refScale?: number },
): QuantizationSpreadResult {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));

  let ref = Math.max(2, Math.floor(opts?.refScale ?? DEFAULT_REF_SCALE));
  const refCap = Math.max(2, Math.floor(MAX_REF_AXIS / Math.max(W, H)));
  ref = Math.min(ref, refCap);

  const actual = parseM0StringToRenderFrames(m0, W, H);
  const ideal = parseM0StringToRenderFrames(m0, W * ref, H * ref);

  const idealByIdx = new Map<number, RenderFrame>();
  for (const f of ideal) idealByIdx.set(f.logicalIndex, f);

  let maxSpreadPx = 0;
  let worstLogicalIndex = -1;
  for (const a of actual) {
    const i = idealByIdx.get(a.logicalIndex);
    if (!i) continue;
    const d = Math.max(
      Math.abs(a.x - i.x / ref),
      Math.abs(a.y - i.y / ref),
      Math.abs(a.width - i.width / ref),
      Math.abs(a.height - i.height / ref),
    );
    if (d > maxSpreadPx) {
      maxSpreadPx = d;
      worstLogicalIndex = a.logicalIndex;
    }
  }

  return { maxSpreadPx, worstLogicalIndex };
}

/**
 * True when `m0` at `width`×`height` renders within `maxPx` of ideal everywhere
 * — i.e. its quantization is imperceptible and a portable weight-based split is
 * safe to keep (no need to bake exact pixels with placeRects).
 */
export function isQuantizationImperceptible(
  m0: string,
  width: number,
  height: number,
  maxPx = 1,
  opts?: { refScale?: number },
): boolean {
  return quantizationSpread(m0, width, height, opts).maxSpreadPx <= maxPx;
}
