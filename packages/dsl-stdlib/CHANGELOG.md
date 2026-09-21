# Changelog

## 3.1.0 — 2026-09-21

### bakeM0cInsets + lowerM0cToM0 — bake a .m0c's insets into its m0; lower to .m0 without losing geometry

Two new builders close the gap between a `.m0c` and a plain `.m0`:

- `bakeM0cInsets(file, opts?)` — folds the file's per-frame `insets` sidecar into its `m0` with the
  engine's exact inset math (`Math.floor(f · cell)` per edge, `Math.max(1, …)` on size — the same
  rects `bakeInsets` and the app's `bakeDocumentInsets` produce), sets `insets` to `null`, and carries
  every other stableKey-keyed sidecar (labels, masks, fill, rank sets) across the rebuild by the
  rekey map, pruned to the leaves that still render. Returns the rebuilt `M0cFile`, the `rekey`
  pairs, the `liveKeys` and a `meta` block (`changed`, `frameCount`, `insetCount`,
  `orphanInsetKeys`, dsl lengths). No-op (m0 unchanged, `changed: false`) when there is nothing to
  fold; throws when insets are present but the file has no `size`.
- `lowerM0cToM0(file, opts?)` — the geometry-preserving downgrade: `bakeM0cInsets`, then
  `downgradeM0cToM0` from `@m0saic/dsl-file-formats`. What it still drops (labels, masks, fill,
  rank sets, the reference image) is exactly what plain `.m0` cannot carry.

**Compatibility.**

- Breaking: no. Additive exports; `bakeInsets` (paint-order array form) and `rebuildRects` unchanged.
- Resolution-baked like every absolute rebuild: the output m0 is exact at `file.size` and longer
  than the input.

**Release notes.**

Use `lowerM0cToM0` wherever a `.m0c` is turned into a `.m0` — `downgradeM0cToM0` alone drops the
inset geometry. `bakeM0cInsets` is the same step without the format change, for tools that keep the
`.m0c` wrapper.

## 3.0.0 — 2026-09-19

### Composition substrate I — pipe / compose / withInverse / withHistory / queryFrames

Lands the four Sprint 1 substrate primitives from the v2 implementation plan. Every later transform / query / diff / agent consumer rides on these:

- **SL-1 — Fluent `pipe()` + point-free `compose()`.** Replaces the `let s = m0; s = ...; s = ...;` pattern with a chain that hides the single-string invariant behind the type. Each method forwards to the matching unified transform; `.build()` terminates. Errors are wrapped with the step index + op name so failures point at the gesture, not the primitive. `compose(...)` builds named multi-step transforms; `pipe(m0).through(fn)` bridges the two surfaces.
- **SL-2 — `withInverse(transform)` + `withHistory(m0)`.** Snapshot-based undo: `withInverse` wraps any unified transform into one that returns `{ m0, inverse }` (closure over the prior string, no symbolic derivation). `withHistory` exposes the same fluent surface as `Pipe` but each step pushes onto an undo stack with `.undo()` / `.redo()` / `.canUndo()` / `.canRedo()` / `.size()`. `Pipe.buildWithHistory()` collapses a chain into a single undo entry — the editor's "one undo per gesture" pattern.
- **SL-4 — Predicate query API.** `findFrames` / `findFirstFrame` / `findStableKeys` / `countFrames` / `mapFrames` / `someFrame` / `everyFrame` walk the editor frame graph; `findRenderFrames` / `findLogicalFrames` swap the walk for callers that only care about rendered tiles or logical leaves. `queryFrames(m0)` returns a `FrameQuery` that parses once and caches across calls — the perf-aware variant for agent search loops and lint passes. Predicate signature is `(frame, ctx)` where `ctx` carries `stableKey`, `parentStableKey`, `depth`, `logicalIndex`.

**Compatibility.**

- Breaking: no.
- Existing imperative APIs (`split`, `addOverlay`, `setTileType`, etc.) unchanged. Pipe / history are additive sugar on top.
- `@m0saic/types` carries the new `Diagnostic` shape (separate landing), but `dsl-stdlib` doesn't consume it yet — Sprint 3 (CL-3a / CL-1 / CL-5) is where consumers attach.

**Release notes.**

First v2.0 substrate ship. SL-3 (multi-target transforms) is the next consumer — it can now be implemented as `splitMany(m0, findStableKeys(m0, pred), opts)` against `pipe`. CL-3a (`TransformScript` substrate) lands in Sprint 3 and consumes SL-1 + SL-2 directly.

### In-house QR + dictionary-entry sidecar generators

Three additive modules that turn dsl-stdlib into a self-contained "dictionary-entry forge" — given a URL or an SVG, you can now produce the full set of artifacts a dictionary entry needs (`m0saic.m0`, `masks.json`, `*_ranks.json`) without leaving stdlib.

- **`libraries/qr/`** — In-house QR-code generator. URL → validated `M0String` with optional centred safe-area carve. No runtime dependency on the `qrcode` npm package; the encoder is written from scratch (ISO 18004) and oracle-verified against snapshotted `qrcode` matrices.
- **`libraries/svg/generateMasks`** — Per-source mask manifest in the dictionary's `MosaicMaskSetFile` shape, with non-rect shapes carrying `localPath` (path translated to node-local coords) + `bounds`. Lifts the docs `tools/06-generate-masks.ts` logic.
- **`libraries/ranks/`** — Rank-set generators with three built-in modes (`diag` / `cascade` / `radial`), a `custom` mode that packages caller-authored ranks verbatim, and `editRankSet` for "start from a built-in and tweak specific indices" flows.

**Compatibility.**

- Breaking: **yes (small)**. `GridShape` now requires `geometry: { d: string }` + `style: ShapeStyle`. Existing callers of `inferGrid` already get them (threaded through from `ExtractedShape`). Callers that build `Grid`s manually need to provide the fields.
- Otherwise additive. Everything new is opt-in.

**Release notes.**

This entry pairs with the existing `2026-05-22-svg-to-m0-builders.md` for the same release (next stdlib minor bump). Both ship together; the changelog section is one continuous "new public surface" story.

The wizard pieces (Step 2.5 sidecar UI + Step 3 bundle export at `apps/mosaic/web/src/pages/SvgToMosaicPage.tsx`) are app-only, monorepo-versioned — no `pending-releases/` entry needed for those.

Future workstream — `brand/qr-animate/v2` internal swap: replace its current `buildBrandQrV1Svg + svgToM0` round-trip with a direct `qrToM0(url, { safeArea: { mode: "carve", size: { width: 272, height: 272 } } })` call. One-line internal change in `packages/templates`. Removes the `qrcode` runtime dep from the templates dep graph entirely. Out of scope for this release; lands as its own small PR.

### SVG → M0 builders — `svg/` module

Productizes the `packages/docs/svg-to-mosaic` CLI pipeline as a public, validated, pure-function module on `@m0saic/dsl-stdlib`. New top-level exports:

- **`svgToM0(svg, opts?)`** — one-shot SVG string → validated `M0String`.
- **`enumerateSvgToM0(svg, space?)`** — cartesian product over `{ driftPercent × driftMode × packing }`; returns `SvgToM0Variant[]` ordered ascending by `charLen`. Powers the new "SVG → Mosaic" wizard's candidate-grid UX.
- **`parseSvg(svg)` / `extractGeometry(paths)` / `inferGrid(shapes, viewBox, opts)` / `rectsToM0(grid, opts)`** — the four pipeline stages, individually exported so the wizard can render intermediate state (e.g. overlay the inferred grid on the raw SVG) and so callers can swap in custom geometry.

Two algorithms surface as first-class knobs:

- `driftMode: "gcd-snap"` (default) — directed divisor search; production default, ~6–78× DSL compression on real assets via per-axis GCD reduction.
- `driftMode: "cluster"` — bounded-width clustering; fallback when gcd-snap is infeasible at the requested budget, or when no viewBox is available.

Plus `packing: "one" | "multi"` — one rect per layer (debuggable) vs. greedy union-grid multi-rect packing (compresses scaffolding).

**Compatibility.**

- Breaking: no.
- New module is purely additive. Existing exports unchanged.
- The `cluster` algorithm matches `tools/03-infer-grid.ts` line-for-line. One stale golden (`m0saic-pattern_v2/03-grid.json`) predates a clustering tweak; the docs JSON wasn't regenerated. Hard golden parity holds on the other two assets, soft checks pass on the stale one. No regression in user-facing `rectsToM0` output (validated against all three saved `05-composed.m0` files).

**Release notes.**

Pairs with two consumers landing in the same window:

- `apps/mosaic/web/src/pages/SvgToMosaicPage.tsx` (new) — wizard surface. App-only, monorepo-versioned, no `pending-releases/` entry.
- `packages/templates/src/m0saic/brand/qr-animate/v2/` (new) — live-conversion QR template. Templates is monorepo-versioned, no `pending-releases/` entry.

