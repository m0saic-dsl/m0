# Changelog

## 1.1.0 — 2026-05-01

### .m0p — multi-variant pack format

New file format `.m0p` (m0 Pack) — a single JSON container that bundles multiple coordinated `.m0c`-shaped layout variants under one shared identity. Each variant is keyed by an id (e.g., `"desktop"`, `"mobile"`, `"square"`, `"story"`), carries its own canvas / DSL / labels / thumbnail, and inherits pack-level metadata (created, app, regions registry, campaign meta) by default. Existing `.m0` and `.m0c` formats are unchanged — `.m0p` is strictly additive.

Ships with the full parse / serialize / discovery / conversion API plus a closed 3×3 conversion matrix between all three formats. Every direction (`.m0 ↔ .m0c ↔ .m0p`) has exactly one canonical entry point.

**Why.** The package previously shipped two formats, each holding *exactly one* layout. Both answered "what does this layout look like at 1920×1080?" but not "what does this campaign look like across desktop, mobile, square, and story?" — which is the question every brand team and template author actually has. The previous workaround was N parallel `.m0c` files maintained by hand with no shared identity, no shared semantic-region table, no atomic exchange unit, no canonical place for cross-variant metadata, and no contract for tooling that wants to pick a variant by canvas. `.m0p` fills exactly this gap: one file, multiple coordinated variants, shared identity.

`aspectSafeGrid` (newly returning a landscape/portrait pair in `@m0saic/dsl-stdlib` 2.0.0) has a natural serialization target in `.m0p`.

**Design notes.**

- **Variants are inline `.m0c`-shaped entries**, not raw m0 strings. Reusing the `.m0c` shape means whatever fields land on `M0cFile` later (animation tracks, perf hints, new derive mimes) are immediately available to every variant in every pack — no `.m0p` schema change required. A variant can be extracted as a standalone `.m0c` with zero transformation.
- **Variants are a keyed object, not an array.** Lookup is the dominant access pattern (`pack.variants[ctx.target.platform]`), identity is intrinsic (a variant *is* its key), and JSON key uniqueness is free.
- **Pack-level fields are defaults**; per-variant overrides for `created` / `app` / `appVersion` are supported but emitted only when they differ from the pack-level value, so roundtripping doesn't manufacture spurious overrides.
- **Pack-level `regions` registry** declares the shared semantic vocabulary (`headline`, `hero`, `logo`, `cta`) once. Variant labels reference it by *label text* (the human string), not by `StableKey` — keeping `StableKey` purely structural per the `.m0c` contract.
- **Variant key + region name validation:** `^[a-z0-9][a-z0-9-]*$` (lowercase kebab). Rejects uppercase, underscore, space, non-ASCII.
- **Deterministic serialization:** variant keys sorted alphabetically, region keys sorted, label keys sorted by `StableKey`, DSL canonicalized, fixed field order, 2-space indent + trailing newline. Byte-stable roundtrip.
- **Forward-compatible:** unknown fields silently preserved at every level (same posture as `.m0c`).

**Conversion matrix.** The package now exposes one canonical entry point for every direction:

| from \ to | `.m0` | `.m0c` | `.m0p` |
|---|---|---|---|
| `.m0` | identity | `upgradeM0ToM0c` | `upgradeM0ToPack` |
| `.m0c` | `downgradeM0cToM0` ⚠ | identity | `bundleM0cIntoPack` |
| `.m0p` | `extractVariantAsM0` ⚠ | `extractVariantAsM0c` | identity |

⚠ = lossy by design (drops labels, derive image, multi-variant siblings). Named `downgrade*` / `extract*` so the data loss is visible at the call site rather than hidden in an `as`-style cast. All conversions are pure object transforms (no I/O, no async).

**API surface.** New types `M0pFile`, `M0pVariantEntry`, `M0pRegions`. New functions `serializeM0pFile`, `parseM0pFile`, `bundleM0cIntoPack`, `extractVariantAsM0c`, `listVariantKeys`, `getVariant`, `findVariantBySize`, plus the four conversion helpers `upgradeM0ToM0c`, `downgradeM0cToM0`, `upgradeM0ToPack`, `extractVariantAsM0`.

**Compatibility.** Purely additive — new types, new modules, new exports. `.m0` and `.m0c` formats unchanged. `.m0p` carries its own `version: 1` literal; a future `version: 2` would require a major package bump (same rule as `.m0c`). Variant entries inherit the `.m0c` versioning posture independently.

