# Changelog

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
