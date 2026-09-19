import type { M0String } from "@m0saic/dsl";

export type ViewBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ShapeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
};

export type ShapeStyle = {
  fill: string | null;
  stroke: string | null;
  style: string | null;
};

export type SvgPath = {
  d: string;
  style: ShapeStyle;
};

export type ParsedSvg = {
  paths: SvgPath[];
  viewBox: ViewBox | null;
};

export type ExtractedShape = {
  id: string;
  index: number;
  type: "path";
  geometry: { d: string };
  style: ShapeStyle;
  bounds: ShapeBounds;
};

export type GridSpan = {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
};

export type SnappedBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type GridShape = {
  id: string;
  index: number;
  rawBounds: ShapeBounds;
  snappedBounds: SnappedBounds;
  gridSpan: GridSpan;
  /** Original SVG path data, threaded through from `ExtractedShape`. */
  geometry: { d: string };
  /** Original style (fill / stroke / inline style) from the SVG. */
  style: ShapeStyle;
};

export type DriftMode = "cluster" | "gcd-snap";
export type PackingMode = "one" | "multi";

export type GridDriftMeta = {
  requestedDriftPercent: number;
  requestedDriftMode: DriftMode;
  effectiveDriftMode: DriftMode;
  toleranceUsedPx: number;
  achievedGcd: { col: number; row: number } | null;
  maxActualDriftPx: number;
  meanActualDriftPx: number;
  edgesMeasured: number;
};

export type Grid = {
  viewBox: ViewBox | null;
  xLines: number[];
  yLines: number[];
  shapes: GridShape[];
  meta?: GridDriftMeta;
};

export type SvgToM0Options = {
  /** Drift tolerance as % of min canvas dim. Default 0 (noise-floor only). */
  driftPercent?: number;
  /**
   * Grid-inference algorithm.
   * - "gcd-snap" (default): directed divisor search — production default, ~9× DSL reduction.
   * - "cluster": opportunistic bounded-width clustering — fallback / exploratory.
   */
  driftMode?: DriftMode;
  /**
   * Layer-packing strategy.
   * - "multi" (default): greedy multi-rect packing via union-grid encoder.
   * - "one": one rect per layer, sequential brace-nested composition.
   */
  packing?: PackingMode;
};

export type SvgToM0Variant = {
  m0: M0String;
  charLen: number;
  rectCount: number;
  layerCount: number;
  gridDims: { cols: number; rows: number };
  options: Required<SvgToM0Options>;
};
