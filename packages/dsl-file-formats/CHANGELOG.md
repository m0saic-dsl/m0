# Changelog

## 2.0.1 — 2026-09-21

### downgradeM0cToM0: document that dropping insets changes the rendered geometry

`downgradeM0cToM0`'s JSDoc now states that the `insets` it drops are render-time geometry, so the
plain `m0` it returns paints bigger cells than the `.m0c` did, and points callers at
`lowerM0cToM0` in `@m0saic/dsl-stdlib`, which bakes the insets into the m0 first. No code change:
this function is the pure struct transform and cannot bake (stdlib depends on this package, not the
other way round).

**Compatibility.**

- Breaking: no. Behaviour unchanged.

**Release notes.**

If you convert `.m0c` → `.m0` and the file carries insets, use `lowerM0cToM0` from
`@m0saic/dsl-stdlib`; `downgradeM0cToM0` drops them.

## 2.0.0 — 2026-09-19

### File-format icons (.m0, .m0c, .m0p)

Ships canonical SVG icons for the three file formats this package defines: `.m0`, `.m0c`, `.m0p`. Icons live at `assets/icons/{m0,m0c,m0p}.svg` and are now included in the published tarball. Downstream consumers (editors, file managers, doc sites) can reference these as the canonical visual identity for each format without re-tracing.

**Compatibility.**

- Breaking: no. Pure addition.
- No code changes; no exports affected.

**Release notes.**

The `.mosaic` SVG icon lives alongside under `packages/types/assets/icons/mosaic.svg` but `types` is not a published package, so it ships nowhere via npm; the desktop app picks it up directly from the workspace.

### `.m0v` file format (video-config bundle)

Adds the `.m0v` ("video-config bundle") file format to the package. `.m0v` is CLI-consumed default user input: the CLI loads a `.m0v` (when supplied) and uses its `outputs` map as the User tier's default layer; CLI flags override the `.m0v` defaults within that tier; the merged result becomes user intent for the engine. Templates never read `.m0v` directly. Updates the package surface with:

- New type `M0vFile` in `types.ts` (JSON envelope: `format: "m0v"`, `version: 1`, the standard `created` / `app` / `appVersion` / `meta` header, an `outputs: Record<string, unknown>` payload, and a free-form `custom` field — same shape pattern as `M0cFile`).
- New functions `serializeM0vFile` and `parseM0vFile` exported from `@m0saic/dsl-file-formats/m0v`.
- Index barrel updated to re-export the new module.

**Compatibility.**

- Breaking: no. Pure addition. No existing types or exports touched.
- No version-1 m0v files exist in the wild yet (this is the format introduction), so no migration story needed.

**Release notes.**

Adds the `.m0v` (video-config bundle) file format: a JSON envelope carrying a brand-shared `outputs` map that the CLI loads as default user input (CLI flags override `.m0v` defaults within the User tier). `serializeM0vFile` / `parseM0vFile` mirror the `.m0c` API. Payload is type-light (`Record<string, unknown>`); semantic validation is the consuming application's responsibility.

### M0cFile + M0pVariantEntry — per-frame `masks` field

`M0cFile` and `M0pVariantEntry` gain an optional `masks` field carrying per-frame inline clipping-mask shapes keyed by `StableKey`:

```ts
masks: Record<StableKey, M0cMaskEntry | null> | null;
```

`M0cMaskEntry` is a new local type with the shape `{ localPath: string; bounds: { x, y, width, height } }` — structurally identical to `MosaicMaskEntry` from `@m0saic/types`. The mirror is intentional and documented; see `MIRRORED_TYPES.md` in this package.

`serializeM0cFile` / `serializeM0pFile` accept an optional `masks` option and emit it sorted by key for deterministic output. `parseM0cFile` / `parseM0pFile` round-trip it. Cross-format conversions (`bundleM0cIntoPack`, `extractVariantAsM0c`, `upgradeM0ToM0c`, `downgradeM0cToM0`) thread it through correctly — lossless for upgrades, intentionally lossy for the downgrade path.

**Compatibility.**

