// Unified transform API
export * from "./unified";
export type { TransformTarget, ReductionMode } from "./types";

// Non-targeted transforms
export { addOverlayToAllFrames } from "./composed/overlay/addOverlayToAllFrames";
export { addOverlayLayer } from "./primitives/overlay/addOverlayLayer";
// Per-leaf below-wrap — the symmetric pair to `addOverlay` (which paints
// ABOVE the target). Compose's "Below this tile" affordance uses it.
export { wrapBelowByLogicalIndex } from "./primitives/overlay/wrapBelowByLogicalIndex";
export { removePureNullLayers } from "./primitives/overlay/removePureNullLayers";
export { reduceSplitCounts } from "./primitives/split/reduceSplitCounts";
export type {
  ReduceSplitCountsOptions,
  ReduceSplitCountsResult,
} from "./primitives/split/reduceSplitCounts";
export { rewriteOverlayChains } from "./rewriteOverlayChains";

// Direct subtree replacement by stable key — used by QR + brand templates
// to splice child docs (logos, eye visuals, safe-area content) into specific
// frames after the main m0 is composed.
export { replaceNodeByStableId } from "./primitives/replace/replaceNodeByStableId";
export type { ReplaceNodeOptions } from "./primitives/replace/replaceNodeBySpan";

// Re-export MeasureRange type (used by measureSplit opts)
export type { MeasureRange } from "./composed/measure/_internal/buildMeasureFragment";

// Fluent + point-free composition surfaces
export { pipe, Pipe } from "./pipe";
export { compose } from "./compose";
export type { M0Transform } from "./compose";

// Inverse + history
export { withInverse } from "./withInverse";
export type { WithInverseResult, AnyTransform } from "./withInverse";
export { withHistory, History } from "./withHistory";
