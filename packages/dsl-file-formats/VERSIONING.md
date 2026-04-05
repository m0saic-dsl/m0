# Versioning — @m0saic/dsl-file-formats

**Posture: additive container formats.** Grows via minor bumps. Major only for format version changes.

`.m0` and `.m0c` file format parsing and serialization.
Depends on `@m0saic/dsl` only.

## Semver contract

| Bump  | When |
|-------|------|
| patch | Bug fixes, doc fixes |
| minor | New file format types, new optional fields on existing formats |
| major | Changes to existing format contracts, format version field bumps |

## What is frozen after v1.0.0

- `serializeM0File` / `parseM0File` signatures and behavior
- `serializeM0cFile` / `parseM0cFile` signatures and behavior
- `formatISO` signature
- `M0File`, `M0cFile`, `M0FileMeta` type shapes
- `M0cDeriveImage`, `M0cDeriveImageMime` type shapes
- `.m0` header format and field order
- `.m0c` JSON structure and field normalization
- Roundtrip stability: `parse(serialize(x))` preserves all fields
- Deterministic serialization (fixed header order, sorted label keys)
- Unknown field handling (silently ignored, forward-compatible)
- `version: 1` literal types on both formats

## What can grow (minor bumps)

- New file format types (e.g., `.m0p` for playlists)
- New optional fields on `M0FileMeta`
- New optional fields on `M0cFile` (e.g., new derive types)
- New MIME types in `M0cDeriveImageMime`

## Format version rule

Within v1.x of this package, consumers can safely match on
`version === 1` for both `.m0` and `.m0c` formats. A new format
version (e.g., `version: 2`) requires a **major** package version
bump so consumers know to update their parsers.

## What does NOT trigger a version bump

Only changes under `src/` affect the published package. Everything else is repo scaffolding:

- Documentation (README.md, VERSIONING.md, API.md)
- Tests and test fixtures
- Build configs (tsconfig, jest.config, scripts/)
- CI/CD configuration
- LICENSE, NOTICE (content-preserving updates)

These may change between releases without a version bump.

## Downstream impact

This package versions independently of `@m0saic/dsl-stdlib`.
`@m0saic/dsl-visual-tests` depends on this package for `.m0`
serialization in the golden test harness.