- Breaking: **no**.
- Old m0c / m0p files without the field parse cleanly — `masks: null` on the parsed object.
- New files without `masks` set produce `masks: null` in the JSON — same null-stable convention `labels` / `derive` use.
- Downstream literal-constructors of `M0cFile` / `M0pVariantEntry` in TypeScript code must add `masks: null` (verified across `apps/mosaic/web` — two App.tsx sites updated alongside this PR; spread-based constructions are unaffected).

**Release notes.**

<!-- Pairs with the `inline-mask` kind addition on `@m0saic/types`
     `MosaicSourceMask` and the SVG → Mosaic wizard's planned m0c-shaped
     "Send to Layout" handoff. Library-side the change is purely additive;
     the wizard flow that consumes it lands in a subsequent PR. -->

### M0cFile + M0pVariantEntry — per-frame `rankSets` field

`M0cFile` and `M0pVariantEntry` gain an optional `rankSets` field carrying named, per-frame sweep-progress values inline on the m0c (or per-variant on a pack):

```ts
rankSets: Record<string, M0cRankSet | null> | null;

type M0cRankSet = {
  mode?: string;                                  // "diag" | "cascade" | "radial" | "custom" | any string
  ranks: Record<string /* stableKey */, number | null>;
};
```

`M0cRankSet` is a new local type, structurally identical to `MosaicRankSet` from `@m0saic/types` — the mirror is intentional and documented in this package's `MIRRORED_TYPES.md`. `M0cRankSetEntry` is a small alias for `number` so the field type reads as "per-frame entry" at the call site.

`serializeM0cFile` / `serializeM0pFile` accept an optional `rankSets` option and emit it deterministically: outer set names sorted alphabetically, inner stableKey keys sorted within each set. `parseM0cFile` / `parseM0pFile` round-trip it. Cross-format conversions (`bundleM0cIntoPack`, `extractVariantAsM0c`, `upgradeM0ToM0c`, `downgradeM0cToM0`) thread it through — lossless for upgrades, intentionally lossy for the downgrade path.

**Compatibility.**

- Breaking: **no**.
- Old `.m0c` / `.m0p` files without the field parse cleanly — `rankSets: null` on the parsed object (and `null` on every parsed variant for packs).
- New files without `rankSets` set produce `rankSets: null` in the JSON — same null-stable convention `labels`, `derive`, `masks` use.
- Downstream literal-constructors of `M0cFile` / `M0pVariantEntry` in TypeScript code must add `rankSets: null` (two test helpers in this package updated alongside the source change — `src/types.test.ts`'s shape-test fixtures and `src/validate/validatePack.test.ts`'s `makeVariant`).
- `MosaicRankSetFile` (positional `ranks: number[]`) stays exported from `@m0saic/types` for the legacy stdlib + sidecar path. The m0c-inline shape is the new `MosaicRankSet` mirror — both coexist.

**Release notes.**

<!-- Companion follow-up sprints (not landing in this PR):
     - @m0saic/dsl-stdlib: StableKey-aware rank builders (generateStableKeyRankSet etc.) returning the new M0cRankSet shape; positional builders stay.
     - @m0saic/dictionary: migrate brand/m0, brand/m-33, brand/m0saic-pattern from sidecar *_ranks.json to inline m0c rankSets; drop MosaicDictionaryEntry.rankSets / rankSetsResolved.
     - @m0saic/templates: brand/logo/v2 + v3 + qr-animate/v1 swap to stableKey-keyed rank lookup.
     - SVG → Mosaic wizard: fold ranks/masks inline into the exported .m0c instead of sidecars (separate sprint).
-->

### M0cFile + M0pVariantEntry — `derive.background` (string) replaces `derive.image`

`M0cFile.derive` (and `M0pVariantEntry.derive`) changes shape from a two-key object discriminating between "image vs nothing" to a single nullable string slot that documents a small, prefix-detectable set of known payload forms:

```ts
// Before
derive: { image: M0cDeriveImage | null };

// After
derive: { background: string | null };
```

The string slot accepts these forms, all documented inline on the type and detected by the parser:

| Form | Example | Built with |
| ---- | ------- | ---------- |
| Embedded image (data URI) | `data:image/png;base64,AQIDBA==` | `encodeBackgroundImage({ mime, bytes, b64 })` |
| Opaque solid color | `#ef7525` | `encodeBackgroundColor({ hex: "#ef7525", opacity: 1 })` |
| Color with alpha (CSS Level 4) | `#ef7525cc` | `encodeBackgroundColor({ hex: "#ef7525", opacity: 0.8 })` |
| "No opinion" — consumer default | `null` | omit, or set explicitly |

