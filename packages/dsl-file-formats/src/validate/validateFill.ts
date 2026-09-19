import type { StableKey } from "@m0saic/dsl";
import type { M0cFill } from "../types";
import type { FillIssue, FillValidationResult } from "./types";
import { EMPTY_FILL_RESULT } from "./types";

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * MOC-level fill validator.
 *
 * Pure function. Caller supplies the set of stableKeys that exist in the
 * current parse — same contract as `validateLabels`. Surfaces two kinds of
 * issue at the warning level:
 *
 * - `ORPHANED_FILL`: a fill entry's stableKey is not in the layout. Caused
 *   by geometry edits that removed the keyed frame.
 * - `INVALID_FILL_COLOR`: `entry.color` is present but does not match
 *   `#rrggbb` or `#rrggbbaa`. The inspector will fall back to its uniform
 *   color when the value can't be parsed — flag so the author notices.
 *
 * `mediaRef` is intentionally NOT checked here. Asset resolution happens
 * downstream in `@m0saic/platform`; the format-level validator stays
 * dependency-free.
 *
 * Empty / null fill maps return an empty result.
 */
export function validateFill(opts: {
  validStableKeys: ReadonlySet<string>;
  fill: Record<StableKey, M0cFill> | null | undefined;
}): FillValidationResult {
  const { validStableKeys, fill } = opts;
  if (!fill) return EMPTY_FILL_RESULT;

  const issues: FillIssue[] = [];
  for (const sk of Object.keys(fill)) {
    const entry = fill[sk as StableKey];
    if (!entry) continue;

    if (!validStableKeys.has(sk)) {
      issues.push({
        level: "warning",
        code: "ORPHANED_FILL",
        stableKey: sk,
        message: `Fill entry "${sk}" no longer maps to a frame in the layout.`,
      });
    }

    if (entry.color !== undefined && !HEX_RE.test(entry.color)) {
      issues.push({
        level: "warning",
        code: "INVALID_FILL_COLOR",
        stableKey: sk,
        color: entry.color,
        message: `Fill color "${entry.color}" for "${sk}" is not a valid #rrggbb or #rrggbbaa hex literal.`,
      });
    }
  }

  if (issues.length === 0) return EMPTY_FILL_RESULT;
  return {
    issues,
    hasError: false,
    hasWarning: true,
  };
}
