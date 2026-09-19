export { hasOverlayAtSpan } from "./hasOverlayAtSpan";

// Predicate query API
export {
  findFrames,
  findFirstFrame,
  findStableKeys,
  countFrames,
  mapFrames,
  someFrame,
  everyFrame,
  findRenderFrames,
  findLogicalFrames,
} from "./findFrames";
export type {
  EditorPredicate,
  EditorMapper,
  QueryContext,
  QueryOptions,
} from "./findFrames";
export { queryFrames, FrameQuery } from "./queryFrames";
export { extractNodeByStableId } from "./extractNodeByStableId";
export type { ExtractNodeOptions } from "./extractNodeByStableId";
export { getLayerCount } from "./getLayerCount";
export { containedIn } from "./withinBounds";
export {
  quantizationSpread,
  isQuantizationImperceptible,
} from "./quantizationSpread";
export type { QuantizationSpreadResult } from "./quantizationSpread";
export { evaluateM0, compareM0 } from "./evaluateM0";
export type {
  M0Canvas,
  M0Evaluation,
  M0Comparison,
  M0Side,
  M0MetricComparison,
  M0MetricDirection,
} from "./evaluateM0";
