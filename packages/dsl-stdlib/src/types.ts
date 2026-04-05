export type { ContainerAxis } from "./builders/container";
export type { WeightedSplitOptions } from "./builders/weightedSplit";
export type { GridOptions, GridResult } from "./builders/grid";
export type { StripOptions } from "./builders/strip";
export type {
  AspectRatio,
  AspectFitOptions,
  AspectFitResult,
  AspectFitHAlign,
  AspectFitVAlign,
} from "./builders/aspectFit";
export type {
  PlaceRectOptions,
  PlaceRectResult,
  PlaceRectHAlign,
  PlaceRectVAlign,
} from "./builders/placeRect";
export type {
  AspectSafeGridOptions,
  AspectSafeGridResult,
  AspectSafeGridPriority,
} from "./builders/aspectSafeGrid";
export type {
  SafeCanvasOptions,
  SafeCanvasResult,
} from "./builders/safeCanvas";
export type {
  SpotlightArrangement,
  SpotlightOptions,
  SpotlightResult,
} from "./builders/spotlight";
export type {
  ComparisonOptions,
  ComparisonResult,
} from "./builders/comparison";
export type {
  RankedListDecay,
  RankedListOptions,
  RankedListResult,
} from "./builders/rankedList";

/**
 * Caller-facing tile type primitive.
 *
 * Accepts both pretty (`F`, `>`) and canonical (`1`, `0`) forms.
 * Implementations normalize immediately to canonical form internally.
 */
export type TileTypePrimitive = "F" | "1" | ">" | "0" | "-";
