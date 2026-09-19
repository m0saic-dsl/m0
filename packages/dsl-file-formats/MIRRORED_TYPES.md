# Mirrored types — keep aligned with `@m0saic/types`

A few types in this package are **structural duplicates** of types defined in
`@m0saic/types`. They are intentionally not imported across the package boundary
— this package stays free of an `@m0saic/types` dep so the file-format core
remains small and self-documenting.

The trade-off is **drift risk**: if the `@m0saic/types` definition changes, the
mirror here must be updated by hand. **This file is the index of those mirrors
so the drift point is visible.** Any PR that touches one side must touch the
other.

## Why mirror instead of import?

- `@m0saic/dsl-file-formats` is a low-level JSON serialization package. Its
  current deps are `@m0saic/dsl` only — adding a dep on `@m0saic/types` would
  pull a richer domain-types surface into a layer that should stay narrow.
- The mirrored shapes are small (≤ 5 fields, no nested unions, no behavior).
  Drift risk is low and any divergence is immediately visible at runtime
  (consumers expecting the `@m0saic/types` shape will fail structurally if
  the file-format shape moves).
- File-format types should be **self-documenting**. Reading `types.ts` in this
  package, the reader sees exactly the JSON shape the file carries, without
  chasing an import into a higher-level package.

## The mirror table

| Local type (this package) | Source-of-truth type (`@m0saic/types`) | Notes |
|---|---|---|
| `M0cMaskEntry` | `MosaicMaskEntry` (`packages/types/src/dictionary/dictionary.ts`) | Per-frame inline mask shape (`{ localPath, bounds }`). Used in `M0cFile.masks` + `M0pVariantEntry.masks`, keyed by `StableKey`. Consumers wrap as `{ kind: "inline-mask", ...entry }` per `MosaicSourceMask` at render time. |
| `M0cRankSet` (+ `M0cRankSetEntry`) | `MosaicRankSet` (+ `MosaicRankSetEntry`) (`packages/types/src/dictionary/dictionary.ts`) | Per-frame rank shape (`{ mode?, ranks: Record<string /* stableKey */, number \| null> }`). Used in `M0cFile.rankSets` + `M0pVariantEntry.rankSets`. Outer map key = rank-set name (e.g. `"diag"`, `"cascade"`, `"hero"`); inner map key is **stableKey-semantic but typed as plain `string`** — matches how `MosaicDictionaryEntry.masks` is keyed in `@m0saic/types`. Replaces the sidecar `MosaicRankSetFile` (`ranks: number[]`) for m0c-inline storage — stableKey identity survives splits/overlays where positional indices do not. The positional `MosaicRankSetFile` shape stays exported for `@m0saic/dsl-stdlib`'s legacy builders. |
| `M0cInset` | `MosaicBoxFrac` (`packages/types/src/source/source.ts` — the `inset` on `MosaicPlacement`) | **Resolved projection, NOT a structural duplicate.** `MosaicBoxFrac` is the authoring superset (`number \| {x,y} \| per-side`); `M0cInset` is its one canonical resolved wire form — all four edges present (`{ top, right, bottom, left }`, fractions 0..1). Used in `M0cFile.insets` + `M0pVariantEntry.insets`, keyed by `StableKey`. Byte-identical to ViewFrame's `insetBoxes` prop, so the cyan inner-box painter consumes it unchanged. The superset is collapsed once at the extraction boundary (the app's `resolveBoxFrac`, `apps/mosaic/web/src/utils/geometryDecor.ts`). **Drift rule:** if `MosaicBoxFrac` gains a NEW authoring form, `M0cInset` does not change — instead every `resolveBoxFrac` call site must learn to resolve the new form into the same four-edge shape. |

When updating either side:

1. Update the source-of-truth definition in `@m0saic/types`.
2. Update the matching local type in `packages/dsl-file-formats/src/types.ts`.
3. Update this table if the mapping itself changes (rename, field shape, …).
4. Add a `pending-releases/dsl-file-formats/` entry for the file-format change
   (this package is published).
5. The `@m0saic/types` change does NOT need a pending-release entry — types is
   monorepo-versioned (see `pending-releases/README.md` and the project agent
   contract §7.5).

## If the mirror count grows

If we end up with more than ~3 mirrored types, or any of them carry behavior
beyond a plain shape, revisit the decision to mirror. The threshold for adding
the dep is "the cost of keeping the mirrors aligned exceeds the architectural
cost of pulling in `@m0saic/types`." Until then, mirror.


## Not a mirror: the agent annotation layer

The agent annotation shapes (`M0AgentMeta`, `M0AgentResponse`, `M0AgentComment`, the loose `CandidateContext`) and their transport helpers are DEFINED here, in `src/agent.ts` — this package owns the bytes on disk. `@m0saic/momo-types` depends on this package and re-exports them with a typed `CandidateContext` refinement (derived, not duplicated). Since 2026-09-19 there is no momo-types dependency here and nothing to keep in sync by hand.
