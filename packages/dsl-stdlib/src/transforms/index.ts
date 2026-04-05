// Unified transform API
export * from "./unified";
export type { TransformTarget } from "./types";

// Non-targeted transforms
export { addOverlayToAllFrames } from "./composed/overlay/addOverlayToAllFrames";
export { rewriteOverlayChains } from "./rewriteOverlayChains";

// Re-export MeasureRange type (used by measureSplit opts)
export type { MeasureRange } from "./composed/measure/_internal/buildMeasureFragment";