A new module `@m0saic/dsl-file-formats/derive` (re-exported from the package root) ships the round-trip helpers:

- `encodeBackgroundImage({ mime, bytes, b64 }) → string`
- `encodeBackgroundColor({ hex, opacity }) → string`
- `parseBackgroundImage(s) → { mime, bytes, b64 } | null`
- `parseBackgroundColor(s) → { hex, opacity } | null`
- `isImageBackground(s) → boolean` / `isColorBackground(s) → boolean`

`M0cDeriveImage` stays exported as the in-memory triple for callers stashing an image. A new `M0cDeriveColor = { hex: string; opacity: number }` is the matching in-memory shape for colors.

**Compatibility.**

- **On-disk: BREAKING.** Files written with the old `derive: { image: ... }` shape no longer load. Treated as a deliberate clean break — there are no users in the wild — to avoid carrying a back-compat path forward forever.
- **TypeScript API: breaking.** Downstream code that constructs literal `M0cFile` / `M0pVariantEntry` objects must replace `derive: { image: null }` with `derive: { background: null }`; readers of `.derive.image` must switch to `.derive.background` (and use `parseBackgroundImage(s)` if they want the `{ mime, bytes, b64 }` triple back).

**Release notes.**

<!-- Pairs with the Layout view-frame controls update that now persists
     bgColor + bgOpacity into derive.background as `#rrggbb[aa]`, with
     two-way sync between the BgColorRow swatch and the FileDetailsModal
     color editor. -->

</content>
</invoke>

### M0cFile + M0pVariantEntry — per-frame `fill` field + `M0Label` rehome

Two coordinated changes ship together in this entry:

#### 1. New top-level `fill` field on `M0cFile` and `M0pVariantEntry`

```ts
export type M0cFill = { color?: string; mediaRef?: string };

// on M0cFile / M0pVariantEntry:
fill: Record<StableKey, M0cFill> | null;
```

`fill` is the canonical per-frame rectangle-fill sidecar. An entry must
carry at least one of `color` (CSS `#rrggbb` / `#rrggbbaa` hex) or
`mediaRef` (string asset reference — file path, asset id, or any
caller-defined shape). The normalizer drops empty objects; the parser
rejects entries that are not plain objects.

`serializeM0cFile` / `serializeM0pFile` accept an optional `fill` opt
and emit it sorted by key for deterministic output. `parseM0cFile` /
`parseM0pFile` round-trip it. Cross-format conversions
(`bundleM0cIntoPack`, `extractVariantAsM0c`, `upgradeM0ToM0c`) thread
the field through correctly — lossless for upgrades, the `M0` downgrade
path drops it as already lossy.