### custom field + label/pack validators

Two coordinated additions in this minor: a `custom` free-form JSON field on `.m0c` and `.m0p`, and pure validators for label/region integrity.

**`custom: unknown | null` field.** Adds a single new field to both `.m0c` and `.m0p` (at pack level *and* per-variant level inside packs). Free-form JSON. The format treats it as opaque: any JSON value (object, array, string, number, boolean, null) round-trips byte-for-byte unchanged. Templates and tooling stash structured business data here — brand palettes, source asset URLs, copy variants, render hints, review notes, comments, anything the consuming code knows how to interpret.

The serializer / parser write and read the field on both formats; conversion helpers (`bundleM0cIntoPack`, `extractVariantAsM0c`, `upgradeM0ToM0c`) thread it losslessly. Default is `null` so the addition is null-stable for every file in the wild.

**Why a single opaque field over typed sub-fields.** The `.m0p` proposal landed with typed sub-fields for things every consumer reads (size, m0 DSL, labels, derive image, meta, regions). The first real customer use cases that hit the editor immediately wanted *more* — brand asset packs, per-variant business data, comments / review notes. Considered and rejected: typed `comments: Comment[]`, `assets: AssetRef[]`, `brand: BrandTokens`. Each of those would burden the format with a permanent schema commitment for one team's evolving needs. `custom` keeps that surface flat. Discipline: typed sub-fields for things every consumer reads; one opaque `custom` for everything else. Templates pick a key prefix convention (`custom.brand.*`, `custom.assets.*`, `custom.copy.*`) and the format stays out of their way.

**Label and pack validators.** Two pure validators that consumers (the editor today, CLI / tooling tomorrow) can run against `.m0c` and `.m0p` data to surface integrity problems the format itself does not enforce:

- **`validateLabels({ validStableKeys, labels })`** — flags labels whose `stableKey` no longer maps to a frame in the layout's parsed frame set. Surfaces "you split the frame I was labeled on, my label is now floating in space."
- **`validatePack(pack, { liveVariantOverride?, parseCache? })`** — flags variants in a `.m0p` that are missing required regions (per `pack.regions`), variants where multiple labels resolve to the same region (case-insensitive duplicate), and per-variant orphan labels.

Both validators are pure functions returning structured issue arrays — no React, no DOM, no parsing inside. The caller supplies the parsed `validStableKeys` set, which lets editors reuse a parse they were already going to do (the editor's `<ViewFrame>` already runs `parseM0StringComplete` on every geometry change; the validator just consumes its output).

**Issue shapes.**

- `OrphanedLabelIssue` (warning, code `ORPHANED_LABEL`) — carries `stableKey`, `text`, human `message`.
- `RegionMissingIssue` (error, code `REGION_MISSING`) — carries `variantKey`, `region`, `message`.
- `RegionDuplicateIssue` (warning, code `REGION_DUPLICATE`) — carries `variantKey`, `region`, `stableKeys[]`, `message`.
- Aggregates: `LabelValidationResult { issues, hasError, hasWarning }`, `PackVariantIssues { variantKey, regionIssues, labelIssues, hasError, hasWarning }`, `PackValidationResult { perVariant, hasError, hasWarning }`.
- `EMPTY_LABEL_RESULT` and `EMPTY_PACK_RESULT` exported as stable references for downstream `useMemo` dependencies.

**Severity rationale.**

- `ORPHANED_LABEL` → warning. The label might be intentional in-progress state — the user might be mid-refactor and intend to recreate the frame.
- `REGION_MISSING` → error. The pack format declares regions as a contract; a missing region is a signed contract not honored.
- `REGION_DUPLICATE` → warning. Two frames carrying the same region label is structurally ambiguous but not strictly broken — surface but don't block.

**Why parse-free.** Editors parse on every keystroke for the active variant. Adding a second parse inside the validator would double that cost on the hot path. Parse errors, heavy-payload deferral, gating by user confirmation — these are application concerns. The validator stays a pure function over data: "given these stableKeys and these labels, here are the issues."

**Compatibility.** `custom` is nullable everywhere with a `null` default; existing `.m0c` and `.m0p` files in the wild parse identically. Older readers (built before this entry) silently ignore the field per the format's unknown-fields-preserved posture; round-trip through them strips `custom`. New readers preserve it. Validators are purely additive — opt-in usage, no existing exports change shape.
