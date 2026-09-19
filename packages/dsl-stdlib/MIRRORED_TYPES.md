# Mirrored types — keep aligned with `@m0saic/types`

Three types in this package are **structural duplicates** of types defined in
`@m0saic/types`. They are intentionally not imported across the package
boundary — this package stays free of an `@m0saic/types` dep so the stdlib
core remains narrow and dependency-light.

The trade-off is **drift risk**: if the `@m0saic/types` definition changes,
the mirror here must be updated by hand. **This file is the index of those
mirrors so the drift point is visible.** Any PR that touches one side must
touch the other.

## Why mirror instead of import?

- `@m0saic/dsl-stdlib` is the canonical DSL library — every consumer of the
  m0 DSL goes through it. Keeping its dep graph small means consumers
  (templates, the editor, third-party authors) pull in less code by default.
- The mirrored shapes are small (the largest is ~5 fields with a nested
  bounds object), stable (`MosaicMaskEntry` / `MosaicMaskSetFile` /
  `MosaicRankSetFile` are foundational dictionary types that haven't changed
  in versions), and behavior-free (pure JSON shapes). Drift risk is low and
  any divergence is immediately visible at consumer call sites
  (`apps/mosaic/web` passes data between functions typed against both
  packages — structural compatibility means alignment failures show up as TS
  errors right away).
- Stdlib types should be **self-documenting**. Reading `mirroredTypes.ts` in
  this package, the reader sees exactly the shape the stdlib functions
  consume and produce, without chasing an import into a higher-level package.

## The mirror table

| Local type (this package) | Source-of-truth type (`@m0saic/types`) | Notes |
|---|---|---|
| `MosaicRankSetFile` | `MosaicRankSetFile` (`packages/types/src/dictionary/dictionary.ts:198`) | `{ mode?: string; ranks: number[] }`. Returned by `generateRankSet` / `customRankSet` / `editRankSet`. |
| `MosaicMaskEntry` | `MosaicMaskEntry` (`packages/types/src/dictionary/dictionary.ts:221`) | `{ localPath: string; bounds: { x, y, width, height } }`. A single per-frame mask shape; an element of `MosaicMaskSetFile.masks[]`. |
| `MosaicMaskSetFile` | `MosaicMaskSetFile` (`packages/types/src/dictionary/dictionary.ts:244`) | `{ masks: (MosaicMaskEntry \| null)[] }`. Returned by `generateMasks` — indexed by canonical source order. |

Mirrors live in `src/mirroredTypes.ts` and are re-exported from the package's
top-level barrel (`src/index.ts`), so consumers can import them as
`import type { MosaicMaskSetFile } from "@m0saic/dsl-stdlib"`.

## When updating either side

1. Update the source-of-truth definition in `@m0saic/types`.
2. Update the matching local type in `packages/dsl-stdlib/src/mirroredTypes.ts`.
3. Update this table if the mapping itself changes (rename, field shape, …).
4. Add a `pending-releases/dsl-stdlib/` entry — this package is published.
5. The `@m0saic/types` change does NOT need a pending-release entry — types is
   monorepo-versioned (see `pending-releases/README.md` and the project agent
   contract §7.5).

## Name collision in consumers

Both packages export the same type names. Consumers that import from both
(rare; typically the editor / wizard layer) get a nominal collision. They can
either:

- Alias one at the import site: `import type { MosaicMaskSetFile as DslMaskSet } from "@m0saic/dsl-stdlib";`
- Or just pick one source — the shapes are structurally identical, so data
  flows freely between functions typed against either version.

## Sibling document

`@m0saic/dsl-file-formats` also mirrors a related type
(`M0cMaskEntry` ↔ `MosaicMaskEntry`) for the same reason. See that package's
`MIRRORED_TYPES.md` for the file-format-side story. Both mirrors hold
structural identity with `@m0saic/types`; if a single shape change must
propagate to both packages, all three sides need to land in the same PR.

## If the mirror count grows

If we end up with more than ~5 mirrored types, or any of them carry behavior
beyond a plain shape, revisit the decision to mirror. The threshold for adding
the dep is "the cost of keeping the mirrors aligned exceeds the architectural
cost of pulling in `@m0saic/types`." Until then, mirror.