A new `validateFill` validator (and corresponding `FillIssue` types)
flags `ORPHANED_FILL` (stableKey not in the layout's parsed frame set)
and `INVALID_FILL_COLOR` (color not matching `#rrggbb` / `#rrggbbaa`).
Hooked into `validatePack` so pack-level validation now surfaces
fill issues per variant alongside label and region issues —
`PackVariantIssues` gains a `fillIssues: FillIssue[]` field.

#### 2. `M0Label` re-homed from `@m0saic/dsl`

Type definition moved from `@m0saic/dsl` → `@m0saic/dsl-file-formats`.
Shape unchanged (`{ text: string; color?: string }`); only the
ownership boundary moved. Every importer in the monorepo
(`@m0saic/template-utils`, `@m0saic/dictionary`,
`@m0saic/dsl-stdlib`, `@m0saic/templates`, `apps/mosaic/web`,
and this package's own internals) was re-pointed in the same
change set.

The semantic of `M0Label.color` also narrowed: it is now defined as
the optional **label chip UI tint** (badge background in the inspector
overlay), not the rectangle fill. The rect-fill role belongs to the
new `fill[k]` map. Old `.m0c` files that stuffed rect colors into
`labels[k].color` still parse cleanly — the value just stops driving
the rect overlay; authors who want the old behavior should migrate
those values into `fill[k].color`.

**Compatibility.**

- Breaking: **no** (for this package's file format).
- Old m0c / m0p files without the field parse cleanly — `fill: null`
  on the parsed object. Same null-stable convention `labels` /
  `derive` / `masks` use.
- New files without `fill` set produce `fill: null` in the JSON.
- Downstream literal-constructors of `M0cFile` / `M0pVariantEntry`
  in TypeScript code must add `fill: null` (3 sites in
  `apps/mosaic/web/src/App.tsx` updated alongside this PR; spread-
  based constructions are unaffected).
- Downstream literal-constructors of `PackVariantIssues` must add
  `fillIssues: []` (1 site in this package's `validatePack.test.ts`
  fixture-helper updated).
- The `M0Label` rehome is breaking on the `@m0saic/dsl` side (the
  export is gone) — that's covered by the separate entry
  `pending-releases/dsl/2026-06-10-remove-m0label-export.md`. From
  this package's perspective, the type is simply now defined locally
  and exported under the same name; consumers who imported it from
  `@m0saic/dsl` re-point the import string and pick up the
  byte-identical shape from here.

**Release notes.**

<!-- Pairs with @m0saic/dsl's M0Label removal entry
     (2026-06-10-remove-m0label-export.md) — the type lives here
     now and `dsl` no longer exports it. Migration recipe is
     identical to that entry's: re-point the import string,
     shape is byte-identical.

     Inspector UI hookup (rename "Label colors" toggle to "Fill",
     switch the per-frame color callback to read fill[k].color
     instead of labels[k].color) is Phase 2 and lands in
     apps/mosaic/web — does NOT ship in this package. Files
     written before the UI flip still render with the old (uniform-
     color) rect fill since the inspector hasn't switched its
     source yet. -->

### `.m0g` flavor — m0saic goldens ("mogging")

Adds the `.m0g` flavor — a **m0saic golden** ("mogging"): a tried-and-true, signed-off,
crystallized layout. It is a flavor of `.m0c` (same `M0cFile` shape, same parser), discriminated
by `format: "m0g"` and carrying an optional `gold` provenance block. By convention `.m0g` files
begin with a `#mogging` easter-egg comment line before the JSON body. **Scaffold only** — the
qualification *criteria* are undecided, so `M0cGold.criteria` is intentionally free-form for now.

**Compatibility.**

- Breaking: **no.** Ordinary `.m0c` output is byte-identical — no `gold` key and no comment prefix
  unless a `gold` block is passed. `parseM0cFile` strips leading `#` comment lines, a no-op for
  `.m0c` (which starts with `{`).
- New exports: `serializeM0gFile`, `MOGGING_HEADER`, type `M0cGold`.
- Note: `M0cFile.format` is now a 2-member union; downstream `switch`/assignment on `format` should
  account for `"m0g"`. (Cross-package type effects surface in the full merge-gate build.)

### `.m0p` pack-level `agent` annotations (serialize/parse wiring)

Wires the pack-level `agent` block through `serializeM0pFile` / `parseM0pFile`, mirroring `.m0c`.
`M0pFile.agent` already existed in the type ("same shape stashed on .m0c / .m0p"); it just wasn't
read/written. Now a `.m0p` pack can carry an agent ↔ human annotation (note / question /
canonical `response` / comments) — the sign-off surface for the side-by-side pack overview.

**Compatibility.**

- Breaking: **no.** Agent-free packs serialize byte-identically (no `agent` key).
- New: `serializeM0pFile({ … agent })`; `normalizeAgent` / `parseAgentOrNull` exports.
- Follow-up (not in this entry): **per-variant** agent (the m0p→m0c flatten already reads
  `entry.agent`; the serialize-input + variant parse aren't wired yet) and the web pack-overview UI
  to edit the agent block.

### `M0AgentResponse.src` + `M0AgentResponse.images` — render-provenance pointer and screenshot attachments

Two new OPTIONAL fields on `M0AgentResponse` (the human's canonical reply in the
agent ↔ human annotation block carried by `.m0c` / `.m0p` — and now `.mosaicx`):

- `src?: string` — provenance pointer to the rendered output the response
  judges, typically the time-stamped sibling render the desktop Run view just
  wrote (`candidate-005.20260612-084403.mp4`). A `.mosaicx` is a recipe whose
  pixels drift as template source evolves; `response.src` pins WHICH render the
  verdict was about.
- `srcMosaic?: string` — companion pointer to the fully RESOLVED `.mosaic`
  saved beside the render (same basename, the renderer's `saveMosaic`
  sidecar): the TRUE source of those exact pixels — pure geometry +
  primitives, frozen at render time.
- `images?: string[]` — base64 data-URI screenshot attachments
  (`data:image/png;base64,…`). The reviewer's "I rendered, saw something,
  screenshotted it" evidence, stored in the file itself for self-contained
  provenance. Rich at the cost of file size; all optional.

`serializeM0cFile` / `parseM0cFile` (and the `.m0p` path, which shares
`normalizeAgent` / `parseAgentOrNull`) round-trip both fields; `src` is
trimmed, `images` pass through VERBATIM (no whitespace collapsing inside
data-URIs). Canonical mirror updated in `@m0saic/momo` per `MIRRORED_TYPES.md`.

**Compatibility.**

- **Breaking:** no — purely additive optional fields. Old files parse
  unchanged; files carrying the new fields degrade gracefully in old readers
  (unknown JSON keys were already dropped by the narrowing parser).

### Agent annotation types re-exported from `@m0saic/momo-types` — mirror retired

`M0AgentMeta`, `M0AgentResponse`, `M0AgentComment`, and `mintAgentId` are no
longer declared locally — they re-export from `@m0saic/momo-types`, the
canonical, intentionally lightweight home of the agent layer over m0saic
(shapes + pure helpers; the heavier `@m0saic/momo` runtime stays its own
thing and re-exports for back-compat).

The published surface of this package is UNCHANGED — existing
`import { M0AgentMeta } from "@m0saic/dsl-file-formats"` consumers keep
working — but new consumers should depend on `@m0saic/momo-types` directly
(the desktop app now does).

**Compatibility.**

- **Breaking:** no — type-identical re-exports; runtime behavior unchanged.
- **Dependency note:** requires `@m0saic/momo-types` to be PUBLISHED — it
  ships in the same release cycle (see `pending-releases/momo-types/`).

### `editFileMeta` — lossless, format-agnostic metadata patcher

New export `editFileMeta(content, patch)`: parse → merge `meta` / `custom` / `agent` → reserialize,
**preserving every other field**. Format-agnostic — detects `.m0` / `.m0c` / `.m0g` / `.m0p` /
`.m0v` from the content and routes to the right parser/serializer. Merge semantics per patch field:
`undefined` keeps, `null` clears (`meta` / `agent`), an object shallow-merges (`custom` replaces
wholesale when either side isn't a plain object).

```ts
import { editFileMeta } from "@m0saic/dsl-file-formats";
const out = editFileMeta(m0cString, { meta: { title: "master" }, custom: { intent: "ship" } });
// background, labels, masks, fill, rankSets, m0 … all preserved; only meta/custom change.
```

**Compatibility.**

- Breaking: **no.** Pure addition; existing exports unchanged.
- Known limitation (inherited, not introduced): **per-variant `.m0p` `agent`** is not preserved —
  `SerializeM0pVariantInput` still has no `agent` field (same gap flagged in
  `2026-06-11-m0p-pack-agent.md`). `variantToInput` passes it defensively so it lands for free once
  that input is wired. Pack-**level** agent IS preserved.

### m0 validation + canonicalization at every API boundary

The official serialize/parse APIs now enforce a single m0 contract at the
boundary:

- **Invalid m0 cannot pass through.** Every `serialize*` and `parse*` entry
  point validates the layout string with `@m0saic/dsl`'s `validateM0String`
  and throws on failure, instead of silently round-tripping a broken layout.
- **Pretty (expanded) DSL is still accepted** as input — both canonical and
  pretty forms are valid.
- **Output is always canonical.** Serializers already canonicalized on emit;
  parsers now canonicalize on read too, so no `.m0` / `.m0c` / `.m0p` file —
  and no parsed in-memory record — ever carries pretty-form DSL out of these
  methods.

Previously `toCanonicalM0String` was the only gate: it normalizes whitespace
and aliases but does **not** reject invalid input, so a string like `2[1]`
(child-count mismatch) or `@@@` (illegal chars) serialized and parsed happily.

**Compatibility.**

- **Breaking (parse):** a file carrying invalid m0 now throws on parse instead
  of returning a record with the bad string. Audited against the full repo
  corpus (4,851 m0 strings across 4,839 files) — **0** are invalid, so no real
  file is affected.
- **Breaking (parse output):** parsed `.m0` is now canonical. Callers that
  compared the parsed string against a pretty/alias form (e.g. expecting `"F"`)
  will see canonical (`"1"`). 126 corpus files store pretty-form m0 today; they
  parse fine and simply surface canonical.
- **Breaking (serialize):** serializing invalid m0 now throws. Callers that
  build m0 by concatenation or accept free-typed DSL (e.g. the editor save
  path) should validate first (the exported gate, or `isValidM0String`) and
  surface the error rather than letting it escape.
- `serializeM0vFile` / `parseM0vFile` carry no m0 and are unchanged.

### M0cFile + M0pVariantEntry — per-frame `insets` field

`M0cFile` and `M0pVariantEntry` gain a top-level `insets` field carrying
per-frame **insets** keyed by `StableKey`:

```ts
export type M0cInset = { top: number; right: number; bottom: number; left: number };

// on M0cFile / M0pVariantEntry:
insets: Record<StableKey, M0cInset> | null;
```

Each value is the fraction (0..1) of the frame's own cell that is shaved off
each of the four edges — the render-time box a frame's source actually paints
into. It promotes the engine-only `MosaicSource.placement.inset` concept to a
first-class, stableKey-keyed, editor-visible sidecar, at full parity with the
existing `masks` / `fill` / `rankSets` fields.

`serializeM0cFile` / `serializeM0pFile` accept an optional `insets` opt and
emit it sorted by key (edges in canonical `top/right/bottom/left` order) for
deterministic output. `parseM0cFile` / `parseM0pFile` round-trip it.
Cross-format conversions (`bundleM0cIntoPack`, `extractVariantAsM0c`,
`upgradeM0ToM0c`) thread it through — lossless for upgrades, the `M0`
downgrade path drops it as already lossy.

A new `validateInsets` validator (and `InsetIssue` types) flags, at the
warning level:

- `ORPHANED_INSET` — stableKey not in the layout's parsed frame set.
- `INSET_OUT_OF_RANGE` — an edge < 0 or ≥ 1 (insets are cell fractions).
- `INSET_COLLAPSES_FRAME` — `top + bottom ≥ 1` or `left + right ≥ 1` (the
  paint box collapses on that axis).

All three are warnings only: the engine clamps at render time
(`applyInsetToRect` uses `Math.max(1, …)`), so nothing crashes. Hooked into
`validatePack` — `PackVariantIssues` gains an `insetIssues: InsetIssue[]`
field. Range/collapse checks run even without a parse cache (they don't need
structural context); orphan detection needs the parsed frame set.

**Compatibility.**

- Breaking: **no** (for this package's file format).
- Old m0c / m0p files without the field parse cleanly — `insets: null` on the
  parsed object. Same null-stable convention as `labels` / `masks` / `fill`.
- New files without `insets` set produce `insets: null` in the JSON.
- **Breaking for TypeScript literal-constructors:** `insets` is
  required-nullable on `M0cFile` / `M0pVariantEntry` (parity with `masks` /
  `fill`), so every full-literal constructor must add `insets: null`.
  Spread-based constructions are unaffected. In-package sites (`types.test.ts`,
  `validatePack.test.ts` fixture helper) updated here; downstream app sites
  (`apps/mosaic/web`) are updated in the Phase 2 app change. Literal
  constructors of `PackVariantIssues` must add `insetIssues: []`.

**Release notes.**

<!-- Pairs with the app-side promotion of insets to a first-class,
     editable .m0c/.m0p sidecar: Layout paints + edits the sidecar, Make →
     Layout converts derived (placement.inset) → sidecar once at send time,
     and the Compose assembly join writes insets back onto
     sources[i].placement.inset. Library-side this change is purely additive;
     those app flows land in apps/mosaic/web (monorepo-versioned, no
     pending-release). A public adapter (m0 + inset map → exact rects /
     refined full-precision m0) is deliberately deferred until a real caller
     appears. -->

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