Future workstream D (parked) — in-house QR generation directly in `@m0saic/dsl-stdlib` (`qrToM0(url, opts)`): structurally a perfect stdlib citizen (deterministic integer matrix, no IO, output is a rect set ready for `rectsToM0`). Park until A/B/C ship and stabilize.

### QR structural channels API, `pack` mode, `placeRects` builder, and `qrToM0c` serialization

The QR module gets three orthogonal additions plus a general-purpose builder:

1. **Structural channels.** `qrToM0` now accepts a `channels` opt that surfaces QR function patterns (eyes, alignment, timing, format info, version info, dark module, separators) as named overlay channels. Each enabled channel emits a single labeled rect per function-pattern instance AND suppresses the underlying cells from the base grid. Templates that want eye-as-unit treatment can splice the channel frames; other channels stay flat-cell.
2. **`pack` mode.** Opt-in engine-perf knob that collapses dark cells into the smallest set of overlay rects (rowwise greedy). Visual output identical; frame count drops 2–3× on a typical QR. The data channel's frames carry `qr-pack-{i}` labels.
3. **`qrToM0c` serialization.** New companion to `qrToM0` that returns a `.m0c` file string with every channel frame labeled per the stable-key catalog. Drop into the Layout editor for inspection.
4. **`placeRects` builder.** Standalone stdlib export — takes N axis-aligned rects + a root canvas, packs them onto as few overlay layers as possible (one layer if non-overlapping, more via greedy first-fit otherwise) and emits the composed m0. Reusable by any caller doing rect packing (SVG→m0, future generators). The `qrToM0` channels API and pack mode are both built on top of it.

All four are **strictly additive**. `qrToM0(url)` with no new opts produces a byte-identical m0 to today.

**Compatibility.**

- **Breaking:** no.
- `qrToM0(url)` with no new opts → byte-identical m0 to pre-change. Verified via regression test (`qrToM0.test.ts`).
- `qrToM0Result` is additive — new fields appear but old field access continues to work.
- New runtime dep on `@m0saic/dsl-file-formats` is the only structural change; consumers that don't import `qrToM0c` don't pay for it (tree-shake-friendly).

**Release notes.**

