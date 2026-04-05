# Versioning — @m0saic/dsl

**Posture: frozen core.** Goal is to never bump major after v1.0.0.

This is the DSL language definition — grammar, parser, validator,
canonicalizer, formatter, complexity metrics, feasibility analysis,
equality. Zero dependencies. The foundation everything builds on.

## Semver contract

| Bump  | When |
|-------|------|
| patch | Bug fixes, performance improvements, doc fixes |
| minor | New read-only helpers or query functions, new warning codes, new optional parse fields |
| major | Avoid. Grammar changes, semantic changes, renamed/removed exports, type shape changes |

## What is frozen after v1.0.0

- All public function signatures and return types
- All type names and structures
- All discriminator fields (`ok`, `kind`, `type`, `by`)
- Error codes (11 in `M0_VALIDATION_ERROR_SPECS`)
- Warning codes (`M0_WARNING_SPECS`)
- `splitEven` outside-in remainder distribution algorithm
- `StableKey` path format (`r/growc0/fc1/ov1c0`)
- Canonicalization rules (`F`->`1`, `>`->`0`, whitespace strip)
- Precision calculation (`maxSplitX`, `maxSplitY`, `maxSplitAny`)
- Feasibility minimum resolution algorithm
- Branded `M0String` type contract

## What can grow (minor bumps)

- New read-only query functions (e.g., new complexity helpers)
- New warning codes added to `M0_WARNING_SPECS`
- New optional fields on existing result types
- New parse options via `ParseM0Options`
- Performance improvements (same semantics, faster)

## What does NOT trigger a version bump

Only changes under `src/` affect the published package. Everything else is repo scaffolding:

- Documentation (README.md, VERSIONING.md, `.docs/`, API.md)
- Tests and test fixtures
- Build configs (tsconfig, jest.config, scripts/)
- CI/CD configuration
- LICENSE, NOTICE (content-preserving updates)

These may change between releases without a version bump.

## Downstream impact

`@m0saic/dsl-stdlib`, `@m0saic/dsl-file-formats`, and
`@m0saic/dsl-visual-tests` all depend on this package.
A dsl patch/minor requires no downstream bumps. A dsl major
(if it ever happens) requires major bumps in all downstream packages.
