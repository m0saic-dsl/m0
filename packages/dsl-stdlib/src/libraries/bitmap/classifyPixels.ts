/**
 * Per-pixel binary classifier.
 *
 * Takes an RGBA byte array (the shape returned by
 * `CanvasRenderingContext2D.getImageData(...).data` in the browser and by
 * `pngjs`'s `PNG.data` field in Node) plus the raster dimensions, and returns a
 * 2D boolean grid where each cell is one source pixel classified as ON or OFF.
 *
 * Two classification modes (see `BitmapClassifyOptions`):
 *
 *   - `luminance` (default): BT.601 luminance against `threshold`, with
 *     `onMode` selecting polarity.
 *   - `nearest`: pixel goes to whichever of `onColor` / `offColor` it is closer
 *     to in RGB space.
 *
 * Pixels with alpha below `alphaThreshold` are always OFF.
 *
 * Pure and deterministic — same RGBA + same options → same grid, byte-identical.
 */

import type { BinaryGrid, BitmapClassifyOptions, RgbColor } from "./types";

const DEFAULT_THRESHOLD = 128;
const DEFAULT_ALPHA_THRESHOLD = 128;
const DEFAULT_OFF_COLOR: RgbColor = { r: 0, g: 0, b: 0 };

/** ITU-R BT.601 luminance from RGB. */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Squared Euclidean distance in RGB space. */
function rgbDistSq(r: number, g: number, b: number, c: RgbColor): number {
  const dr = r - c.r;
  const dg = g - c.g;
  const db = b - c.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Accepts either `Uint8ClampedArray` (browser canvas) or `Uint8Array` (pngjs's
 * `PNG.data` / Node `Buffer`). Both expose 0..255 numeric reads — the classifier
 * only reads, so the distinction is irrelevant here.
 */
export function classifyPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  opts: BitmapClassifyOptions = {},
): BinaryGrid {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`classifyPixels: width must be a positive integer, got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`classifyPixels: height must be a positive integer, got ${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `classifyPixels: RGBA buffer length ${rgba.length} doesn't match ${width}×${height}×4 = ${width * height * 4}`,
    );
  }

  const mode = opts.mode ?? "luminance";
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const alphaThreshold = opts.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD;
  const onMode = opts.onMode ?? "light";
  const offColor = opts.offColor ?? DEFAULT_OFF_COLOR;

  if (mode === "nearest" && !opts.onColor) {
    throw new Error(`classifyPixels: mode "nearest" requires onColor`);
  }
  const onColor = opts.onColor;

  const grid: BinaryGrid = [];
  for (let y = 0; y < height; y++) {
    const row: boolean[] = new Array<boolean>(width);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const a = rgba[idx + 3];

      if (a < alphaThreshold) {
        row[x] = false;
        continue;
      }

      if (mode === "nearest") {
        const distOn = rgbDistSq(r, g, b, onColor!);
        const distOff = rgbDistSq(r, g, b, offColor);
        row[x] = distOn <= distOff;
      } else {
        const lum = luminance(r, g, b);
        const isLight = lum >= threshold;
        row[x] = onMode === "light" ? isLight : !isLight;
      }
    }
    grid.push(row);
  }
  return grid;
}
