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
