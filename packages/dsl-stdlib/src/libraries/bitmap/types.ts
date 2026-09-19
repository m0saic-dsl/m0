/**
 * Shared types for the bitmap library.
 *
 * Bitmap-style MO: a 2D boolean grid (one cell per pixel of a target raster) is
 * converted into a flat `H[W(c,c,…),W(…),…]` m0 string. Used as a fallback when
 * an input shape (typically an SVG) cannot be well-represented as a small
 * collection of rectangles.
 *
 * Parity with the production png-to-bitmap CLI tool
 * (`packages/docs/png-to-bitmap-mosaic/tools/01-png-to-bitmap.ts`): the option
 * shape, area-map shape, and metadata shape here are the in-memory equivalents
 * of that tool's CLI knobs, JSON sidecars, and PNG → grid pipeline.
 */

/** 2D boolean grid. `grid[y][x]` — true = ON, false = OFF. */
export type BinaryGrid = boolean[][];

/** RGB color in 0..255 channel range. */
export type RgbColor = { r: number; g: number; b: number };

/**
 * Per-pixel classification config. Two modes:
 *
 * - `luminance` (default): compute ITU-R BT.601 luminance per pixel; compare to
 *   `threshold`. `onMode` selects polarity (light pixels ON, or dark pixels ON).
 * - `nearest`: classify by RGB distance — pixel goes to whichever of
 *   `onColor` / `offColor` it's closer to.
 *
 * Pixels with alpha below `alphaThreshold` are always OFF (transparent regions
 * never count as ON regardless of color match).
 */
export type BitmapClassifyOptions = {
  mode?: "luminance" | "nearest";
  /** Luminance cutoff [0..255]. Default 128. */
  threshold?: number;
  /** Alpha cutoff [0..255]; below = OFF. Default 128. */
  alphaThreshold?: number;
  /** Luminance polarity. Default "light". */
  onMode?: "light" | "dark";
  /** Required for `mode: "nearest"`. */
  onColor?: RgbColor;
  /** OFF reference for `mode: "nearest"`. Default {0,0,0}. */
  offColor?: RgbColor;
};

/** One connected component in the binary grid. */
export type BitmapArea = {
  id: number;
  pixelCount: number;
  bbox: { x: number; y: number; w: number; h: number };
};

/**
 * 8-connected component labeling output. `map[y][x]` is the area id (>= 0) for
 * ON cells and -1 for OFF cells.
 */
export type BitmapAreaMap = {
  width: number;
  height: number;
  areaCount: number;
  areas: BitmapArea[];
  map: number[][];
};

/**
 * Metadata describing how a binary grid was produced. Parity with the
 * png-to-bitmap CLI's `_meta.json` shape so wizard- and CLI-produced files are
 * interchangeable.
 */
export type BitmapMeta = {
  width: number;
  height: number;
  mode: "luminance" | "nearest";
  threshold?: number;
  alphaThreshold: number;
  onMode?: "light" | "dark";
  onColor?: RgbColor | null;
  offColor?: RgbColor;
  onPixelCount: number;
  offPixelCount: number;
  areaCount: number;
  despeckle: boolean;
  despeckleFlipped?: number;
};

/** Character config for the visual sidecar emitters. */
export type VisualGlyphs = {
  /** Char for ON cells in the art view. Default "█". */
  onChar?: string;
  /** Char for OFF cells in the art view. Default " " (single space). */
  offChar?: string;
  /**
   * Cycling glyph string for area labels. Cycles when areaCount exceeds length.
   * Default `A–Z`, `a–z`, `0–9`, then `@#$%&*+=~`.
   */
  areaGlyphs?: string;
};
