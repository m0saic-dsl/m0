# Vendored OSS code

This directory holds **third-party open-source code** vendored into
`@m0saic/dsl-stdlib` — not authored by the m0saic team. Each subdirectory
mirrors a single npm package's source with full provenance documentation.

## Why vendor?

`@m0saic/dsl-stdlib` is a foundational, widely-consumed package. Every
runtime dep we carry transitively burdens every consumer (templates, the
editor, third-party authors). Vendoring small, stable OSS code lets us:

- Keep our published dep graph narrow.
- Own the call chain (no surprise interop bugs from bundler edge cases —
  see e.g. the `svg-arc-to-cubic-bezier` CJS-ESM webpack interop story
  that motivated this vendoring).
- Patch / type / update on our schedule instead of waiting on upstream.

We are **embracing the OSS ecosystem**, not avoiding it — these packages
are vendored under their original MIT licenses with author attribution
preserved. The vendoring contract is:

1. **Credit the author.** Every file's header carries the original
   author, source URL (npm + GitHub), version copied, and copy date.
2. **Preserve the license.** MIT license text lives in
   `vendor/LICENSE_MIT.md` (one copy; every per-file header points at it).
3. **Document modifications.** Each file's header lists what changed
   when porting (typically: "ported to TypeScript", "added types",
   "added named export"). If we ever patch behavior, that goes here too.
4. **Stay structurally faithful.** The algorithms are upstream's; we
   don't fork the math. If a port introduces a bug or behavior
   divergence, that's a port bug, not an intentional fork.

## The vendored chain

This whole subtree replaces the `svg-path-bounds` dep (and its 4 transitive
deps) — historically used by `src/libraries/svg/extractGeometry.ts` to
compute path bounding boxes for SVG → MO grid inference.

Resolution order (leaves → root):

| Subdir | Original npm | Original author | Version | Used by |
|---|---|---|---|---|
| `is-svg-path/` | `is-svg-path@1.0.2` | Dima Yv | 1.0.2 | `svg-path-bounds` |
| `parse-svg-path/` | `parse-svg-path@0.1.2` | Jake Rosoman | 0.1.2 | `svg-path-bounds` |
| `abs-svg-path/` | `abs-svg-path@0.1.1` | Jake Rosoman | 0.1.1 | `svg-path-bounds`, `normalize-svg-path` |
| `svg-arc-to-cubic-bezier/` | `svg-arc-to-cubic-bezier@3.2.0` | Colin Meinke | 3.2.0 | `normalize-svg-path` |
| `normalize-svg-path/` | `normalize-svg-path@1.1.0` | Jake Rosoman | 1.1.0 | `svg-path-bounds` |
| `svg-path-bounds/` | `svg-path-bounds@1.0.2` | Dima Yv | 1.0.2 | `extractGeometry` (top of the chain) |

All vendored 2026-05-31. All MIT.

## Updating

If upstream ships a fix or improvement worth pulling:

1. Diff our vendored copy against the new upstream version.
2. Port the relevant change (preserving the existing TS type structure).
3. Update the header's "version" + "copy date" + "modifications" fields.
4. Add a `pending-releases/dsl-stdlib/` entry — this package is published.

If no upstream activity for a long time (the case today — most of these
packages haven't released in 5+ years), no action needed; the vendored
copy is stable.

## Boundary

**Vendored code does not import from m0saic packages.** Each subdir is
self-contained (or imports only from a sibling vendor subdir, mirroring
the upstream dep edges). The vendor folder is a closed substrate — m0saic
code imports from it; it does not import back. This makes the boundary
visible at code-review time and prevents accidental coupling that would
make a future swap-back-to-npm-deps harder.
