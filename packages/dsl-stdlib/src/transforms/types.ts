/**
 * Addressing scheme for transform operations.
 *
 * Every structural transform accepts a `TransformTarget` that identifies
 * which node to operate on. Three addressing modes are supported:
 *
 * - `logicalIndex` — 0-based index counting only rendered frames (1/F)
 * - `span` — exact character span in the canonical DSL string
 * - `stableKey` — structural identity path (survives edits)
 */
export type TransformTarget =
  | { by: "logicalIndex"; index: number }
  | { by: "span"; span: { start: number; end: number } }
  | { by: "stableKey"; key: string };

/**
 * DSL fragment reduction mode — shared by all transforms that encode
 * slot-count-sensitive output (split, measure-split, etc.).
 *
 * - `"optimized"` (default): reduce by GCD so the output is the smallest
 *   canonical form. For example, a 100-slot split with a 25/75 boundary
 *   becomes `4(F,>,>,F)`.
 * - `"literal"`: preserve the exact slot count as specified. Use this when
 *   downstream tools reason about specific slot positions (animations
 *   keyed to indices, precision workflows, debug output).
 *
 * `WeightMode` (weighted split transforms) is a kept alias for backward
 * compatibility with v1.0.0 consumers. New code should import
 * `ReductionMode` directly.
 */
export type ReductionMode = "optimized" | "literal";
