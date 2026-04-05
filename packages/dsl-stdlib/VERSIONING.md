# Versioning — @m0saic/dsl-stdlib

**Posture: additive toolkit.** Grows via minor bumps. Avoid major bumps.

Builders, transforms, queries, and construction helpers.
Optional layer on top of the core DSL. Depends on `@m0saic/dsl` only.

## Semver contract

| Bump  | When |
|-------|------|
| patch | Bug fixes in existing builders/transforms |
| minor | New builders, new transforms, new query functions, new type exports |
| major | Renamed/removed exports, signature changes to existing functions |

## What is frozen after v1.0.0

- All public function names and signatures
- All public type names and shapes
- `TransformTarget` discriminated union structure
- `SplitOptions`, `MeasureSplitOptions` option shapes
- Constructor behavior (`toM0String` throws, `tryM0String` returns Result)
- `rewriteOverlayChains` idempotency and semantics

## What can grow (minor bumps)

- New builder functions (e.g., `timeline()`, `carousel()`)
- New transforms (new operations beyond split/replace/overlay/etc.)
- New addressing schemes on `TransformTarget` (e.g., `{ by: "path", ... }`)
- New query functions
- New type exports for builder options/results
- New optional fields on existing option types

## Design constraints

- **Additive only** — stdlib never changes DSL semantics
- **All builders validate** — every builder returns a branded `M0String`
- **No implicit rewrites** — overlay chain rewriting is explicit
- **Deterministic output** — same params always produce the same DSL string

## What does NOT trigger a version bump

Only changes under `src/` affect the published package. Everything else is repo scaffolding:

- Documentation (README.md, VERSIONING.md, `.docs/`, API.md)
- Tests and test fixtures
- Build configs (tsconfig, jest.config, scripts/)
- CI/CD configuration
- LICENSE, NOTICE (content-preserving updates)

These may change between releases without a version bump.

## Downstream impact

This package versions independently of `@m0saic/dsl-file-formats`.
`@m0saic/dsl-visual-tests` depends on this package — new stdlib
builders/transforms trigger a visual-tests minor bump when golden
tests are added for them.