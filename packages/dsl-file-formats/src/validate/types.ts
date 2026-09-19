/**
 * Issue types for label and region validation.
 *
 * The format itself doesn't enforce label/region coverage — these
 * validators give tooling a uniform vocabulary for surfacing problems
 * the editor (or any other consumer) can lint against.
 */

export type IssueLevel = "warning" | "error";

/** A label maps to a stableKey that no longer exists in the layout's
 *  parsed frame set. Caused by geometry edits that removed/replaced
 *  the labeled node. */
export type OrphanedLabelIssue = {
  level: "warning";
  code: "ORPHANED_LABEL";
  stableKey: string;
  text: string;
  message: string;
};

export type LabelIssue = OrphanedLabelIssue;

/** A fill entry maps to a stableKey that no longer exists in the layout's
 *  parsed frame set. Same blame model as `ORPHANED_LABEL`. */
export type OrphanedFillIssue = {
  level: "warning";
  code: "ORPHANED_FILL";
  stableKey: string;
  message: string;
};

/** A fill entry's `color` is not a valid `#rrggbb` or `#rrggbbaa` CSS hex
 *  literal. Surfaces malformed input early so the inspector doesn't
 *  silently render a default-colored rect. */
export type InvalidFillColorIssue = {
  level: "warning";
  code: "INVALID_FILL_COLOR";
  stableKey: string;
  color: string;
  message: string;
};

export type FillIssue = OrphanedFillIssue | InvalidFillColorIssue;

export type FillValidationResult = {
  issues: FillIssue[];
  hasError: boolean;
  hasWarning: boolean;
};

export const EMPTY_FILL_RESULT: FillValidationResult = {
  issues: [],
  hasError: false,
  hasWarning: false,
};

/** An inset entry maps to a stableKey that no longer exists in the layout's
 *  parsed frame set. Same blame model as `ORPHANED_FILL`. */
export type OrphanedInsetIssue = {
  level: "warning";
  code: "ORPHANED_INSET";
  stableKey: string;
  message: string;
};

/** An inset edge is outside the sane `[0, 1)` fraction range (< 0 or ≥ 1).
 *  The engine clamps at render time (`Math.max(1, …)`), so nothing crashes —
 *  flag so the author notices a likely mistake. */
export type InsetOutOfRangeIssue = {
  level: "warning";
  code: "INSET_OUT_OF_RANGE";
  stableKey: string;
  edge: "top" | "right" | "bottom" | "left";
  value: number;
  message: string;
};

/** The insets on one axis sum to ≥ 1, which would collapse the frame's paint
 *  box on that axis. The engine clamps the resulting dimension to ≥ 1px, so
 *  it degrades rather than crashes — surfaced as a warning. */
export type InsetCollapsesFrameIssue = {
  level: "warning";
  code: "INSET_COLLAPSES_FRAME";
  stableKey: string;
  axis: "horizontal" | "vertical";
  sum: number;
  message: string;
};

export type InsetIssue =
  | OrphanedInsetIssue
  | InsetOutOfRangeIssue
  | InsetCollapsesFrameIssue;

export type InsetValidationResult = {
  issues: InsetIssue[];
  hasError: boolean;
  hasWarning: boolean;
};

export const EMPTY_INSET_RESULT: InsetValidationResult = {
  issues: [],
  hasError: false,
  hasWarning: false,
};

/** A pack region exists in the registry but the variant has no label
 *  whose text matches it. */
export type RegionMissingIssue = {
  level: "error";
  code: "REGION_MISSING";
  variantKey: string;
  region: string;
  message: string;
};

/** Two or more labels in the same variant resolve to the same region
 *  (case-insensitive text match). Surfaces structural ambiguity. */
export type RegionDuplicateIssue = {
  level: "warning";
  code: "REGION_DUPLICATE";
  variantKey: string;
  region: string;
  stableKeys: string[];
  message: string;
};

export type RegionIssue = RegionMissingIssue | RegionDuplicateIssue;

export type LabelValidationResult = {
  issues: LabelIssue[];
  hasError: boolean;
  hasWarning: boolean;
};

export type PackVariantIssues = {
  variantKey: string;
  regionIssues: RegionIssue[];
  labelIssues: LabelIssue[];
  fillIssues: FillIssue[];
  insetIssues: InsetIssue[];
  hasError: boolean;
  hasWarning: boolean;
};

export type PackValidationResult = {
  perVariant: Record<string, PackVariantIssues>;
  hasError: boolean;
  hasWarning: boolean;
};

export const EMPTY_LABEL_RESULT: LabelValidationResult = {
  issues: [],
  hasError: false,
  hasWarning: false,
};

export const EMPTY_PACK_RESULT: PackValidationResult = {
  perVariant: {},
  hasError: false,
  hasWarning: false,
};
