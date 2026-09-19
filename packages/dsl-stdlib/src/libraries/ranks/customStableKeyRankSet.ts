/**
 * StableKey-keyed counterparts of `customRankSet` / `editRankSet`.
 *
 * Returns {@link MosaicRankSet} (`{ mode?, ranks: Record<stableKey, number | null> }`)
 * rather than the positional {@link MosaicRankSetFile}. Same value semantics:
 * no clamping, no re-normalization — finite numbers (or explicit `null`) are
 * accepted verbatim.
 *
 * Pure, deterministic, no I/O.
 */

import type { MosaicRankSet, MosaicRankSetEntry } from "../../mirroredTypes";

/**
 * Package a caller-provided per-stableKey rank map as a {@link MosaicRankSet}.
 *
 * @param ranksByKey  Map of stableKey → rank value (or `null` for "no rank
 *                    for this frame"). Both finite numbers and explicit
 *                    nulls are preserved verbatim; non-finite numbers and
 *                    non-numeric values throw.
 * @param modeLabel   Optional `mode` string. Defaults to `"custom"`.
 */
export function customStableKeyRankSet(
  ranksByKey: Record<string /* stableKey */, MosaicRankSetEntry | null>,
  modeLabel: string = "custom",
): MosaicRankSet {
  if (!ranksByKey || typeof ranksByKey !== "object" || Array.isArray(ranksByKey)) {
    throw new Error(
      "customStableKeyRankSet: ranksByKey must be a Record<stableKey, number | null>",
    );
  }
  const out: Record<string, MosaicRankSetEntry | null> = {};
  for (const [k, v] of Object.entries(ranksByKey)) {
    if (!k) {
      throw new Error("customStableKeyRankSet: empty stableKey is not allowed");
    }
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(
        `customStableKeyRankSet: ranksByKey["${k}"] is not a finite number or null (got ${String(v)})`,
      );
    }
    out[k] = v;
  }
  return { mode: modeLabel, ranks: out };
}

/**
 * Return a new {@link MosaicRankSet} with specific stableKey entries
 * overridden by caller-supplied values. The base set is not mutated.
 *
 * Typical wizard flow: user picks a built-in (e.g. `diag` via
 * `generateStableKeyRankSet`), then tweaks a handful of values keyed by the
 * specific tiles they care about. The resulting set has `modeLabel`
 * (default `"custom"`) so downstream code can distinguish it from a pure
 * built-in run.
 *
 * Edit keys MUST exist in `base.ranks` — adding a fresh stableKey via
 * `editStableKeyRankSet` is treated as a programmer error and throws.
 * Use `customStableKeyRankSet` to build a fresh set from scratch.
 *
 * @param base       Base rank set (from `generateStableKeyRankSet` or
 *                   `customStableKeyRankSet`).
 * @param edits      Map of stableKey → new rank value (or `null`).
 * @param modeLabel  Optional `mode` string for the output. Defaults to `"custom"`.
 */
export function editStableKeyRankSet(
  base: MosaicRankSet,
  edits: Record<string /* stableKey */, MosaicRankSetEntry | null>,
  modeLabel: string = "custom",
): MosaicRankSet {
  if (!base || typeof base !== "object" || !base.ranks || Array.isArray(base.ranks)) {
    throw new Error(
      "editStableKeyRankSet: base must be a MosaicRankSet with a ranks object",
    );
  }
  if (!edits || typeof edits !== "object" || Array.isArray(edits)) {
    throw new Error(
      "editStableKeyRankSet: edits must be a Record<stableKey, number | null>",
    );
  }
  const ranks: Record<string, MosaicRankSetEntry | null> = { ...base.ranks };
  for (const [k, v] of Object.entries(edits)) {
    if (!k) {
      throw new Error("editStableKeyRankSet: empty stableKey in edits is not allowed");
    }
    if (!(k in ranks)) {
      throw new Error(
        `editStableKeyRankSet: edit stableKey "${k}" is not present in base.ranks ` +
          `(use customStableKeyRankSet to build a fresh set from scratch)`,
      );
    }
    if (v === null) {
      ranks[k] = null;
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(
        `editStableKeyRankSet: edit value at "${k}" is not finite (got ${String(v)})`,
      );
    }
    ranks[k] = v;
  }
  return { mode: modeLabel, ranks };
}
