# Changelog

## 2.0.0 — 2026-09-19

### Real-world template goldens — flattened+inset layout corpus

New golden suite `src/realWorld/realWorld.goldens.test.ts` — a curated corpus of
real production template layouts, seeded from the third `--save-m0` sidecar
(`<base>.flattened.inset.m0`): the fully-flattened m0 with each source's
render-time `placement.inset` baked back into the base geometry. This extends
the suite beyond hand-written core-DSL cases and stdlib-generator output to
track **complex real layouts** for byte-correctness — donut charts, gutter
grids, treemaps, masonry sheets, dashboard compositions.

17 templates (20 cases — three carry a `__no-inset` twin showing the plain
flattened base×fiber difference):

- **charts / cards:** `alpine/donut/v3`, `alpine/bar-graph/v1`,
  `alpine/kpi-card/v2`, `alpine/leaderboard/v1`, `alpine/commit-feed/v2`,
  `alpine/contributor-table/v1`
- **baked-inset showcases** (gutters that live in the fiber → a `__no-inset`
  twin): `alpine/heatmap/v2`, `alpine/treemap/v2` (desktop aspect),
  `collage/image-collage/v1`
- **compositions:** `dsl-tutorial/v1`, `theming/v1`, and six
  `hero/ffmpeg-pulse/*` beats (`kpi-overview`, `changes-breakdown`,
  `contributions`, `top-contributors`, `activity-trend`, `notable-commits`) —
  which compose sub-templates whose gutters ride the fiber, so their baked seeds
  are dense (60–120 frames) and inset-bearing.

And a new **top-level `brand/` tier** (peer of `coreDsl` / `stdlib` /
`realWorld`) with the three canonical m0saic brand-mark layouts taken straight
from `@m0saic/dictionary` (`brand/{m0saic-pattern, m-33, m0}`) — the m0saic
pattern, the mosaic M, and the M0 logotype. These have no insets (the M / M0
carry per-cell masks; the pattern is pure rect geometry), so their seed is the
raw dictionary m0. Their stills use a SMOKE render: an on-the-fly doc reads the
`.m0` fixture and fills every render frame with one flat brand-orange tile
(`#f97316`), each carrying its per-cell inline-mask for the masked marks (M / M0
— wired the `@m0saic/brand/logo/v3` way, registry entry +
`getSourceOrderStableKeys`; the pattern is pure rects) — a uniform, settled
brand-orange rendering of the real mark, no animation.

The single-copy golden logic (`.m0` gate + wireframe/still references, recursive
discovery) is factored into a shared `src/__harness__/singleCopyGolden.ts` that
both the `realWorld` and `brand` tiers use.

### Platform-independent (single-copy) goldens + color-map layout-match e2e

Two coupled changes make this package about **look, not bytes**.

#### 1. Single-copy, platform-independent goldens (darwin/win32 split removed)

The dual-platform pixel split was removed **for this package only** (core
`__tests__` visual specs and the dictionary visual-tests stay byte-exact +
dual-platform — those are about bytes). Every tier — `coreDsl`, `stdlib`,
`realWorld`, `brand` — now commits, side by side in `__goldens__/`:

- `<id>.m0` — the byte-correctness GATE: engine-independent text, byte-compared,
  identical on every platform.
- `<id>.png` — ONE wireframe reference, reviewed by eye (NOT byte-compared — one
  copy can't match every rasterizer).

The 115 stdlib/coreDsl pixel goldens were flattened out of their `win32/` ·
`darwin/` slots (both slots + `_toolchain.json` sidecars deleted). The default
verify is now cross-platform and **ffmpeg-free** (compare the `.m0`, check the
references exist) — ~6× faster (≈100s → ≈15s). The single-copy logic is factored
into `src/__harness__/singleCopyGolden.ts`; the stdlib/coreDsl harness
(`src/stdlib/__harness__/goldens.ts`) drops the platform slot, PNG byte-compare,
and pinned-toolchain requirement.

#### 2. Color-map layout-match e2e (`<id>.match`, opt-in)

Byte goldens are the wrong tool: a font / anti-aliasing change repaints
thousands of pixels while the LAYOUT is unchanged. What matters is that every
declared rect renders WHERE IT SHOULD IN SPACE. The new
`test:dsl-visual-tests:layout` (part of `test:release`) verifies exactly that,
with no stored image and no platform duplication:

1. Parse the m0 → render frames; assign each a unique flat color by logical
   index.
2. Render the m0 with those per-cell fills → a color map of the layout.
3. Sample an anchored probe DEEP in each visible cell's interior (≥4px clear of
   its own edges AND any overlay cutting through it, so a ≤1px boundary rounding
   or edge AA never bites) and assert the pixel is the cell's color.

