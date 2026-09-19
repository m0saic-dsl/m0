/**
 * Structural mirrors of types from `@m0saic/types`.
 *
 * Mirrored locally so `@m0saic/dsl-stdlib` stays dep-free of `@m0saic/types`.
 * See `MIRRORED_TYPES.md` at the package root for the rationale and the
 * align-by-hand workflow.
 *
 * Mirrors:
 *
 *   - `MosaicRankSetFile`    → packages/types/src/dictionary/dictionary.ts (sidecar, positional `ranks: number[]`)
 *   - `MosaicRankSet`        → packages/types/src/dictionary/dictionary.ts (m0c-inline, stableKey-keyed `ranks`)
 *   - `MosaicRankSetEntry`   → packages/types/src/dictionary/dictionary.ts (single per-frame rank value)
 *   - `MosaicMaskEntry`      → packages/types/src/dictionary/dictionary.ts
 *   - `MosaicMaskSetFile`    → packages/types/src/dictionary/dictionary.ts
 *
 * Any change to one side must be reflected in the other. Re-running this
 * package's test suite catches structural mismatches at consumer call sites
 * (the wizard, the dictionary build script) — but the structural identity is
 * a contract, not an inference, so PRs touching either side should update
 * both deliberately.
 */

/**
 * Rank set file referenced by `MosaicDictionaryEntry.rankSets`.
 *
 * Represents a deterministic ordering / progression over tiles.
 */
export type MosaicRankSetFile = {
  /**
   * Optional semantic hint for how the ranks were generated
   * (e.g. "diag", "spiral", "row-major").
   * Informational only; not interpreted by core.
   */
  mode?: string;

  /**
   * Rank values, one per source.
   * Must have length === entry.sourceCount.
   * Values are typically normalized to [0, 1].
   */
  ranks: number[];
};

/**
 * Per-frame rank value carried in {@link MosaicRankSet.ranks}. Sweep
 * progress, conventionally normalized to `[0..1]` — the format does not
 * enforce a range.
 */
export type MosaicRankSetEntry = number;

/**
 * A single named rank set carried inline on an m0c (or m0p variant),
 * keyed by stableKey. Mirror of `MosaicRankSet` from `@m0saic/types`.
 *
 * Used by the StableKey-aware rank builders (`generateStableKeyRankSet`,
 * `customStableKeyRankSet`, `editStableKeyRankSet`). The legacy positional
 * builders return {@link MosaicRankSetFile} instead — both coexist.
 *
 * Field semantics:
 * - `mode`: informational ordering hint (`"diag"` / `"cascade"` /
 *   `"radial"` / `"custom"` / any future label). Round-trips unchanged.
 * - `ranks`: per-frame rank values keyed by stableKey. Null entries mean
 *   "explicitly no rank for this frame"; absent keys mean "no opinion".
 */
export type MosaicRankSet = {
  mode?: string;
  ranks: Record<string /* stableKey */, MosaicRankSetEntry | null>;
};

/**
 * A single mask entry for a non-rectangular source frame.
 *
 * Describes an SVG path in local (node-relative) coordinates that clips
 * the tile to its true shape. At render time the engine scales the path
 * from designBounds to actual tile pixel dimensions and rasterizes it.
 */
export type MosaicMaskEntry = {
  /**
   * SVG path data in local coordinates (relative to the tile's design bounds).
   * Example: "M 21.3477 30.9223 L -0.325 0.388 V 45.1067 H 31.924 Z"
   */
  localPath: string;

  /**
   * Design-space bounding box this path was authored against.
   * Used to compute the scale factor at render time:
   *   scaleX = tileRenderWidth / bounds.width
   *   scaleY = tileRenderHeight / bounds.height
   */
  bounds: { x: number; y: number; width: number; height: number };
};

/**
 * Mask set file referenced by `MosaicDictionaryEntry.maskSets`.
 *
 * Describes per-source clipping masks for non-rectangular tiles.
 * Array is indexed by canonical source order (same as sources[]).
 * null entries mean the tile is a full rectangle — no masking needed.
 */
export type MosaicMaskSetFile = {
  /**
   * One entry per source frame.
   * Must have length === entry.sourceCount.
   * null = full rect tile, no mask applied.
   */
  masks: (MosaicMaskEntry | null)[];
};
