import type { M0pFile, M0pVariantEntry } from "../types";
import type { LabelIssue, PackValidationResult, PackVariantIssues, RegionIssue } from "./types";
import { validateLabels } from "./validateLabels";

/**
 * MOP-level region-coverage + per-variant orphan validator.
 *
 * Pure function. Caller supplies `parseCache` — a map from variantKey
 * to the set of valid stableKeys for that variant's m0 string. Variants
 * not present in the cache are SKIPPED for orphan detection (their
 * region coverage still gets checked from the labels record alone,
 * since coverage is text-based, not stableKey-based).
 *
 * `liveVariantOverride` lets the editor inject the actively-edited
 * variant's unsaved state — pack.variants[key] may lag behind the
 * editor's live profileText/labels until a flush.
 *
 * Region matching:
 * - Region keys come from `pack.regions` (kebab-case-validated at parse time)
 * - A label "satisfies" a region when `label.text.trim().toLowerCase()`
 *   equals the region key. Mirrors the `variantCoverage` helper used in
 *   the editor's PackOverview so behavior stays consistent.
 * - When a pack has no regions, no region-issues are produced.
 */
export function validatePack(
  pack: M0pFile,
  opts?: {
    liveVariantOverride?: { key: string; entry: M0pVariantEntry };
    parseCache?: ReadonlyMap<string, ReadonlySet<string>>;
  },
): PackValidationResult {
  const regions = Object.keys(pack.regions ?? {});
  const liveOverride = opts?.liveVariantOverride;
  const parseCache = opts?.parseCache;
  const variantKeys = Object.keys(pack.variants);

  const perVariant: Record<string, PackVariantIssues> = {};
  let packHasError = false;
  let packHasWarning = false;

  for (const key of variantKeys) {
    const entry = liveOverride && liveOverride.key === key
      ? liveOverride.entry
      : pack.variants[key];
    if (!entry) continue;

    const labels = entry.labels ?? {};
    const labelEntries = Object.entries(labels);

    // Build region → stableKeys[] index using case-insensitive text match.
    const coverageByRegion = new Map<string, string[]>();
    for (const [stableKey, label] of labelEntries) {
      const normalized = label.text.trim().toLowerCase();
      if (!normalized) continue;
      const existing = coverageByRegion.get(normalized);
      if (existing) existing.push(stableKey);
      else coverageByRegion.set(normalized, [stableKey]);
    }

    const regionIssues: RegionIssue[] = [];
    for (const region of regions) {
      const matches = coverageByRegion.get(region);
      if (!matches || matches.length === 0) {
        regionIssues.push({
          level: "error",
          code: "REGION_MISSING",
          variantKey: key,
          region,
          message: `Required region "${region}" has no matching label.`,
        });
      } else if (matches.length > 1) {
        regionIssues.push({
          level: "warning",
          code: "REGION_DUPLICATE",
          variantKey: key,
          region,
          stableKeys: matches.slice(),
          message: `Region "${region}" is satisfied by ${matches.length} labels — only one frame should carry this label.`,
        });
      }
    }

    let labelIssues: LabelIssue[] = [];
    const validKeys = parseCache?.get(key);
    if (validKeys) {
      labelIssues = validateLabels({
        validStableKeys: validKeys,
        labels: entry.labels ?? null,
      }).issues;
    }

    const variantHasError = regionIssues.some(i => i.level === "error");
    const variantHasWarning = regionIssues.some(i => i.level === "warning")
      || labelIssues.length > 0;

    perVariant[key] = {
      variantKey: key,
      regionIssues,
      labelIssues,
      hasError: variantHasError,
      hasWarning: variantHasWarning,
    };

    if (variantHasError) packHasError = true;
    if (variantHasWarning) packHasWarning = true;
  }

  return {
    perVariant,
    hasError: packHasError,
    hasWarning: packHasWarning,
  };
}
