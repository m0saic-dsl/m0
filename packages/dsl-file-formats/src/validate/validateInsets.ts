import type { StableKey } from "@m0saic/dsl";
import type { M0cInset } from "../types";
import type { InsetIssue, InsetValidationResult } from "./types";
import { EMPTY_INSET_RESULT } from "./types";

const EDGES = ["top", "right", "bottom", "left"] as const;

/**
 * MOC-level inset validator.
 *
 * Pure function. Caller supplies the set of stableKeys that exist in the
 * current parse — same contract as `validateLabels` / `validateFill`. All
 * issues are warning-level: the engine clamps out-of-range / collapsing
 * insets at render time (`applyInsetToRect` uses `Math.max(1, …)`), so
 * nothing crashes — these flags just surface likely author mistakes.
 *
 * - `ORPHANED_INSET`: an inset entry's stableKey is not in the layout.
 *   Caused by geometry edits that removed the keyed frame.
 * - `INSET_OUT_OF_RANGE`: any single edge is < 0 or ≥ 1. Insets are
 *   fractions of the cell; a fraction outside `[0, 1)` is almost certainly
 *   a mistake (or a pixel value that leaked in un-normalized).
 * - `INSET_COLLAPSES_FRAME`: the two insets on one axis sum to ≥ 1
 *   (`top + bottom` or `left + right`), which would shrink the paint box to
 *   nothing on that axis (the engine clamps to ≥ 1px).
 *
 * Empty / null inset maps return an empty result.
 */
export function validateInsets(opts: {
  validStableKeys: ReadonlySet<string>;
  insets: Record<StableKey, M0cInset> | null | undefined;
}): InsetValidationResult {
  const { validStableKeys, insets } = opts;
  if (!insets) return EMPTY_INSET_RESULT;

  const issues: InsetIssue[] = [];
  for (const sk of Object.keys(insets)) {
    const entry = insets[sk as StableKey];
    if (!entry) continue;

    if (!validStableKeys.has(sk)) {
      issues.push({
        level: "warning",
        code: "ORPHANED_INSET",
        stableKey: sk,
        message: `Inset entry "${sk}" no longer maps to a frame in the layout.`,
      });
    }

    for (const edge of EDGES) {
      const value = entry[edge];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value < 0 || value >= 1) {
        issues.push({
          level: "warning",
          code: "INSET_OUT_OF_RANGE",
          stableKey: sk,
          edge,
          value,
          message: `Inset "${sk}".${edge} = ${value} is outside the [0, 1) fraction range.`,
        });
      }
    }

    const horizontal = entry.left + entry.right;
    if (Number.isFinite(horizontal) && horizontal >= 1) {
      issues.push({
        level: "warning",
        code: "INSET_COLLAPSES_FRAME",
        stableKey: sk,
        axis: "horizontal",
        sum: horizontal,
        message: `Inset "${sk}" left + right = ${horizontal} ≥ 1 collapses the frame horizontally.`,
      });
    }
    const vertical = entry.top + entry.bottom;
    if (Number.isFinite(vertical) && vertical >= 1) {
      issues.push({
        level: "warning",
        code: "INSET_COLLAPSES_FRAME",
        stableKey: sk,
        axis: "vertical",
        sum: vertical,
        message: `Inset "${sk}" top + bottom = ${vertical} ≥ 1 collapses the frame vertically.`,
      });
    }
  }

  if (issues.length === 0) return EMPTY_INSET_RESULT;
  return {
    issues,
    hasError: false,
    hasWarning: true,
  };
}
