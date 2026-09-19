export {
  getComplexityMetricsFast,
  getFrameCount,
} from "./complexity";
// getPrecisionCost is an internal helper (imported directly from "./complexity").
// getComplexityMetrics / getNodeCount / getPassthroughCount were removed —
// callers use getComplexityMetricsFast (returns the full ComplexityMetrics).
