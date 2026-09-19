/**
 * Helpers for caller-authored rank sets — "custom" mode + edits on top of
 * a built-in set.
 *
 * Values are accepted as-is: no clamping, no re-normalization. The
 * `MosaicRankSetFile` type recommends [0, 1] but doesn't enforce it.
 *
 * Pure, deterministic, no I/O.
 */

import type { MosaicRankSetFile } from "../../mirroredTypes";

/**
 * Package a caller-provided rank array as a `MosaicRankSetFile`.
 *
 * @param ranks      One value per source. Length must match the source count.
 * @param modeLabel  Optional `mode` string. Defaults to `"custom"`.
 */
export function customRankSet(
  ranks: readonly number[],
  modeLabel: string = "custom",
): MosaicRankSetFile {
  if (!Array.isArray(ranks)) {
    throw new Error("customRankSet: ranks must be an array");
  }
  for (let i = 0; i < ranks.length; i++) {
    if (!Number.isFinite(ranks[i])) {
      throw new Error(`customRankSet: ranks[${i}] is not a finite number (got ${ranks[i]})`);
    }
  }
  return { mode: modeLabel, ranks: [...ranks] };
}

/**
 * Return a new `MosaicRankSetFile` with specific indices overridden by
 * caller-supplied values. The base set is not mutated.
 *
 * Typical wizard flow: user picks a built-in (e.g. `diag`), then tweaks a
 * handful of values in a table. The resulting set has `modeLabel`
 * (default `"custom"`) so downstream code can distinguish it from a pure
 * built-in run.
 *
 * @param base       Base rank set (from `generateRankSet` or `customRankSet`).
 * @param edits      Map of source-index → new rank value.
 * @param modeLabel  Optional `mode` string for the output. Defaults to `"custom"`.
 */
export function editRankSet(
  base: MosaicRankSetFile,
  edits: Record<number, number>,
  modeLabel: string = "custom",
): MosaicRankSetFile {
  if (!base || !Array.isArray(base.ranks)) {
    throw new Error("editRankSet: base must be a MosaicRankSetFile with ranks[]");
  }
  const ranks = [...base.ranks];
  for (const [key, value] of Object.entries(edits)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= ranks.length) {
      throw new Error(`editRankSet: edit index ${key} out of range [0, ${ranks.length - 1}]`);
    }
    if (!Number.isFinite(value)) {
      throw new Error(`editRankSet: edit value at index ${idx} is not finite (got ${value})`);
    }
    ranks[idx] = value;
  }
  return { mode: modeLabel, ranks };
}
