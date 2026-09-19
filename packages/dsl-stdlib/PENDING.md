# Pending — proposed additions to `@m0saic/dsl-stdlib`

This file tracks helpers that have been prototyped against real product
needs but haven't been brought into the package yet. The prototypes live
in app code today; when the API + tests stabilize, they migrate here.

## Posture

Per `VERSIONING.md`: this package is additive. New helpers land as
minor bumps. The prototypes below are intentionally narrow (single
purpose, no surprising shape changes) so the migration is a copy +
test port, not an API redesign.

When migrating, the work is roughly:
1. Move the implementation to the matching subdirectory under
   `src/transforms/` (`primitives/overlay/` or `composed/overlay/`,
   depending on whether it composes existing primitives).
2. Re-shape the function signature to match the existing
   `validateInputOrThrow` / `finalizeM0Output` / `OpOutputOptions`
   conventions other transforms follow.
3. Port tests (the prototype site has them inline; copy + adapt).
4. Re-export through `src/transforms/index.ts`.
5. Replace the call sites with the public import.

---

## 1. Whole-doc overlay wrap (above / below)

**What**

Wrap an entire m0 string with a single overlay leaf — either as the
new overlay (paint above existing) or as the new base (paint below
existing).

```
wrapAbove(m0)  →  `${m0}{F}`
wrapBelow(m0)  →  `F{${m0}}`
unwrapAbove(m0) → strip trailing `{F}`, return inner or null
unwrapBelow(m0) → strip leading `F{` + matching `}`, return inner or null
```

**Why**

Compose's "Add overlay tile" doc-level operator and "Master audio
track" inject both need this. Existing dsl-stdlib has `addOverlay`
(per-node `{F}` injection) and `addOverlayToAllFrames` (bulk per-leaf)
but nothing for whole-doc wrap. The user-facing rationale: avoid the
half-claim layout splits that the obvious-but-wrong pattern
`2(0{1},<existing>)` creates. The clean wraps here add exactly +1
leaf with no geometric splits.

**StableKey contract** (matches the parser's overlay invariant — see
`packages/dsl/src/parse/m0StringParser.ts:1411` "Overlay invariant:
overlay frames do NOT affect structural stableKeys"):

- `wrapAbove`: existing leaves stay in the structural namespace, keep
  their stableKeys. New leaf gets a fresh overlay-namespace key
  (`/ov0/c0`).
- `wrapBelow`: the existing m0 moves into the new wrap's overlay
  namespace, so every leaf's stableKey is reassigned. The new outer
  leaf takes the original root's stableKey.

The asymmetry is load-bearing for editor UX — the prototype site
surfaces it as a "potentially destructive" hint on Below.

**Prototype**

`apps/mosaic/web/src/state/composeInjects.ts` (functions `wrapAbove`,
`wrapBelow`, `unwrapAbove`, `unwrapBelow`).

**Suggested target paths in dsl-stdlib**

```
src/transforms/primitives/overlay/wrapAbove.ts
src/transforms/primitives/overlay/wrapBelow.ts
src/transforms/primitives/overlay/unwrapAbove.ts
src/transforms/primitives/overlay/unwrapBelow.ts
```

Or unified:

```
src/transforms/unified/wrapDoc.ts   // (m0, position: "above" | "below")
src/transforms/unified/unwrapDoc.ts // (m0, position: "above" | "below") → string | null
```

Existing `addOverlay` is the precedent for unified shape with a target
discriminator; an overlay-direction discriminator fits the same model.

---

## How to remove an entry

When a helper migrates to dsl-stdlib:

1. Replace the call sites in `apps/mosaic/web/` (and anywhere else)
   with the public import.
2. Delete the prototype implementation from `composeInjects.ts` (or
   wherever).
3. Remove the corresponding section from this file.
4. Queue a release entry in `pending-releases/dsl-stdlib/` (see
   `pending-releases/README.md`). Do NOT bump `package.json` directly —
   the version bumps once at publish time, by the aggregate of the
   pending set (`VERSIONING.md` governs the per-entry bump tier; minor
   for new transforms).
