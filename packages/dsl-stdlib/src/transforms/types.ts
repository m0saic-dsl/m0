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