Probes + expected colors derive from the m0 and freeze into a committed
`<id>.match`. If a rect renders anywhere but where the geometry says, some probe
sees a different cell's color → caught. A single `.match` verifies identically on
every platform (flat-color interiors don't move with fonts/AA/rasterizer). It
RENDERS (ffmpeg), so it is opt-in / a release gate — the default verify stays
ffmpeg-free. 138 cases across all four tiers, no zero-probe cases.

## 1.1.0 — 2026-05-01

### Coverage audit + stdlib v2.0.0 tracking

Coverage-audit pass alongside the `@m0saic/dsl-stdlib` 2.0.0 / `@m0saic/dsl-file-formats` 1.1.0 cut. Three concerns rolled into one bump:

1. **New builder coverage.** Three stdlib builders shipping in v2.0.0 had zero visual-tests entries before this release: `golden` (the new `goldenSplit` / `goldenSpiral` / `goldenRect`), `snapGrid` (`snapGridFit` / `snapGridFind` / `snapGridEnumerate`), and `aspectSafeGrid` (existing builder, fully rewritten with breaking landscape/portrait pair shape).
2. **Golden regen for stdlib's GCD reduction.** Existing goldens for `comparison`, `strip`, `spotlight`, and `measureSplit` got regenerated under stdlib's new GCD-reduced output. The geometry is byte-identical (GCD reduction preserves rendering exactly), but the embedded `.m0` string in each sibling golden file is now the canonical reduced form (e.g., `comparison({ pairs: 1 })` golden's `.m0` went from a 100-slot string to `2(1,1)`).
3. **Dep range bumps.** Dependencies require `@m0saic/dsl-stdlib@^2.0.0` and `@m0saic/dsl-file-formats@^1.1.0`.

**New test directories** (each: `<builder>.goldens.test.ts` + `__goldens__/`):

- `src/stdlib/golden/` — 13 cases. `goldenSplit`: col/row × dominantFirst variants × 13/8 precision (4). `goldenSpiral`: depth 3/5 × br + depth 4 × tl/tr/bl (5). `goldenRect`: auto landscape (1920×1080) + auto portrait (1080×1920) + forced landscape in square + forced portrait in landscape canvas + visible-pillarbox 1600×900 (5).
- `src/stdlib/snapGrid/` — 9 cases. `snapGridFit`: 8×6 / 10% gutter centered + alignment variants + 3×4 no-gutter on square + 4×4 outer-gutters (5). `snapGridFind`: 1920×1080 + 1080×1920 + 1080×1080 with various gutter/range combos (3). `snapGridEnumerate`: candidate-ranking smoke test (1).
- `src/stdlib/aspectSafeGrid/` — 6 paired cases (each generates 2 goldens — landscape + portrait): default 1920×1080/1080×1920 with no gutter; default with 4% gutter; `targetCellAspectRatio: 1.5` biasing; `letterbox: true` + `targetCellAspectRatio: 1.0`; `targetCellCount: 12` with letterbox; custom 1280×720/720×1280 canvases.

**Goldens regenerated under stdlib's GCD reduction.** Existing goldens whose embedded `.m0` strings changed shape (geometry preserved) — `src/stdlib/{comparison,strip,spotlight,measureSplit}/__goldens__/*.m0`. PNGs are byte-identical for these cases — only the sibling `.m0` content shifted.

**measureSplit suite rewritten.** Per a coverage-quality audit, the existing measureSplit cases (single full-range coverage that reduces to one frame; 50/50 splits that triggered an unrelated `make-wireframe` gap-rendering bug) were replaced with seven richer cases that exercise multi-position groups: `col_12__ruler_0_5_11`, `col_12__pillar_body_pillar`, `col_12__two_5wide_spacer_2`, `row_20__header_body_footer` (vertical 3-zone), `col_24__dense_ruler_step3`, `col_16__disjoint_4_2_5`, `col_20__overlap_merge_0-12`. Cases were chosen so GCD reduction does not collapse to N=2 (avoiding the `2(1,-)` shape that exposes a renderer-side gap-token bug — DSL is correct; renderer fix tracked separately).

**Grid suite canvas bump.** Existing tests used `r.totalX * 20` for canvas dims, producing 20×20 to 80×80 canvases for low-totalX grids — too small to inspect visually. Replaced with `pickScale(totalX, totalY)` that targets `min * scale >= 800px` while preserving quantization (integer scale).

**Renderer-bug skips.** `placeRect.goldens.test.ts` (centered rect + small_topleft) and two measureSplit cases (`col_6__left_0-2` / `col_6__right_3-5`) are `.skip`-ed pending a fix to `make-wireframe`'s `-` gap-token rendering. DSL is correct in all cases. Re-enable + regenerate when the renderer fix lands.

**Harness toolchain sidecar vendored.** `__harness__/goldens.ts` previously imported `writeToolchainSidecar` from `@m0saic/platform/toolchain`, a workspace-private package. Replaced with an inline minimal implementation that writes node version / OS / arch / generated date — keeping diagnostic value for cross-machine golden mismatches without pulling in a private runtime dep. No public-API change to `assertWireframeGolden`.

**Compatibility.** Public API (`assertWireframeGolden`, `WireframeGoldenOpts`) unchanged. Existing goldens preserve PNG bytes; embedded `.m0` strings shifted shape under semantic-preserving GCD reduction (upstream stdlib behavior change, not a visual-tests API change). Consumers using the harness as an external test runner see no break.
