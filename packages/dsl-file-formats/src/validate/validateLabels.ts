import type { M0Label, StableKey } from "@m0saic/dsl";
import type { LabelValidationResult, OrphanedLabelIssue } from "./types";
import { EMPTY_LABEL_RESULT } from "./types";

/**
 * MOC-level orphaned-label detector.
 *
 * Pure function. Caller supplies the set of stableKeys that exist in
 * the current parse — typically pulled from
 * `parseM0StringComplete(m0,w,h).ir.editorFrames.map(f => f.meta.stableKey)`.
 * Keeping the parse on the caller side lets the editor reuse the parse
 * it already runs to render the canvas (no double-parsing).
 *
 * A label is "orphaned" when its stableKey does NOT appear in the
 * supplied set. Empty/null label maps return an empty result.
 */
export function validateLabels(opts: {
  validStableKeys: ReadonlySet<string>;
  labels: Record<StableKey, M0Label> | null | undefined;
}): LabelValidationResult {
  const { validStableKeys, labels } = opts;
  if (!labels) return EMPTY_LABEL_RESULT;

  const issues: OrphanedLabelIssue[] = [];
  for (const sk of Object.keys(labels)) {
    if (validStableKeys.has(sk)) continue;
    const label = labels[sk as StableKey];
    if (!label) continue;
    issues.push({
      level: "warning",
      code: "ORPHANED_LABEL",
      stableKey: sk,
      text: label.text,
      message: `Label "${label.text}" no longer maps to a frame in the layout.`,
    });
  }

  if (issues.length === 0) return EMPTY_LABEL_RESULT;
  return {
    issues,
    hasError: false,
    hasWarning: true,
  };
}