- Pairs with template-package changes (`template-utils` adds `makeQrEyeChildDoc`; `templates` adds `brand/qr-rounded/v1`; `dictionary`'s `qrCodeGenerator` exposes the new knobs in its UI). Those packages version with the monorepo and don't ship via npm.
- The dictionary brand/qr entry's pre-baked `.m0c` is unchanged — regenerating it with channels enabled is a separate manual step using `qrToM0c` directly.

### Bitmap → MO library — `bitmap/` module

Productizes the `packages/docs/png-to-bitmap-mosaic` CLI tool chain as a public, validated, pure-function module on `@m0saic/dsl-stdlib`. New top-level exports:

- **`classifyPixels(rgba, w, h, opts?)`** — RGBA byte buffer → `BinaryGrid`. Two modes: `luminance` (BT.601 threshold + on-mode polarity) and `nearest` (RGB distance to ON/OFF reference colors). Alpha-gated. Accepts both `Uint8ClampedArray` (browser canvas) and `Uint8Array` (pngjs / Node Buffer).
- **`despeckleGrid(grid)`** — order-independent single-pass speckle removal (snapshot-based; returns a new grid + flip count).
- **`labelAreas(grid)`** — 8-connected component labeling. Returns a `BitmapAreaMap` with per-area bbox + pixel count and an `id`-per-cell `map`.
- **`binaryGridToM0(grid)`** — emits the canonical `H[W(c,c,…),W(…),…]` bitmap MO string (one cell per pixel, `1` ON / `-` OFF). Validated through `toM0String`.
- **`binaryGridToVisualDsl(grid)` / `binaryGridToVisualArt(grid, opts?)` / `areaMapToVisualLabels(map, opts?)`** — the three visual sidecar emitters that power the `packages/docs/png-to-bitmap-mosaic/examples/m33` bundle's `m33-visual.txt`, `m33-visual_art.txt`, and `m33-visual_areas.txt`. Operate directly on in-memory `BinaryGrid` / `BitmapAreaMap` (no DSL re-parse).

Plus exported types: `BinaryGrid`, `RgbColor`, `BitmapClassifyOptions`, `BitmapArea`, `BitmapAreaMap`, `BitmapMeta`, `VisualGlyphs`.

**Compatibility.**

- Breaking: **no**. New exports only.
- The CLI tool migration is internal — the CLI still produces the same `.m0` / `_areas.json` / `_meta.json` / `-binary.png` / `-visual*.txt` shapes. Regression-verified against `examples/m33/`: all seven artifacts (including the binary PNG) regenerate **byte-identical**. The DSL body of `examples/4x4-test.m0` is also byte-identical; its `-visual.txt` sidecar updates to the modern `H[…]`-wrapped format (the committed 4x4 visual.txt fixture predates a format change the current CLI already emits — it would have rotated on next re-run regardless).

**Release notes.**

<!-- The wizard work in apps/mosaic that consumes this is being landed
     alongside. The wizard always exposes the bitmap branch (via a
     "Use bitmap mode →" button on the Drop step that's promoted to a CTA
     when the SVG resolves to a single rectangle), so this library ships
     in lockstep with the wizard surface. -->

### enumerateSvgToM0 — collapse byte-identical m0 outputs

`enumerateSvgToM0` now runs a final dedup pass that collapses variants emitting byte-identical `m0` strings to a single entry. Tie-break: prefer the most lossless (lowest `driftPercent`); on exact ties, first-seen wins (deterministic via the enumeration order `driftPercent → driftMode → packing`).

**Compatibility.**

- Breaking: **technically yes**, in that callers that previously got N duplicate variants now get fewer. But the *outputs* (the m0 strings) are identical — any consumer iterating variants and acting on `String(v.m0)` is unaffected. Pure waste reduction.
- Affected callers: `apps/mosaic/web`'s SVG → Mosaic wizard Browse step (the original motivator); any other consumer that displays variant lists to users.

**Release notes.**

<!-- Pairs with the apps/mosaic/web SVG → Mosaic wizard Browse step's variant
     carousel: before this change, dropping a single-rect SVG produced 4
     duplicate carousel entries. The carousel now shows the unique outputs. -->

### generateMasks `toLocalPath` — support relative SVG commands

`generateMasks` now handles SVG paths that mix absolute and relative commands. Previously it threw `unsupported SVG path command "h"` (or `c`, `l`, `v`, `s`, `m`, `a`) on any path containing lowercase commands — silently disabling mask generation for any SVG exported from common design tools (Adobe Illustrator, Sketch, Figma) that emit mixed-case paths.

**Compatibility.**

- Breaking: **no**. `toLocalPath` accepts a strict superset of its previous input; outputs for previously-supported (absolute-only) paths are byte-identical.
- Behavioral fix: paths with relative commands no longer throw. Downstream `generateMasks` callers that were getting silently-empty mask sets (or that were already wrapping in try/catch) will now see populated `MosaicMaskEntry` values.

**Release notes.**

<!-- Pairs with the `apps/mosaic/web` SVG → Mosaic wizard "Use rect + mask →"
     flow that was added alongside the bitmap-mode branch. The dsl-stdlib fix
     can ship independently; the wizard now correctly displays the masked
     silhouette in its Sidecars rank-preview panel for any SVG with curves. -->

### Drop `@m0saic/types` dep — mirror the three used types locally

`@m0saic/dsl-stdlib` no longer depends on `@m0saic/types`. The three types it consumed (`MosaicMaskEntry`, `MosaicMaskSetFile`, `MosaicRankSetFile`) are now mirrored locally in `src/mirroredTypes.ts` with structurally identical shapes, and re-exported from the package's top-level barrel.

**Compatibility.**

- Breaking: **structurally no, nominally maybe**.
- Code paths returning `MosaicMaskSetFile` / `MosaicRankSetFile` from `dsl-stdlib` now return the **local mirror** type, not the `@m0saic/types` type. TypeScript treats these as **structurally identical** — data flows freely between functions typed against either version.
- Consumers that import the type from `@m0saic/types` continue to work without code change (structural compat).
- Consumers that import the type from `@m0saic/dsl-stdlib`'s re-export get the local version — also fine.
- Consumers that import the *same* type name from BOTH packages get a nominal name collision (rare; flagged in `MIRRORED_TYPES.md` with the standard `import as` workaround).

**Release notes.**

<!-- Pairs with the new MIRRORED_TYPES.md at this package's root, plus the
     sibling doc in @m0saic/dsl-file-formats. PACKAGES.md describes the
     overall mirror pattern in the prose section so future contributors
     know the rule without having to discover both per-package docs. -->

### `generateMasksByStableKey` — leaf-stableKey projection of a mask set

New public export `generateMasksByStableKey(grid, m0, maskSet, canvasW, canvasH)` that projects a `MosaicMaskSetFile` (indexed by canonical source order, with `bounds` set to the structural OWNER) into `Record<stableKey, MosaicMaskEntry | null>` keyed by the LEAF frame's real stableKey.

Sister projection to the existing `generateMasks`. Same underlying matching, two consumption shapes:

| Consumer | Function | Output shape |
|---|---|---|
| Dictionary `masks.json` on disk | `generateMasks` | `{ masks: (Entry\|null)[] }` (positional array, owner bounds) |
| `.m0c` `masks` field / Layout editor handoff | `generateMasksByStableKey` (new) | `Record<stableKey, Entry \| null>` (leaf-keyed) |

**Compatibility.**

- Breaking: **no**. Pure addition. `generateMasks` is unchanged.
- The return type uses the locally-mirrored `MosaicMaskEntry` (see `MIRRORED_TYPES.md`), which is structurally identical to `M0cMaskEntry` from `@m0saic/dsl-file-formats` — consumers wanting the latter shape can assign directly without a cast.

**Release notes.**

<!-- Net change vs. the previous version of the wizard handoff: the matching
     logic moves from `apps/mosaic/web/src/pages/svgToMosaic/buildMasksByStableKey.ts`
     down into `@m0saic/dsl-stdlib`. The wizard now imports a single named
     export and the helper has one home. Pairs with the `.m0c` `masks` field
     work in `@m0saic/dsl-file-formats` (separate pending entry there). -->

### Vendor the `svg-path-bounds` chain (6 packages → `src/vendor/`)

`@m0saic/dsl-stdlib` no longer depends on `svg-path-bounds` (or its 4 transitive deps, or `svg-arc-to-cubic-bezier`). The full chain is vendored under `src/vendor/`, with one subdirectory per package, full attribution headers (author, source URL, version, copy date, MIT notice pointing at the shared `LICENSE_MIT.md`).

`extractGeometry` now imports `svgPathBounds` from `../../vendor/svg-path-bounds` instead of the npm package. The ambient `svg-path-bounds.d.ts` shim is deleted.

**Compatibility.**

- Breaking: **no**. The exported API surface of `dsl-stdlib` is unchanged. `extractGeometry`'s return shape is unchanged. Bounds computed by the vendored chain are byte-identical to the npm chain (all 1048 existing tests pass — including the SVG → MO golden-output cases that would catch any bounds drift).
- The vendored types (`PathSegment`, `CubicBezier`, `ArcToBezierArgs`) are exported from each vendor subdir for any downstream consumer that wants them, but are not re-exported from the package root. They're substrate, not public API.

**Release notes.**

<!-- Pairs with the new src/vendor/ folder and the MIRRORED_TYPES.md doc.
     PACKAGES.md describes the vendoring pattern in the prose section. -->

### `getLayerCount` — fast overlay-layer count for an m0 string

New `getLayerCount(m0: string): number | null` query helper. Returns
the total overlay-layer count for a valid DSL — the deepest `{…}`
nesting depth plus 1 for the base layer — or `null` when the input
fails validation. Matches both the Layout editor's "Layer all / N"
navigator convention and the `number | null` shape of `@m0saic/dsl`'s
scan-based counters (`getFrameCount`, `getPassthroughCount`).

**Compatibility.**

- **Breaking:** no. Purely additive.
- Pairs with `getComplexityMetricsFast` from `@m0saic/dsl` without
  overlapping its fields.

### QR channels become transparent logical anchors + `placeRects` / queries cleanup

Two threads bundled into one entry because they landed together and
share verification:

1. `qrToM0`'s structural channels API (`channels: { eyes: true, … }`)
   now emits **transparent logical-owner anchors** — `-{-}`. The outer
   `-` carries the channel's stableKey + label + mask target as a
   structural anchor; the inner `-` paints nothing. The base layer is
   left intact, so the canonical QR keeps scanning regardless of which
   channels are on.
2. Supporting primitives matured: `FrameQuery.within(boundsOrKey)`
   chainable scope-narrowing landed, `placeRects` learned to handle
   compound claimants and pure-light layers correctly, and
   `replaceNodeByStableId` is now exported from the transforms barrel.

**Compatibility.**

- **Behaviour change**: m0 token structure for channel regions. Anyone
  parsing the raw m0 output and depending on finding `F` at channel
  positions will see `-{-}` instead. The in-repo brand QR templates
  use `channelByRole.X.frames[i].stableKey`, which is the supported
  path and unaffected.
- **Behaviour change**: render-frame count with `channels: { eyes }` on
  now equals channels-off (channels add zero render frames).
- **Behaviour change**: `placeRects` may emit more layers in pathological
  compound-claimant cases. The caller's consumption — `result.m0`
  composed across layers, `result.layers` per-layer breakdown — is
  unchanged shape.
- **Additive**: `quietZone` in `QrChannel` union; `FrameQuery.within`;
  `containedIn`; `replaceNodeByStableId` re-export.
- **Non-breaking**: `channelByRole`, `QrFramePtr`, `safeAreaStableKey`,
  `safeAreaBounds`, `pack`-mode behaviour.

### QR: rename `url` → `text` and add structured-payload builders

QR was always arbitrary-data capable under the hood — `buildBitStream` auto-selects numeric / alphanumeric / byte mode for any input string — but the public surface was named `url`, which told a misleading story.

This change:

1. **Renames the first parameter `url` → `text`** on `qrToM0`, `qrToMatrix`, `qrToRects`, and `qrToM0c`. Positional, no runtime change. TS tooltips + JSDoc now reflect what the encoder has always done.
2. **Adds canonical structured-payload builders** in a new `qrPayloads.ts` module: `qrPayloadWifi`, `qrPayloadVCard`, `qrPayloadMailto`, `qrPayloadSms`, `qrPayloadTel`, `qrPayloadGeo`. Pure string builders — they emit the de-facto-standard text for one encoding convention; callers feed the result into `qrToM0(text)` / `qrToRenderable({ text })` etc.

Kanji mode remains intentionally out of scope.

**Compatibility.**

- **Breaking:** no.
- Parameter renames are positional-only; existing JS / TS call sites compile and run identically. IDE tooltips and editor autocomplete now show `text` instead of `url`.
- All new `qrPayload*` exports are strictly additive.

### Barcode → MO library — `barcode/` module

Adds a 1D barcode encoder + MO emission module that mirrors the QR
convention. New top-level exports:

- **`barcodeToBars(text, opts?)`** — text → `BarcodeBars`. Dispatches by
  format; returns the full bar pattern (variable-width dark/light bars
  including any quiet zone) plus per-format HRI frame metadata.
- **`barcodeToRects(text, opts?)`** — text → array of dark-only rects in
  module coordinates (one rect per dark bar, variable widths).
- **`barcodeToM0(text, opts?)`** — text → validated `M0String` with
  optional structural-overlay channels (`quietZoneLeft`, `quietZoneRight`,
  `startGuard`, `stopGuard`) AND a human-readable interpretation (HRI)
  carve channel. Channels emit `-{-}` logical-owner anchors per the QR
  convention; HRI carve emits a labeled splice-point F per HRI frame
  (1 for Code 128; 3 for EAN-13 — 1-6-6 grouping; 4 for UPC-A — 1-5-5-1
  grouping). Templates splice text sources into the HRI Fs via
  `replaceNodeByStableId`.
- **`barcodeToM0c(text, opts?)`** — thin wrapper that serializes the
  `barcodeToM0` result to a labeled `.m0c` JSON envelope for the editor's
  drag-into-Layout inspection.
- **`code128Encode(text, opts?)`** — direct access to the Code 128
  encoder (auto-picks Code Set C for even-length digits, Code Set B
  otherwise; mod-103 checksum).
- **`ean13Encode(text)`** — 13-digit EAN encoder (12-digit input
  auto-appends check digit; 13-digit input verifies it).
- **`upcaEncode(text)`** — 12-digit UPC-A encoder (delegates bar layout
  to `ean13Encode` with a prepended `"0"`).
- **`computeEan13CheckDigit(twelve)`** / **`verifyEan13CheckDigit(thirteen)`**
  — shared EAN/UPC mod-10 helpers.
- **`regionsForChannel(channel, ctx)`** / **`STRUCTURAL_CHANNEL_ORDER`** —
  per-channel region resolvers for callers that want their own m0
  composition path.

Plus exported types: `BarcodeFormat`, `BarcodeBar`, `BarcodeBars`,
`BarcodeCellRect`, `BarcodeChannel`, `BarcodeChannelConfig`,
`BarcodeChannelOutput`, `BarcodeFramePtr`, `BarcodeHriFrame`,
`HumanReadableMode`, `HumanReadableSpec`, `HriBarsSpec`,
`BarcodeToM0Options`, `BarcodeToM0Result`, `BarcodeToM0cOptions`,
`BarcodeToM0cResult`, `Code128Encoded`, `Code128Set`, `Ean13Encoded`,
`UpcaEncoded`.

**Compatibility.**

- **Breaking:** no — purely additive. No existing exports renamed or
  removed.
- The `libraries/` barrel adds a new sub-namespace (`./barcode`); no
  identifier collisions with `qr/` / `svg/` / `ranks/` / `bitmap/`.

**Release notes.**

- Commit also touches `@m0saic/template-utils` (new
  `barcodeToRenderable.ts` bridge), `@m0saic/dictionary` (new
  `barcodeGenerator.ts` + descriptor entry), `@m0saic/templates`
  (new `brand/barcode/v1/` template), and the editor app
  (`DictionaryPanel.tsx`). Only the `packages/dsl-stdlib/` files above
  ship in this release; the rest version with the monorepo.
- Algorithmic reference for the port is JsBarcode (MIT, Johan Lindell);
  attribution in each module's top-of-file header. JsBarcode itself is
  NOT vendored and NOT carried as a dependency at any tier.

### StableKey-aware rank builders — `generateStableKeyRankSet` + friends

Three new builders return the StableKey-keyed `MosaicRankSet` shape that `M0cFile.rankSets` / `M0pVariantEntry.rankSets` accept inline (see the `dsl-file-formats` 2026-06-05 entry for the file-format side):

```ts
import {
  generateStableKeyRankSet,
  customStableKeyRankSet,
  editStableKeyRankSet,
  type MosaicRankSet,
  type MosaicRankSetEntry,
} from "@m0saic/dsl-stdlib";

// Algorithmic, mirrors generateRankSet but returns Record<stableKey, number>.
const set = generateStableKeyRankSet(frames, "diag");

// Caller-authored from a stableKey map.
const custom = customStableKeyRankSet({ "k/0": 0, "k/1": 0.5 }, "custom");

// Edit an existing set; new edit keys must already exist in base.ranks.
const tweaked = editStableKeyRankSet(set, { "k/0": 0.42 });
```

The positional `generateRankSet` / `customRankSet` / `editRankSet` builders are **unchanged** and continue to return the legacy `MosaicRankSetFile` (`{ mode?: string; ranks: number[] }`). Both surfaces coexist; choose by output shape.

`RankFrame` gains an optional `stableKey?: StableKey` field. The positional builders ignore it; the new StableKey-keyed builders **require** it at runtime and throw a descriptive error when absent (or when two frames share a stableKey — the output Record would silently collapse the duplicate). `rankFramesFromM0` always populates it.

Two new types `MosaicRankSet` (`{ mode?: string; ranks: Record<string /* stableKey */, MosaicRankSetEntry | null> }`) and `MosaicRankSetEntry` (`number`) join the existing structural mirrors of `@m0saic/types` in `mirroredTypes.ts`. `MosaicRankSetFile` stays alongside them.

**Compatibility.**

- Breaking: **no**.
- `RankFrame.stableKey` is optional. Existing call sites that build `RankFrame[]` literals continue to compile and run unchanged when they only use the positional builders.
- The positional builders (`generateRankSet` / `customRankSet` / `editRankSet`) and their `MosaicRankSetFile` return shape are untouched.
- The mirror addition to `mirroredTypes.ts` is purely additive — no existing exports renamed or removed.

**Release notes.**

<!-- Companion follow-up sprints (not landing in this PR):
     - @m0saic/dictionary: migrate brand entries from sidecar *_ranks.json to inline m0c rankSets using these new builders.
     - @m0saic/templates: brand/logo/v2 + v3 + qr-animate/v1 swap from registry.getRankSet().ranks[i] (positional) to stableKey-keyed lookup against MosaicRankSet.
     - SVG → Mosaic wizard: switch its sidecar-emission path to write inline rankSets onto the exported .m0c instead of separate *_ranks.json files (separate sprint).
-->

### `clipLocalPathToBounds` + opt-in clipping on `generateMasks`

New helper `clipLocalPathToBounds(localPath, width, height): string` performs Sutherland-Hodgman polygon clipping of an SVG `localPath` against the rectangle `[0, 0, width, height]` in local coordinates. `generateMasks` gains an opt-in `clipToBounds?: boolean` option that runs every produced `localPath` through the new helper before returning.

```ts
import { clipLocalPathToBounds, generateMasks } from "@m0saic/dsl-stdlib";

// Standalone — useful when sourcing localPaths from somewhere other than
// generateMasks (the SVG → Mosaic wizard's "Send to Layout" handoff does this).
const safe = clipLocalPathToBounds("M 0 0 L 100 0 L 100 100 Z", 80, 80);
// → "M 0 0 L 80 0 L 80 80 Z" (vertex-set; rotation-equivalent)

// Inline — flip the opt on at the call site you want clipped.
generateMasks(grid, m0, { canvasW, canvasH, clipToBounds: true });
```

Default is **off** to preserve byte-for-byte parity with the legacy docs `06-generate-masks.ts` pipeline that the dictionary build's parity goldens lock against. The SVG → Mosaic wizard sets `clipToBounds: true` at all four of its call sites (Send-to-Layout preview, browse-step mini previews, Sidecars-step preview, and bundle export).

**Compatibility.**

- Breaking: **no**.
- Existing callers of `generateMasks` see identical output (clipping defaults off).
- The dictionary build's parity goldens against `docs/svg-to-mosaic/examples/.../06-masks.json` still pass byte-for-byte.
- `clipLocalPathToBounds` is a new export — purely additive on the public surface.

### `addOverlayLayer` — nest a new overlay at the deepest root-level position

New top-level export `addOverlayLayer(m0, layerContent, opts?)` that adds a new overlay layer at the **deepest root-level position** of an m0 string. Mirrors `placeRects`' multi-layer composition convention (`L0{L1{L2{...{Ln{new}}}}}`), so multiple calls produce a correctly-nested chain.

```ts
addOverlayLayer("1", "F")              // → "1{1}"
addOverlayLayer("1{1}", "F")           // → "1{1{1}}"
addOverlayLayer("2(1,1){3[1,1,1]}", "F") // → "2(1,1){3[1,1,1]{1}}"
addOverlayLayer("2[1{1},1]", "F")      // → "2[1{1},1]{1}" — inner-cell overlays are NOT confused for root-level
```

**Compatibility.**

- **Breaking:** no — purely additive.
- No existing function signatures changed; the curated public surface gains one new export.

**Release notes.**

- The editor (`apps/mosaic/web/src/components/viewframe/ViewFrame.tsx`) is the immediate consumer — replaces a textual `prev.slice(0,-1) + "{" + new + "}}"` workaround with this transform.
- No dependency bumps required.

### `placeRect` accepts exact x/y; `placeRects` exposed publicly

Two additive changes to the rect-placement builders:

- **`placeRect`** gains two optional fields on `PlaceRectOptions` — `x?: number` and `y?: number`. When present, they specify the exact top-left of the inner rect in pixels and take precedence over `hAlign` / `vAlign` on that axis. Either axis may use exact or alignment independently (e.g. `{ x: 50 }` pins the left edge while `vAlign` still picks the vertical position).
- **`placeRects`** (plural) — already implemented and used internally by the QR + barcode libraries — is now re-exported from the top-level package surface (`packages/dsl-stdlib/src/builders/index.ts`) alongside its four public types: `PlaceRectsRect`, `PlaceRectsOptions`, `PlaceRectsLayer`, `PlaceRectsResult`. No code change to the builder itself.

**Compatibility.**

- **Breaking:** no — every existing caller leaves `x` and `y` undefined and gets identical output (verified by the parity test plus the pre-existing 8 alignment-mode tests still passing unchanged).
- **`placeRects` re-export** is purely additive surface; no rename or path shuffle.

**Release notes.**

- The Draw-mode wiring in the editor app (`apps/mosaic/web/src/components/viewframe/ViewFrame.tsx` + `DrawOverlay.tsx` + `useDrawHotkeys.ts`) consumes both new exports, but those files ship with the monorepo — only the `packages/dsl-stdlib/` files above publish in this release.
- No dependency bumps required.

### `toM0FileText` — wrap an m0 string into a valid `.m0` file (with agent annotations)

New constructor `toM0FileText(m0, opts?)` that validates a raw m0 layout string and returns the text content of a parseable `.m0` file. Companion type `M0AgentMeta` adds an optional `agent: { note, question, regions, context }` block that lands in the header under a namespaced `# m0agent:*` prefix.

Closes the agent ↔ human iteration loop for layout candidates: an agent generates a layout, calls `toM0FileText`, and produces an artifact that's (a) validated by the dsl on the way out, (b) drag-droppable into the Layout app, and (c) carries both human-readable hints (`note`, `question`) and machine-parseable derivation context (`regions`, `context`) for the next agent in the chain.

### `libraries/mask-shapes` — primitive SVG mask shapes

New helpers for authoring the common `M0cFile.masks` entries without re-deriving SVG arc syntax. Each returns `M0cMaskEntry` (imported directly from `@m0saic/dsl-file-formats` — these packages are paired in practice, so the dep is intentional).

- **`circleMask(width, height?)`** — circle when `width === height`, axis-aligned ellipse otherwise. Two-arc path.
- **`roundedRectMask(width, height, radius)`** — rounded rectangle; radius auto-clamps to `min(w,h)/2` so a too-large radius becomes a pill.
- **`pillMask(width, height)`** — convenience over `roundedRectMask` with corner radius = `min(w,h)/2`.

Use case: agents (or any caller) prototyping layouts in `.m0c` files can pass the result straight to `serializeM0cFile({ masks: { [stableKey]: circleMask(40) } })` to give an avatar rect a circular silhouette without writing SVG path data by hand. Exposed via the top-level `@m0saic/dsl-stdlib` barrel.

Authoring origin: dogfooded during the sandbox post-mortem template work — the agent kept needing a circle mask for chat-avatar rects.

**Minor bump** — purely additive (three new exports under a new `mask-shapes/` library module). No existing API changed.

### `compactDocument` + `removePureNullLayers` — export a heavy doc to its compact form

Two new top-level exports that close the exploration loop: layout exploration is
layer-additive by design (draw commits, edit-mode re-lands, provenance leftovers),
and these reduce the result without losing anything that paints.

- `removePureNullLayers(m0, opts?)` — drops every ROOT-CHAIN overlay layer whose
  expression contains no rendered tile (only `-` / `0`), re-nesting survivors in
  order. A paint-less BASE is dropped too (the first painting layer promotes).
  Inner-cell overlays are part of their layer's expression and are not walked.

- `compactDocument({ m0, width, height, removeNullLayers?, pack?, gcdDriftPercent? })`
  — the orchestrator:
  - **pack** (default true): collects every rendered rect (across all layers,
    inner-cell overlay content included) in paint order and repacks onto as few
    layers as possible. Packing is IDENTITY-PRESERVING — conflict = overlap OR
    y-subdivision, so a rect is never fragmented across grid bands and per-frame
    sidecar metadata (masks especially) keeps describing one rect. Overlapping
    rects keep relative paint order (greedy first-fit).
  - **gcdDriftPercent** (default 0 = off): accepts a bounded per-edge drift if
    snapping all rect edges to a coarser common grid achieves GCD collapse —
    the same directed divisor search as the SVG → m0 pipeline (`inferGrid`,
    reused directly). Snapped edges coincide → y-subdivision disappears →
    packing collapses further. Achieved pitch + actual max drift are reported
    for "minor geometry change" review.
  - **removeNullLayers** (default true): string-level chain cleanup when pack
    is off; subsumed by the rebuild otherwise.

  Returns `{ m0, rekey, liveKeys, meta }`: `rekey` is old→new stableKey (editor
  `r/...` key space, joined to paint order via `logicalIndex`) for every rendered
  leaf whose key changed — hosts migrate labels/masks/fills/ranks along it;
  `liveKeys` is the complete new key set for pruning dead sidecar entries; `meta`
  reports layers/DSL-length before+after, frame count, achieved GCD, max drift.

**Compatibility.**

- **Breaking:** no — purely additive.

### `placeRects` never fragments — spills vertically-sliced rects to new layers

`placeRects` now honors its contract — *place all the rects as optimally as
possible, one rect = exactly one rendered frame* — for **every** claimant, not
just compound ones. Any rect whose Y-span would be sliced by another rect's
edge on the same layer now spills to a fresh layer instead of being silently
fragmented into one frame per band.

**Compatibility.**

- **Breaking:** no signature or export change. `placeRects(opts)` shape is
  identical. Output m0 differs only for inputs that previously fragmented, and
  only in layer/frame structure, never in rendered pixels.

### `placeRects` rects gain an `importance` field (paint priority)

`PlaceRectsRect` gains an optional `importance?: number` (default `0`). A rect with
higher `importance` is GUARANTEED to paint above one with lower importance — the
most important rects always end up on top — regardless of how the greedy packer
would otherwise have assigned layers.

It is a *relative priority*, not a fixed layer index: rects of EQUAL importance
have no defined order relative to each other (two equal-importance rects that
can't share a layer are auto-split across layers, but both still sit below any
higher-importance rect).

Mechanically, `placeRects` now buckets rects by `importance` ascending, runs the
existing greedy first-fit packing WITHIN each bucket (so same-importance rects
still collapse onto as few layers as possible), and emits the buckets base→top.

**Compatibility.**

- **Breaking:** no.
- Omitting `importance` everywhere → byte-identical m0 + identical `layers` to
  pre-change (verified by a regression test: no-`importance` === all-`importance:0`).
- Existing callers (QR channels/pack, SVG→m0, `placeRect`) are unaffected — they
  don't set `importance`, so they fall into the single default-0 bucket.

**Release notes.**

- First consumer is `@m0saic/charts/donut/v3` (monorepo-versioned, ships with the
  app — not via npm). It now passes `importance` on its label/text rects instead
  of hand-chaining two `placeRects` groups.

### Layout-quality toolkit — `quantizationSpread`, `evaluateM0`, `compareM0`

A small toolkit for *measuring* and *comparing* m0 layouts, so a caller that can
generate an m0 several ways can pick the best for its task instead of guessing.

**Spread (new query pair):**
- `quantizationSpread(m0, width, height, opts?)` → `{ maxSpreadPx, worstLogicalIndex }`
  — the largest absolute deviation, in pixels, of any frame's edge position or
  size from where infinitely-precise math would place it at this canvas. `0` ⇒
  the layout renders exactly (the weight basis divides the axis); larger ⇒ more
  visible quantization spread.
- `isQuantizationImperceptible(m0, width, height, maxPx = 1, opts?)` → `boolean`
  — convenience: is the worst drift within `maxPx`?

It needs nothing but the m0 string and the target canvas. "Ideal" geometry is
obtained by re-parsing the same string at a (capped) high-resolution multiple and
dividing back down — parse cost is proportional to cell count, not resolution, so
the reference parse is cheap.

**Evaluate / compare (new):**
- `evaluateM0(m0, { width, height })` → `M0Evaluation` — bundles the deterministic
  layout stats: `dslLength`, `feasibility` (`computeFeasibility`) + `feasible`,
  `precision` (`getComplexityMetrics`) + `meetsPrecision`, `recommendedMin`,
  `frameCount` / `passthroughCount` / `nullCount` / `groupCount` / `nodeCount`, and
  `maxSpreadPx` at that canvas.
  - **Feasibility and precision are two distinct floors that can cross both ways.**
    `feasibility` = "won't error" (smallest canvas with no 0-size *frame*).
    `precision` = "will look right" (smallest canvas where every split cell, incl.
    passthrough/donation cells, is ≥1px). Neither implies the other — measured
    across the sandbox corpus, 25/47 layouts have precision > feasibility (e.g. a
    showcase layout renders at 879×562 but only looks right at 1920×1080), while
    deeply-nested layouts have feasibility > precision. `meetsPrecision` =
    does this canvas clear precision on both axes; `recommendedMin` = per-axis
    `max(feasibility, precision)` = the smallest canvas that both renders AND looks
    right (what you want in practice).
- `compareM0(a, b, canvas | canvas[])` → `M0Comparison` — evaluates both strings
  across one or more canvases and returns a per-metric comparison with the usual
  "better when lower/higher/context" direction, a `comparable` flag (same
  frameCount ⇒ apples-to-apples), worst-case spread per side, and a soft
  `directionalWins` hint. It does NOT impose a single winner — `context` metrics
  (spread, frameCount) are left to the caller — EXCEPT one unambiguous case:
  `geometricallyEqual` (frame-equal via dsl's `areM0StringsFrameEqual` — both render
  identical ordered frames) sets `recommendation` to the shorter string, since the
  two are interchangeable.

Both `evaluateM0` and `compareM0` **reject non-m0 input** — they validate with
`validateM0String` up front and throw, so a malformed string can't silently produce
garbage stats.

These reuse the existing `@m0saic/dsl` primitives (`computeFeasibility`,
`getComplexityMetrics`, `areM0StringsFrameEqual`, `validateM0String`) plus
`quantizationSpread` — one place to ask "how good is this layout, and which of these
two is better." No geometry logic is re-implemented.

### `compactDocument` — z-safe packing, lossless split tidy, sidecar permutation + drift

New options + result fields on `compactDocument` (the editor's Compact closeout),
plus a **growth-guarded pack**. All additive; defaults preserve prior behavior
except that packing now never makes a layout heavier.

- **Growth-guarded packing (behavior change).** The pack/GCD rebuild is now
  accepted only when it shrinks the DSL below the lossless "just simplify"
  baseline (null-removal + `reduceSplits`). Flat band decomposition can BALLOON
  an already-tight hand-authored nested m0; previously the builder returned that
  larger result (and the editor had to refuse it). Now it silently falls back to
  the simplify baseline — never heavier, and the free split-count win is never
  lost ("don't skip both"). Packing that genuinely helps (layer-additive
  exploration docs) is unaffected.

- `preserveZOrder?: boolean` (default **true**) — when packing, a rect may only
  land above every earlier-painted rect it OVERLAPS, so the rendered pixels are
  unchanged (only invisible reorderings of non-overlapping rects happen). This
  closes a real z-inversion: plain first-fit preserved a directly-overlapping
  PAIR but could invert a TRANSITIVE chain (A over B over C, with A and C
  disjoint, could land A beneath C). The `minLayer` constraint (`1 + max` layer
  of every earlier overlapper) makes packing stacking-exact. Set false to pack
  by geometry alone for fewer layers at the cost of possibly changing which rect
  paints on top where they overlap (a deliberate, mildly-lossy trade).
- `reduceSplits?: boolean` (default **false**) — run `reduceSplitCounts` as a
  strictly-lossless structural tidy that shrinks an already-well-nested doc
  WITHOUT flattening it. A different strategy from `pack` (which rebuilds flat
  band-decomposed layers and can BALLOON a doc authored as tight nested splits);
  the two compose (reduction runs last) or `reduceSplits` runs alone
  (`pack: false`) as a lossless-only path.
- `meta.reducedSplits` — splits the `reduceSplits` pass collapsed (0 when off).
- `sourceOrder: number[]` — GATHER permutation (`newSources[k] =
  oldSources[sourceOrder[k]]`) so a host can migrate positional sidecars after a
  rebuild reorders rendered leaves. Identity for the order-preserving paths.
- `meta.driftMaxPx` / `meta.driftTotalPx` — the largest single-rect edge
  displacement from the original geometry, and the SUM across every rendered
  leaf ("total drift over the whole layout"). Opt-in capability for a host that
  wants a drift readout or to gate a bounded-lossy transform under a cap.

**Compatibility.**

- **Breaking:** no — additive options default to prior behavior
  (`preserveZOrder: true` only constrains packing that previously could invert;
  `reduceSplits: false` is a no-op default); new result fields are additive.

**Release notes.**

<!-- The editor Compact controls (ViewframeControls / ViewFrame) consume
     preserveZOrder / reduceSplits. sourceOrder + the drift figures ship as
     opt-in capability with no wired consumer yet. All consumers are
     monorepo-versioned; only the dsl-stdlib file above ships. -->

### `compactLossless` + `reduceSplitCounts` — the unambiguous lossless compaction path

Two new top-level exports that give callers a compaction path whose losslessness
does not depend on which options were passed.

- `reduceSplitCounts(m0, { width, height, maxDriftPx?, output? })` — a new
  non-targeted transform that reduces split COUNTS to their minimum
  representation: a split whose per-cell weights share a common divisor encodes
  the same proportions at a smaller count (`10(0,1,0,0,0,0,0,0,0,1)` → `5(1,0,0,0,1)`).
  This is **drift-budgeted**, not blindly structural — the engine quantizes a
  split's pixel remainder as a function of its count, so `N → N/d` can shift an
  edge by ~1px at a canvas the original count doesn't divide. `maxDriftPx: 0`
  (default) is STRICT lossless: each candidate is verified pixel-identical
  against the real quantizer over the whole document before it's applied;
  `maxDriftPx > 0` opts into bounded drift. Rendered-leaf count and paint order
  are invariant (only passthrough slots collapse), so positional sidecars stay
  attached. Returns `{ m0, reduced, skipped, maxDriftPx }`. This is the lossless
  counterpart to `compactDocument`'s lossy `gcdDriftPercent` GCD-snap (which
  MOVES edges to a coarser grid).

- `compactLossless({ m0, width, height, removeNullLayers?, reduceSplits?, maxDriftPx? })`
  — a builder that chains exactly two geometry-preserving transforms:
  `removePureNullLayers` (drop root-chain layers that paint nothing) then
  `reduceSplitCounts`. It never packs and never moves an edge beyond the
  (default 0) budget, so "is this lossless?" has one answer regardless of
  options — unlike `compactDocument`, whose `pack` rekeys identity and whose
  `gcdDriftPercent` is lossy. Reports `keysStable` + the `rekey` map + `liveKeys`
  set (same migration contract as `compactDocument`) so hosts can migrate
  key-addressed sidecars, plus a `meta` block (reduced-split count,
  layers/DSL-length before+after, invariant frame count, max drift).

**Compatibility.**

- **Breaking:** no — purely additive.

**Release notes.**

<!-- Body also lands `autoCompactRenderable` + the `skipAutoCompact` opt-out in
     template-utils / types — those are monorepo-versioned; only the
     dsl-stdlib files above ship. -->

### `extractNodeByStableId` query + overlay-drop option on the replace transforms

**New query:**
- `extractNodeByStableId(m0, stableKey, opts?)` → `string` — extract the node
  addressed by its identity-path stable key as a **standalone m0 string**. By
  default the extraction is subtree-complete: the node body **plus its
  immediately attached overlay block** (`{...}`) travel together
  (`opts.includeOverlay: false` extracts the body alone, mirroring the
  body-only span semantics of `replaceNodeBySpan`). The fragment is validated
  as a standalone m0 and throws if it cannot stand on its own (bare null /
  passthrough — donors and holes are geometry constructs, not extractable
  subtrees).

**Replace transforms gain overlay control (additive):**
- `replaceNodeBySpan` / `replaceNodeByStableId` accept a new
  `ReplaceNodeOptions` (extends `OpOutputOptions`) with
  `overlay?: "preserve" | "drop"`. `"preserve"` (default, unchanged behavior)
  reattaches an immediately attached overlay block to the replacement;
  `"drop"` consumes it — for when the overlay travels with an extracted
  subtree rather than staying at the site.

The pair is a round-trip:
`replaceNodeByStableId(m0, key, extractNodeByStableId(m0, key), { overlay: "drop" }) === m0`.

**Compatibility.**

- Breaking: no. `overlay` defaults to `"preserve"` (existing behavior);
  `ReplaceNodeOptions` is a superset of the previous `OpOutputOptions`
  parameter.

### `rebuildRects` builder — full-graph geometry rebuild for post-render editing

**New builder:**
- `rebuildRects(opts)` → `RebuildRectsResult` — throw the entire m0 away and
  regenerate it from its rendered leaves: collect every rendered rect in paint
  order, apply per-leaf rect `overrides` and/or a full paint-`order`
  permutation (Z), then repack. Returns the rebuilt `m0` plus `rekey` /
  `liveKeys` / `sourceOrder` (GATHER permutation) so a host keeps positional
  `sources` and stableKey-addressed sidecar metadata bound.

**New internal shared engine (not exported):**
- `src/builders/_internal/packLeafRects.ts` — the collect → **minLayer
  z-preserving first-fit** → per-layer `placeRects` → compose → identity-lookup
  core, extracted **behavior-preserving** from `compactDocument`'s pack block.
  `compactDocument` now consumes it unchanged (its byte-identical test suite
  locks the extraction); `rebuildRects` reuses it.

**Compatibility.**

- Breaking: no. Purely additive — one new export; `compactDocument`'s public
  behavior and byte output are unchanged.

### `placeOptimizedRects` — constraint-aware, drift-budgeted placeRects

**New builder:**
- `placeOptimizedRects(opts)` → `PlaceOptimizedRectsResult` — the plural,
  constraint-aware sibling of `snapRectPrecision`. `placeRects` places rects at
  exact pixels; coprime edges blow the precision floor up to 100% (the layout
  "needs its exact canvas"). This snaps every rect edge onto the **coarsest
  common grid** it can — collapsing the precision floor **and** the m0 length —
  within a **per-rect drift budget**, while letting the caller **lock** the rects
  that must stay pixel-exact.

Per rect: `driftPx` — max px EACH EDGE may move (`0` = locked exact, e.g. a
segment of an animated arc/pie chain). Global default: `driftPercent` (% of the
smaller canvas dim) or `driftPx`. Per axis the grid pitch must divide
`gcd(locked edges, axisLen)`, so a locked coprime edge correctly forces 100% on
that axis while everything else collapses. The pitch search bakes in the
conflict guard — it never emits a zero-size or out-of-bounds rect (nearest-
multiple rounding is monotonic, so originally-disjoint rects stay disjoint).

**Zero drift ⇒ byte-identical to `placeRects`.** Optimization is strictly opt-in.

**Compatibility.**

- Breaking: no. Additive — new export only; default (zero drift) matches
  `placeRects`.

### `snapRectPrecision` — best-effort exact placement under a precision ceiling

**New builder:**
- `snapRectPrecision(opts)` → `SnapRectResult` — the single-rect **GCD-snap**
  primitive. `placeRect` places a rect at exact pixels, but its precision floor
  is a pure number-theory fact: `basis = axisLength ÷ gcd(before, size, after)`.
  When those three are coprime the only exact grid is 1px, so `basis = the whole
  axis` — 100% precision (the rect "needs its exact canvas"). This does the GCD
  search for you: it returns the `exact` request (which may be 100%) **plus a
  Pareto `frontier`** of nearby rects, each nudged ≤ `maxDeltaPx` px to maximize
  the axis GCD, tagged with its pixel `deltaPx` and a ready-to-use `m0` (from
  `placeRect`). `best` is the minimum-delta candidate at/under `maxPrecisionPct`;
  `nudge` masks which of `x/y/w/h` may move.

The two axes are independent (`X` depends on `[x, w, rootW−x−w]`, `Y` on
`[y, h, rootH−y−h]`), so it's a small per-axis integer sweep combined into a 2-D
frontier. Deterministic; no randomness.

**Compatibility.**

- Breaking: no. Additive — new export only.

### `placeInsetRects` — zero-drift, bounded-precision placeRects (inset-recovery)

**New builder:**
- `placeInsetRects(opts)` → `PlaceInsetRectsResult` — the zero-drift sibling of
  `placeOptimizedRects`. Quantizes each rect's cell OUTWARD to a coarse lattice
  (bounded precision), then recovers the exact pixel bounds with a per-rect
  `placement.inset` on the leaf source — a render-time fractional shrink that
  costs no DSL chars and no precision. Where `placeOptimizedRects` MOVES edges
  (visual drift), this keeps painted content byte-exact; where both apply
  (independent, transparent-margin leaves with shrink room) it dominates.

Two number-theory behaviors are load-bearing (both regression-tested):

- **The pitch is a DIVISOR of the axis** — the smallest divisor ≥
  `axisLen / basis` — never `round(axisLen / basis)`. A non-divisor pitch leaves
  a trailing margin `≡ axisLen mod P`, collapsing the band gcd to
  `gcd(P, axisLen)` (1280 @ basis 120 → P=11 → gcd 1 → precision 1280, total
  failure; the divisor rule gives P=16 → precision 80).
- **Inset fractions are half-pixel-centered** — `(n + 0.5) / cellSize`, never
  `n / cellSize`. The engine FLOORS (`applyInsetToRect`), and `floor((n/W)·W)`
  loses a pixel on real IEEE pairs ((15,22), (13,23), (15,26), …); the `+0.5`
  form recovers exactly for every `n < W ≤ 7680` (swept).

Per-rect cells that collide after outward quantization (a gap holding no lattice
multiple) spill to separate overlay layers via `placeRects` packing — painted
content stays disjoint, so collision costs layers, not correctness. A `minFill`
coarseness guard (default 0.5) keeps small rects from drowning in giant cells,
walking to a finer divisor and reporting `clamped` per axis. Hostile axes
(prime / divisor-poor for the rect set) THROW with the escapes (self-framed
coarse-quantize, `placeOptimizedRects` drift, raise `basis` / lower `minFill`)
rather than silently emitting a ~100%-precision string — or, for RUNTIME
templates that must render at any canvas, `onHostile: "exact"` places the
hostile axis exactly and reports it via the result's `hostile` flags (matching
`placeOptimizedRects`' degradation, whose pitch also falls to 1 there).

**Compatibility.**

- Breaking: no. Additive — new export only.

### `bakeInsets` — fold render-time insets back into m0 geometry

**New builder:**
- `bakeInsets(opts)` → `BakeInsetsResult` — the **inverse of `placeInsetRects`**.
  Where `placeInsetRects` GENERATES per-rect recovery insets (moving complexity
  OUT of the m0 into a render-time `placement.inset`), `bakeInsets` CONSUMES
  insets and folds them back INTO the geometry. Given an m0 plus one inset per
  rendered frame — `insets: (BakeInsetsInset | null)[]`, index-aligned to paint
  order (`paintOrder` 0..N-1), `null` = no inset, and **length must equal the
  render-frame count exactly or the call throws** — it shrinks each frame's
  integer cell with the EXACT `applyInsetToRect` floor math the engine uses
  (`Math.floor(f · cellSize)` per edge, `Math.max(1, …)` size clamp), then
  re-emits the shrunk rects via the shared `packLeafRects` core (`preserveZOrder`
  keeps stacking exactly where rects overlap). The result is a self-contained,
  inset-free, **resolution-baked** m0 whose cells already show the gutters.

Byte-exactness is structural, not aspirational: the parse (`queryFrames(m0,
{width,height}).render()`) is the same parser at the same canvas the engine
renders with (integer geometry, contiguous paint order), the floor math mirrors
core edge-for-edge, and `packLeafRects` re-parses its own output and asserts
every rect round-trips — so the re-emitted m0 renders byte-identically to the
original m0 + fiber insets, or the call throws rather than emit a wrong string.
The output is ABSOLUTE (per-pixel bands) and therefore "significantly longer"
than the input — the deliberate resolution-baked trade `rebuildRects` also makes.

New types: `BakeInsetsInset` (reuses `PlaceInsetRectsInset`'s `{top,right,bottom,
left}` shape), `BakeInsetsOptions`, `BakeInsetsResult`; exported from
`src/builders/index.ts`.

### QR channels — `suppressBase` per-channel base-layer suppression

**Extended type (additive):**
- `QrChannelConfig` object form gains `suppressBase?: boolean` (default
  `false`). When set on an enabled channel, the channel's region cells are
  suppressed from the BASE layer (emitted as `-` instead of `1`), leaving the
  channel's logical-owner anchor as the region's only paint site.

`qrToM0`'s default behaviour is unchanged: channels remain pure structural
anchors over an intact base, so the canonical QR keeps scanning no matter
which channels are enabled. `suppressBase` is for the caller that GUARANTEES
it splices a full-coverage visual into the anchor — with styled base modules
(circle / rounded-square dots), the intact base otherwise peeks out past the
spliced visual's rounded corners.

### `wrapBelowByLogicalIndex` — per-leaf below-wrap transform

New transform `wrapBelowByLogicalIndex(m0, targetLogicalIndex, opts?)` — wraps the Nth rendered frame (parse order, counting frames inside overlay bodies, same vocabulary as every other `*ByLogicalIndex` transform) as `F{<frame>}`. A new base leaf takes the target's structural position and the target moves into the new wrap's overlay, so the new leaf paints BELOW it. The symmetric pair to `addOverlay` (which adds a leaf painting above). Exported from the transforms index.

Unlike `addOverlayByLogicalIndex`, a target that already carries an overlay is NOT a no-op: the whole leaf+overlay span moves inside the wrap (`F{X}` → `F{F{X}}`), keeping the target's own overlay painting above it — never emitting the illegal chain `F{F}{X}`. Returns `null` when the logical index doesn't exist or is invalid, matching the other `*ByLogicalIndex` primitives.

**Compatibility.**

- Breaking: no. Purely additive; no existing export changes shape or behavior.

**Release notes.**

First consumer is Compose's per-tile "Below this tile" affordance (`addTileBelowLeaf` in the mosaic web app), which previously shipped a divergent hand-rolled walker.

## 2.0.0 — 2026-05-01

### GCD reduction across stdlib builders

`measureSplit`, `strip`, `spotlight`, `comparison`, and `weightedSplit` (with `claimants`) now GCD-reduce their emitted DSL by default. `comparison({ pairs: 1 })` drops from a 100-slot string to ~6 chars. A `mode: "literal"` opt-out is available when exact slot indices matter (animation keyframes, debug introspection). Shared `ReductionMode = "optimized" | "literal"` type unifies the choice across builders; `WeightMode` is preserved as a v1.0.0-compatible alias.

**`measureSplit` (and variants `measureSplitBySpan` / `measureSplitByLogicalIndex` / `measureSplitByStableId`).** Now reduce by GCD by default, matching `pctSplit`. New `measureMode?: ReductionMode` option opts back into literal slot count when full N matters.

- Before: `measureSplit(..., N=100, ranges=[{0,24},{25,99}])` produced a 100-slot DSL with 98 passthroughs.
- After (default): `4(F,>,>,F)` — equivalent to `pctSplit(..., [25, 75])`.
- After (literal): `measureSplit(..., { measureMode: "literal" })` preserves the 100-slot form.

**`comparison()`.** Last builder still emitting un-reduced literal-slot output. Now GCD-reduces. Trivial `comparison({ pairs: 1, direction: "horizontal" })` drops from `100(0,…×49,1,0,…×49,1)` (≈204 chars) to `2(1,1)` (4 chars). Geometry identical.

**`weightedSplit()` with `claimants`.** Removed the `&& !claimants` guard around GCD reduction. Reduction now applies whenever weights share a common divisor — claimants are indexed by *child position*, not slot position, so dividing all weights by the same divisor preserves alignment. `mode: "literal"` opt-out still available.

**`strip()`.** New `mode?: ReductionMode` option (default `"optimized"`). Replaced manual `weightedTokens` + `container` slot assembly with `weightedSplit({ claimants })` so reduction flows through. `strip(2, "col", { cellWeight: 50 })` goes from `100(0,…×49,1,0,…×49,1)` to `2(1,1)`.

**`spotlight()`.** Outer slot composition (in all four arrangements: `bottom` / `right` / `l-wrap` / `u-wrap`) routed through `weightedSplit({ claimants })`. Picks up GCD reduction transparently. Public API, parameter ranges, tile counts, and rendered geometry unchanged.

**Migration.** None for end users — public APIs, parameter ranges, tile counts, and rendered geometry are unchanged. Only the emitted DSL strings are shorter. Internal callers depending on literal slot counts can pass `mode: "literal"`.

### snapGrid builder — zero-distortion guttered grids

New builder family that wraps `safeCanvas` + `placeRect` + `grid` + `replace` to fit a guttered grid into a canvas with zero pixel distortion. Three flows:

- **`snapGridFit({ rootW, rootH, rows, cols, gutter, outerGutters, hAlign, vAlign })`** — given a target grid, computes the largest quantization-free inner rect that fits inside the canvas, then composes `placeRect{grid}` so the canvas keeps its original size. When the inner rect happens to fill the canvas exactly, the wrapper is dropped and the bare grid DSL is returned.
- **`snapGridEnumerate({ rootW, rootH, minRows, maxRows, minCols, maxCols, gutter, outerGutters })`** — sweeps every `(rows, cols)` in the search range, computes the safe inner rect for each, and returns candidates sorted by `fitScore = coverage × tileCount` (descending). Candidates that don't fit are silently skipped.
- **`snapGridFind(opts)`** — convenience: runs `snapGridEnumerate`, builds the top candidate via `snapGridFit`. Throws when no candidate fits.

**Quantization-free reminder.** A m0 split with total weight `W` rendered into a `D`-pixel canvas allocates `D/W` pixels per weight unit. When `D mod W == 0`, every cell of equal weight is pixel-identical; otherwise `splitEven` rounds and a few cells get one extra pixel — visible spread. For an 8-col grid with 10% gutter (cellW=50, gutterW=5): `totalX = 8*50 + 7*5 = 435`. In a 1920px canvas, `floor(1920/435) = 4`, so the largest quantization-free width is `4*435 = 1740px`. `snapGridFit` runs that math, then wraps with `placeRect(rootW=1920, rectW=1740, …)` so the outer canvas stays 1920×1080.

**Scoring rationale.** `fitScore = coverage × tileCount` balances two competing pulls: pure coverage favors degenerate small grids (a 1×1 trivially gets 100% coverage); pure tile count favors cramped layouts that waste canvas area. The product keeps both pressures honest. Spread is exactly 0 for every emitted candidate by construction, so feasibility is binary and scoring only differentiates on coverage and tile count.

### aspectSafeGrid: matched landscape/portrait pair

**Breaking change.** `aspectSafeGrid` no longer returns a single DSL string that's quantization-free at multiple canvas sizes. It now returns a *coordinated aspect-matched pair* of DSL strings — one for the landscape canvas, one for the portrait canvas — chosen so:

1. Both DSLs render quantization-free at their respective canvases.
2. Both have the same total cell count.
3. The cells in both orientations have similar aspect ratios (minimized log-distance between `cellAspectRatio` values).

This matches the actual user intent for cross-resolution video / mobile design: when the device flips, each cell still holds the same kind of content (e.g., a wide film frame stays wide on both desktop AND mobile rather than getting squashed to portrait). The portrait grid is **NOT** a simple `(rows, cols) → (cols, rows)` transpose — for `1920×1080` (4 cols × 3 rows landscape, cell AR ≈ 1.33), the AR-matched portrait at `1080×1920` is `2 cols × 6 rows` (cell AR ≈ 1.69), not `3 cols × 4 rows` (which would flip cell orientation, AR ≈ 0.75).

**Why breaking, not additive.** A new `aspectSafeGridPair` builder alongside the legacy single-DSL behavior was rejected because (a) the name belongs to the right behavior — having both `aspectSafeGrid` (legacy, confusing) and `aspectSafeGridPair` (the actually-useful one) would consistently lead users to the wrong builder; (b) no real consumers of the old behavior outside the dictionary, which is being updated in lockstep; (c) pre-broader-adoption is the moment to make this kind of fix.

**API changes.**

| Removed | Replacement |
|---|---|
| `m0` (single canonical DSL) | `landscape.m0`, `portrait.m0` |
| `cellW` / `cellH` (single weights) | `landscape.cellWPx`/`cellHPx`, `portrait.cellWPx`/`cellHPx` |
| `gutterW`, `gutterRatio`, `ppwLandscape`, `ppwPortrait` | per-orientation pixel sizes exposed directly |
| `gridResult` | each orientation builds its DSL via `strip` directly |

New result shape:

```typescript
type AspectSafeGridOriented = {
  m0: M0String;
  rows: number;
  cols: number;
  canvasW: number;
  canvasH: number;
  cellWPx: number;
  cellHPx: number;
  cellAspectRatio: number;
  gutterPxX: number;
  gutterPxY: number;
};

type AspectSafeGridResult = {
  cellCount: number;
  cellAspectLogDelta: number;
  landscape: AspectSafeGridOriented;
  portrait: AspectSafeGridOriented;
};
```

**Search-range API.** Four coordinated flows:

- **Match cell aspect** (default — `letterbox: false`) — set the shared range plus an optional `targetCellAspectRatio`. Best when the user wants to fill the canvas perfectly.
- **Pin landscape grid** (`letterbox: false`, landscape range collapsed) — set `landscapeMinRows === landscapeMaxRows` to fix the landscape grid; portrait range searches freely. Best when the user knows the landscape composition they want.
- **Letterbox to fit** (`letterbox: true`) — every `(R, C)` candidate becomes valid via `placeRect` wrapping. Better cell-aspect matches at the cost of black bars. `hAlign` / `vAlign` control inner-grid alignment.
- **By cell count** (`targetCellCount` set, typically `letterbox: true`) — search filters candidates by `|R*C - targetCellCount| ≤ tolerance` (default 4). Best when the user knows the data — "I have ~10 items to display."

All flows compose with `targetCellAspectRatio` to bias toward a specific cell shape.

**Migration.**

```typescript
// Before
const r = aspectSafeGrid({ minCols: 2, maxCols: 6 });
saveDsl(r.m0);

// After
const r = aspectSafeGrid({ minCols: 2, maxCols: 6 });
saveDslLandscape(r.landscape.m0);
saveDslPortrait(r.portrait.m0);
```

The natural serialization target for the matched pair is the new `.m0p` pack format (see `@m0saic/dsl-file-formats` 1.1.0).

### Golden ratio builders

Three pure-geometry builders for golden-ratio (φ ≈ 1.618) compositions. Each emits a normal weighted DSL via `weightedSplit` / `placeRect` — the DSL itself stays integer-weighted and indistinguishable from any hand-tuned ratio.

**Integer Fibonacci pairs.** The builders intentionally use `13/8`, `21/13`, `34/21`, `55/34`, `89/55`, `144/89` to approximate φ. Each pair gives a different precision-vs-DSL-length tradeoff, exposed via a `precision` option. `21/13` is the visually-golden default — error vs true φ is 0.16%, well under perceptual threshold. `144/89` is mathematically negligible-error but emits a longer DSL.

**`goldenSplit({ axis, dominantFirst, precision, largeClaimant, smallClaimant })`** — single golden-ratio split, two cells weighted φ:1 (or 1:φ when `dominantFirst: false`). The most common pattern from the source article ("two-column asymmetric layout — main content + sidebar"). Emits a `weightedSplit` with literal mode so the integer ratio stays intact.

**`goldenSpiral({ depth, direction, precision })`** — recursive golden splits that approximate the Fibonacci/golden spiral. Each level golden-splits the larger cell from the parent on the *perpendicular* axis. Depth 4–6 is the visual sweet spot; depths >10 are rejected. `direction` (`"tl"` / `"tr"` / `"bl"` / `"br"`) controls which corner the spiral wraps around.

**`goldenRect({ rootW, rootH, orientation, hAlign, vAlign })`** — computes the largest rectangle with aspect ratio φ:1 (landscape) or 1:φ (portrait) that fits inside the user's canvas, then wraps it in a `placeRect`. Auto-detects orientation from the canvas aspect; can be forced via `orientation: "landscape" | "portrait" | "auto"`.
