# Changelog

## 2.0.0 — 2026-09-19

### Overlay bodies: must have ≥1 node, paint no longer required

Relax the per-overlay validation rule so an overlay body `{...}` no
longer needs to contain a source tile (`1` / `F`). The new rule is
"the body must contribute at least one node to the graph" — paint is
no longer required. This unlocks the **logical-owner** pattern
(`-{<sub-content>}`) as a first-class structural-marker shape: the
`-` claims its rect for stableKey + label identity, the overlay
carries content that may or may not paint.

The whole-string `NO_SOURCES` check is unchanged — the OUTER (root)
layout still has to produce at least one source tile. The relaxation
is per-overlay only; nested bodies can be paint-free, the root must
paint something.

**Compatibility.**

- **Breaking:** no. Strictly additive — every string that was valid
  before is still valid. A subset of previously-rejected strings
  becomes valid.
- The `ZERO_SOURCE_OVERLAY` error code stays defined in the union
  type so existing TypeScript code that references the symbol
  continues to compile. The validator just never raises it.
- All in-repo callers depend on `@m0saic/dsl` via `*` (workspace) or
  `^1.0.0` — `1.1.0` is semver-compatible with the caret range.

### Remove `M0Label` type export

Drop the `M0Label` type export from `@m0saic/dsl`. Nothing inside the
DSL package's runtime ever consumed it — labels are a file-format
concern, not a DSL-grammar concern — so the type has been re-homed to
`@m0saic/dsl-file-formats`, which is now the canonical (and only)
source for `import type { M0Label } from "..."`.

**Compatibility.**

- **Breaking: yes.** Any consumer doing
  `import type { M0Label } from "@m0saic/dsl"` will fail to type-check.
- **Migration:** re-point the import to
  `import type { M0Label } from "@m0saic/dsl-file-formats"`. The type
  shape is byte-identical (`{ text: string; color?: string }`), so
  no value-level code changes are required. Every consumer in this
  monorepo (`@m0saic/dsl-file-formats` internals,
  `@m0saic/template-utils`, `@m0saic/dictionary`, `@m0saic/dsl-stdlib`,
  `@m0saic/templates`, and `apps/mosaic/web`) was re-pointed in the
  same change set.
- Note that the *semantic* of `M0Label.color` has also narrowed in
  `dsl-file-formats`: it now means "label chip UI tint," not "rect
  fill color." Files written before this change with rect-fill
  intent should manually migrate those values into the new top-level
  `fill[k].color` map. Old files still parse cleanly — the value
  just stops driving the rect overlay.

**Release notes.**

- Sits alongside `2026-06-03-overlay-bodies-allow-no-paint.md`
  (minor) in this folder. The aggregate next-publish bump is
  **major** (highest wins). Author intends to combine both entries
  into the next `@m0saic/dsl` release.

### Render-only materialization option + public-API prune

Two changes shipped together:

1. **New `materialize` parse option (additive).** `parseM0StringComplete`
   accepts `opts.materialize?: "full" | "renderOnly"` (default `"full"`, fully
   backward-compatible). `"renderOnly"` returns only the rendered frames — with
   **real, byte-identical stableKeys** (and spans) — and skips the all-node
   `EditorFrame` map and the passthrough-owner DFS. On passthrough/null-dense
   layouts (total nodes ≫ rendered frames) this is a large win: on a real
   1.07M-char / 532K-node background pattern that renders only 226 tiles,
   materialization drops from 532,330 objects to 226.
   `parseM0StringToLogicalFrames` is now implemented on top of `renderOnly`, so
   every real-key render-frame caller gets faster for free. `renderOnly` also
   **prunes the identity walk** to rendered-frame ancestor paths only — it never
   builds stableKeys for the spacer subtrees it wouldn't return (keys stay
   byte-identical), cutting the identity pass on the fixture from ~1.4s to
   ~0.14s and dropping the identity map from O(total nodes) to O(rendered), which
   raises render-only's memory ceiling toward the geometry tier's.

   **Spans captured during parse (perf, no API change).** Per-frame source
   spans (`meta.span`, the editing splice anchor) are now recorded by the
   engine's existing offset-based parse walk instead of a separate
   `computeNodeSpansByPath` string scan. Spans cost nothing beyond the parse,
   so both tiers carry them. Removing the redundant scan also made the **full**
   parse ~1.75× faster (the 1.07M-char fixture: ~7.7s → ~4.4s), byte-identical
   output (validated frame-for-frame against the old scan, kept as a test oracle).

2. **Public-API prune (breaking).** Removed exports that weren't earning their
   keep across the monorepo, and un-exported internal-only helpers.

**Compatibility.**

- **Breaking** (hence major). The removed symbols had no in-repo consumers
  outside the one migration below; `pending-releases/UPSTREAM.md` must be
  checked for external npm consumers before publishing.
- Consumer migration: `@m0saic/dsl-stdlib` `evaluateM0` switched
  `getComplexityMetrics` → `getComplexityMetricsFast` (no dsl-stdlib API
  change).

### Compact m0 form — `toCompactM0String` / `fromCompactM0String`

Two new formatting helpers add a third presentation form for m0 strings.
**Compact** form is pretty form (`0`→`>`, `1`→`F`) with runs of `>` or `-`
folded into `N>` / `N-`:

```typescript
toCompactM0String("6[1,0,0,0,0,1]");  // "6[F,4>F]"
fromCompactM0String("6[F,4>F]");      // "6[1,0,0,0,0,1]"
```

Compact is a **transport** form, not grammar. A folded string fails
`isValidM0String` by construction, nothing in the parser, validator, or file
formats understands it, and no file format changes. The round-trip law, for
every valid m0 string `x`:

```typescript
fromCompactM0String(toCompactM0String(x)) === toCanonicalM0String(x)
```

Both functions are pure, dependency-free, and GIGO on invalid input — the same
contract as their `format/` siblings `toCanonicalM0String` / `toPrettyM0String`.

**Compatibility.**

- **Breaking: no.** Purely additive: two new exports, no signature or behavior
  change to any existing function.
- No grammar change. The parser, validator, and both file-format layers
  (`@m0saic/dsl-file-formats`, `@m0saic/platform`) are untouched and still
  canonicalize + validate on read and write. Compact strings must be unfolded
  before reaching any of them — that's enforced naturally, since they fail
  validation.
- The count-exact invariant ("a container holds exactly N explicit slots") is
  unchanged *inside the grammar*. Compact sits outside it.
- `@m0saic/dsl` is a frozen package; the founder approved this minor
  explicitly. `packages/dsl/package.json` is untouched (version bumps happen at
  publish time).

**Release notes.**

- Two app-side consumers, neither of which ships with the package — only the
  `packages/dsl` files listed above:
  `routing/layoutUrl.ts` (compact on URL build, expand on URL parse) and
  `pages/LayoutLowLevelPage.tsx`, whose third token-view now renders
  `toCompactM0String` instead of a local `foldRuns`. That removes the duplicate
  fold: the string on screen is byte-identical to the one a share link carries.
  The old view was named "folded"; `readTokenMode` migrates the persisted value.
- Sits alongside two **major** entries already queued in this folder
  (`2026-06-10-remove-m0label-export.md`,
  `2026-06-25-render-only-materialization-and-api-prune.md`), so the aggregate
  next-publish bump for `@m0saic/dsl` remains **major** (v2.0.0).

## 1.0.0 — 2026-04-05

First public release of the m0 layout language: grammar, parser, validator, canonicalizer, formatter, complexity metrics, feasibility analysis, equality.
