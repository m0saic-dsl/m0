# Versioning — @m0saic/dsl-visual-tests

**Posture: visual regression suite.** Tracks `dsl` and `dsl-stdlib` coverage.

Golden wireframe PNG tests for `@m0saic/dsl` and `@m0saic/dsl-stdlib`.
Exports a reusable golden test harness (`assertWireframeGolden`).
Depends on `@m0saic/dsl`, `@m0saic/dsl-stdlib`, `@m0saic/dsl-file-formats`.

## Semver contract

| Bump  | When |
|-------|------|
| patch | Golden updates, harness fixes, threshold adjustments |
| minor | New stdlib test suites (new builders, new transforms) |
| major | New core DSL test suites (language-level visual semantics) |

## Rationale

This package's version reflects **test coverage scope**, not API
compatibility in the traditional sense. A major bump signals that
the underlying DSL language gained new visual semantics worth testing
(which propagates to stdlib too). A minor bump signals new stdlib
functionality being covered by golden tests.

## What is frozen after v1.0.0

- `assertWireframeGolden` function signature
- `WireframeGoldenOpts` type shape
- Golden file naming conventions
- `.m0` sibling file format (deterministic metadata)
- Update mode env var (`M0SAIC_UPDATE_GOLDENS=1`)

## What does NOT trigger a version bump

Only changes under `src/` affect the published package:

- Documentation (README.md, VERSIONING.md)
- Build configs (tsconfig, jest.config)
- CI/CD configuration
- LICENSE, NOTICE (content-preserving updates)

These may change between releases without a version bump.

## What can grow

- New test suites for new builders/transforms (minor)
- New golden comparison strategies (minor)
- Harness options (new optional fields on `WireframeGoldenOpts`, minor)
- New visual semantics coverage (major)
