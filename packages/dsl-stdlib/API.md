# @m0saic/dsl-stdlib — API Reference

Builders, transforms, queries, pipelines, SVG/scale/mask helpers, and specialized generators (QR, barcode, rank sets, pixel-art) for the m0 DSL. Complete public surface — the colocated method catalog (internal to the monorepo) is the "when to reach for it" companion.

```
npm install @m0saic/dsl-stdlib
```

Depends on `@m0saic/dsl` only.

---

## Constructors

| Function | Signature | Description |
|---|---|---|
| `toM0String` | `(raw: string, context?: string) => M0String` | Canonicalize, validate, brand. Throws on invalid input. |
| `tryM0String` | `(raw: string) => M0StringResult` | Same pipeline, returns Result instead of throwing. |

Neither performs overlay chain rewriting. Call `rewriteOverlayChains` first if input may contain `}{`.

**Types:**

| Type | Shape |
|---|---|
| `M0StringResult` | `{ ok: true; value: M0String } \| { ok: false; error: M0ValidationError }` |

---

## Builders

All builders return validated `M0String` values.

### Primitives

| Function | Signature | Description |
|---|---|---|
| `container` | `(tokens: string[], axis: ContainerAxis) => M0String` | Wrap tokens in a counted split container |
| `equalSplit` | `(count: number, axis: ContainerAxis, claimant?: string) => M0String` | N equal children |
| `weightedSplit` | `(weights: number[], axis: ContainerAxis, opts?) => M0String` | Proportional split from weight array |
| `weightedTokens` | `(weight: number, claimant?: string) => string[]` | Expand weight into passthrough + claimant tokens |
| `strip` | `(count: number, axis: ContainerAxis, opts?: StripOptions) => M0String` | Uniform strip with gutter control |

### Layout builders

| Function | Signature | Description |
|---|---|---|
| `grid` | `(opts: GridOptions) => GridResult` | Rectangular grid with ratio-based gutters and auto-scaling |
| `aspectFit` | `(opts: AspectFitOptions) => AspectFitResult` | Fit aspect ratio inside canvas with letterbox/pillarbox |
| `placeRect` | `(opts: PlaceRectOptions) => PlaceRectResult` | Place exact rectangle inside canvas with alignment |
| `placeRects` | `(opts: PlaceRectsOptions) => PlaceRectsResult` | Place many rects, packing non-overlapping ones onto as few overlay layers as possible. Per-rect `importance?: number` (default 0) sets paint priority — higher always paints on top; equal-importance order is unspecified. Omit it everywhere for the un-prioritized packing. |
| `snapRectPrecision` | `(opts: SnapRectOptions) => SnapRectResult` | Best-effort exact placement under a precision ceiling. Returns the requested rect (`exact`, may be 100% precision when the pixels are coprime) plus a Pareto `frontier` of nearby rects — nudged ≤ `maxDeltaPx` px to maximize `gcd(before, size, after)` — each tagged with its pixel delta and a ready `m0`. `best` = min-delta candidate ≤ `maxPrecisionPct`; `nudge` masks which of x/y/w/h may move. The single-rect GCD-snap primitive. |
| `placeOptimizedRects` | `(opts: PlaceOptimizedRectsOptions) => PlaceOptimizedRectsResult` | Constraint-aware, drift-budgeted `placeRects`. Snaps every rect edge onto the coarsest common grid it can — collapsing the precision floor + m0 length — within a per-rect drift budget (`driftPx`, or global `driftPercent`/`driftPx`; `driftPx: 0` LOCKS a rect exact, e.g. an animated arc segment). Per axis the pitch must divide `gcd(locked edges, axisLen)`, so a locked coprime edge correctly forces 100%; otherwise it collapses. Zero-drift is byte-identical to `placeRects`. Returns the snapped `rects`, `pitch`/`basis` per axis, and `driftMaxPx`/`driftTotalPx`. The plural sibling of `snapRectPrecision`. |
| `placeInsetRects` | `(opts: PlaceInsetRectsOptions) => PlaceInsetRectsResult` | **Zero-drift**, bounded-precision `placeRects` — the inset-recovery sibling of `placeOptimizedRects`. Quantizes each rect's cell OUTWARD to a lattice whose pitch is the smallest **divisor** of the axis ≥ `axisLen/basis` (default basis 120), places the cells, and returns per-rect `insets` (**half-pixel-centered** fractions `(n+0.5)/cellSize`, floor-safe against the engine's `Math.floor`) that recover the exact input bounds — painted content lands byte-exact, precision bounds at `basis`. Quantization-collided cells spill to layers (painted content stays disjoint); a `minFill` guard (default 0.5) walks to a finer divisor for small rects and reports `clamped`; hostile axes (prime dims) THROW with escapes rather than emit ~100% precision — runtime templates pass `onHostile: "exact"` to place that axis exactly instead (reported via `hostile`). Caller wires `insets[i]` onto `rects[i]`'s source `placement.inset` (leaf-scoped; leaves must paint nothing outside the inset box); templates use `placeInsetPieces` (`@m0saic/template-utils`) which does the wiring. |
| `aspectSafeGrid` | `(opts: AspectSafeGridOptions) => AspectSafeGridResult` | Coordinated aspect-matched pair of grids — landscape DSL + portrait DSL with same cell count, similar cell aspect ratios, both quantization-free at their respective canvases |
| `safeCanvas` | `(opts: SafeCanvasOptions) => SafeCanvasResult` | Largest canvas where a guttered grid has zero rounding |
| `spotlight` | `(opts?: SpotlightOptions) => SpotlightResult` | Hero tile with weighted supporting tiles |
| `comparison` | `(opts?: ComparisonOptions) => ComparisonResult` | Side-by-side or stacked A/B pairs |
| `rankedList` | `(opts?: RankedListOptions) => RankedListResult` | Weighted stack with progressive size decay |
| `goldenSplit` | `(opts: GoldenSplitOptions) => M0String` | Single golden-ratio (φ:1) two-cell split — Fibonacci-pair approximation |
| `goldenSpiral` | `(opts: GoldenSpiralOptions) => M0String` | Recursive golden splits forming a spiral composition |
| `goldenRect` | `(opts: GoldenRectOptions) => GoldenRectResult` | Largest 1.618:1 (or 1:1.618) rectangle inside a canvas, wrapped in `placeRect` |
| `rectsToM0` | `(grid: Grid, opts?: SvgToM0Options) => SvgToM0Variant` | Turn a set of pixel rects (a `Grid`) into an m0 layout — intent-by-rects. Shares the SVG-import packing/output options. |
| `snapGridFit` | `(opts: SnapGridFitOptions) => SnapGridResult` | Snap rects to a fixed grid resolution and emit the fitted m0 |
| `snapGridFind` | `(opts: SnapGridFindOptions) => SnapGridResult` | Search grid resolutions for the best snap fit under tolerance |
| `snapGridEnumerate` | `(opts: SnapGridFindOptions) => SnapGridCandidate[]` | Enumerate all candidate snap fits (for ranking/inspection) |

### Document builders

| Function | Signature | Description |
|---|---|---|
| `compactDocument` | `(opts: CompactDocumentOptions) => CompactDocumentResult` | Closeout compaction: null-layer removal + **growth-guarded** rect repack (`preserveZOrder` default true → stacking-safe; pack applied only when it beats the lossless baseline, else falls back to it) + optional lossless `reduceSplits` split-count tidy + optional lossy `gcdDriftPercent` GCD-snap. Reports old→new `rekey`, `sourceOrder` (GATHER permutation for positional sidecars), and `meta.{reducedSplits,driftMaxPx,driftTotalPx}` (per-rect + total geometry drift). |
| `compactLossless` | `(opts: CompactLosslessOptions) => CompactLosslessResult` | The unambiguous LOSSLESS path: chains `removePureNullLayers` + `reduceSplitCounts` only — never packs, never moves an edge beyond `maxDriftPx` (default 0). Reports `keysStable` / `rekey` / `liveKeys` for sidecar migration. |
| `rebuildRects` | `(opts: RebuildRectsOptions) => RebuildRectsResult` | Full-graph geometry rebuild for post-render editing: collect every rendered leaf, apply per-key rect `overrides` and/or a paint-`order` permutation (z), then repack. **Always rebuilds — no growth guard** (the user's edit must apply even when the DSL grows); resolution-baked exact pixels. Shares `compactDocument`'s pack core, so a no-op call is geometry-identical. Reports `rekey` / `liveKeys` / `sourceOrder` (GATHER) for sidecar migration. |
| `bakeInsets` | `(opts: BakeInsetsOptions) => BakeInsetsResult` | The **inverse of `placeInsetRects`**: fold render-time insets back INTO geometry. Given an m0 + one inset per rendered frame (index-aligned to paint order; `null` = none, length must match the frame count exactly or it throws), shrink each frame's integer cell with the EXACT `applyInsetToRect` floor math the engine uses, then re-emit the shrunk rects (z preserved via `packLeafRects`). The result is a self-contained, inset-free, resolution-baked m0 whose cells already show the gutters — byte-identical on render to the original m0 + fiber insets. Powers the `.flattened.inset.m0` save-m0 sidecar. |
| `toM0FileText` | `(m0: string, opts?: M0FileTextOptions) => string` | Serialize an m0 to `.m0`/`.m0c` file text (header + context). Prefer over hand-writing file bodies. |

---

## Transforms

All targeted transforms accept a `TransformTarget` discriminated union:

```typescript
type TransformTarget =
  | { by: "logicalIndex"; index: number }
  | { by: "span"; span: { start: number; end: number } }
  | { by: "stableKey"; key: string };
```

### Targeted transforms

| Function | Signature | Description |
|---|---|---|
| `split` | `(m0, target, opts: SplitOptions) => string` | Split tile into N children along axis |
| `replace` | `(m0, target, replacement, opts?) => string` | Replace node with new DSL fragment |
| `addOverlay` | `(m0, target, opts?) => string` | Add overlay `{1}` to node. No-op if present. |
| `removeOverlay` | `(m0, target, opts?) => string` | Remove overlay from node. No-op if absent. |
| `setTileType` | `(m0, target, type: TileTypePrimitive, opts?) => string` | Change leaf type (`"1"`, `"0"`, `"-"`, `"F"`, `">"`) |
| `measureSplit` | `(m0, target, opts: MeasureSplitOptions) => string` | Replace tile with measure-mode split |
| `swapFrames` | `(m0, indexA, indexB, opts?) => string` | Swap two rendered frames by logical index |
| `replaceNodeByStableId` | `(m0: string, stableKey: string, replacement: string, opts?: ReplaceNodeOptions) => string` | Replace a node addressed by its identity-path stable key. `opts.overlay: "preserve"` (default) reattaches an attached `{...}` block to the replacement; `"drop"` consumes it |

### Non-targeted transforms

| Function | Signature | Description |
|---|---|---|
| `addOverlayToAllFrames` | `(m0: string, opts?) => string` | Add overlay to every rendered frame |
| `addOverlayLayer` | `(m0: string, layerContent: string, opts?: OpOutputOptions) => string` | Composite a whole layer over everything (exploration / layer-additive) |
| `removePureNullLayers` | `(m0: string, opts?: OpOutputOptions) => string` | Drop root-chain layers that paint nothing (closeout compaction) |
| `reduceSplitCounts` | `(m0, opts: ReduceSplitCountsOptions) => ReduceSplitCountsResult` | Reduce split COUNTS to minimum representation by per-cell-weight GCD (`10(0,1,0,…,1)` → `5(1,0,0,0,1)`). Drift-budgeted: `maxDriftPx: 0` (default) is strict pixel-lossless at `(width,height)`; `> 0` opts into bounded drift. Paint order + frame count invariant. |
| `rewriteOverlayChains` | `(s: string) => string` | Collapse `}{` chains into nested `{...{...}}` form. Idempotent. |

---

## Queries

### Frame search & inspection

Predicate-based frame walks over a parsed m0 — read geometry without re-parsing by hand. `EditorPredicate`/`EditorMapper` receive an `EditorFrame` (full structural tree: rendered, passthrough, null, group). `QueryOptions` carries the canvas (`{ width?, height? }`) when bounds are needed.

| Function | Signature | Description |
|---|---|---|
| `findFrames` | `(m0, predicate: EditorPredicate, opts?: QueryOptions) => EditorFrame[]` | All frames matching the predicate |
| `findFirstFrame` | `(m0, predicate: EditorPredicate, opts?: QueryOptions) => EditorFrame \| null` | First match, or null |
| `findStableKeys` | `(m0, predicate: EditorPredicate, opts?: QueryOptions) => StableKey[]` | Stable keys of matching frames |
| `countFrames` | `(m0, predicate: EditorPredicate, opts?: QueryOptions) => number` | Count of matches |
| `someFrame` / `everyFrame` | `(m0, predicate: EditorPredicate, opts?: QueryOptions) => boolean` | Existential / universal test |
| `mapFrames` | `<T>(m0, mapper: EditorMapper<T>, opts?: QueryOptions) => T[]` | Map over all frames |
| `findRenderFrames` | `(m0, predicate: (f: RenderFrame) => boolean, opts?: QueryOptions) => RenderFrame[]` | Rendered tiles only (`1`/`F`) |
| `findLogicalFrames` | `(m0, predicate: (f: LogicalFrame) => boolean, opts?: QueryOptions) => LogicalFrame[]` | Logical leaves, in logical order |
| `queryFrames` | `(m0, opts?: QueryOptions) => FrameQuery` | Fluent query builder: `.editor()` / `.render()` / `.logical()` / `.within(rect)` — caches parses across chained scopes |
| `getLayerCount` | `(m0: string) => number \| null` | Number of root-chain overlay layers (null if not a chain) |
| `containedIn` | `(inner: M0Rect, outer: M0Rect) => boolean` | Rect-containment predicate (for `.within` scoping) |
| `hasOverlayAtSpan` | `(m0: string, span: M0Span) => boolean` | Check if node at span has an overlay |
| `extractNodeByStableId` | `(m0: string, stableKey: string, opts?: ExtractNodeOptions) => string` | Extract the node at a stable key as a standalone m0. Includes its attached overlay by default (`includeOverlay: false` for body only); throws on fragments that can't stand alone (bare null / passthrough) |

### Layout quality

| Function | Signature | Description |
|---|---|---|
| `quantizationSpread` | `(m0: string, width: number, height: number, opts?: { refScale?: number }) => QuantizationSpreadResult` | Max px any frame drifts from ideal at this canvas (0 = exact) |
| `isQuantizationImperceptible` | `(m0: string, width: number, height: number, maxPx?: number, opts?: { refScale?: number }) => boolean` | Worst drift ≤ `maxPx` (default 1)? |
| `evaluateM0` | `(m0: string, canvas: M0Canvas) => M0Evaluation` | Layout-quality stat bundle at a canvas (throws on non-m0) |
| `compareM0` | `(a: string, b: string, canvases: M0Canvas \| M0Canvas[]) => M0Comparison` | Per-metric comparison of two m0 strings (throws on non-m0) |

---

## Pipelines & history

| Function | Signature | Description |
|---|---|---|
| `pipe` | `(m0: string) => Pipe` | Fluent transform chain — `pipe(m0).split(...).replace(...).value()`. `Pipe` exposes each transform as a method. |
| `compose` | `(...fns: M0Transform[]) => M0Transform` | Compose transforms left→right into one `(m0) => m0` |
| `withInverse` | `<TArgs>(transform: AnyTransform<TArgs>) => (m0, ...rest) => WithInverseResult` | Wrap a transform so it returns its result plus an inverse transform |
| `withHistory` | `(m0: string) => History` | Undo/redo stack over transforms (`.apply()` / `.undo()` / `.redo()` / `.value()`) |

---

## SVG / geometry import

Parse an SVG into shapes, infer a grid, and emit m0 — the image→layout path.

| Function | Signature | Description |
|---|---|---|
| `parseSvg` | `(svg: string) => ParsedSvg` | Parse SVG markup into paths + viewBox |
| `extractGeometry` | `(paths: SvgPath[]) => ExtractedShape[]` | Reduce paths to bounded shapes |
| `inferGrid` | `(shapes: ExtractedShape[], viewBox: ViewBox \| null, opts?: InferGridOptions) => Grid` | Infer a rect grid from extracted shapes |
| `svgToM0` | `(svg: string, opts?: SvgToM0Options) => M0String` | Full SVG → m0 in one call |
| `enumerateSvgToM0` | `(svg: string, space?: EnumerateSpace) => SvgToM0Variant[]` | Enumerate alternative SVG→m0 packings for ranking |
| `toLocalPath` | `(d: string, origin: { x: number; y: number }) => string` | Re-origin a path's coordinates to a cell-local frame |
| `clipLocalPathToBounds` | `(localPath: string, width: number, height: number) => string` | Clip a local path to a `width×height` box |
| `isMaskedPath` | `(d: string) => boolean` | Whether a path describes a mask shape (vs a fill rect) |

---

## Scale / axis math

Deterministic value→pixel primitives — a faithful port of Chart.js `LinearScale` tick math. General for any data-driven layout (charts, timelines, gauges, sparklines).

| Function | Signature | Description |
|---|---|---|
| `niceNum` | `(range: number, steps?: number[]) => number` | Round a range up to a 1/2/5/10×10ᵏ "nice" number (Heckbert) |
| `linearScale` | `(dataMin: number, dataMax: number, opts?: LinearScaleOptions) => LinearScale` | Nice axis → `{ min, max, step, ticks }`. Matches Chart.js exactly. |
| `project` | `(value, domainMin, domainMax, pxStart, pxEnd) => number` | Linear value→pixel (y-axis: pass `pxStart=bottom, pxEnd=top`) |
| `categoryCenters` | `(count, pxStart, pxEnd, offset?) => number[]` | Evenly spaced category positions; `offset=false` (line) edges, `true` (bar) inset by half a band |
| `formatTick` | `(value: number) => string` | Thousands-separated tick label (Chart.js default) |

---

## Masks

For `makeColorTile` inline-mask shapes — see the method catalog (internal).

| Function | Signature | Description |
|---|---|---|
| `circleMask` | `(width: number, height?: number) => M0cMaskEntry` | Circle / ellipse mask entry |
| `roundedRectMask` | `(width: number, height: number, radius: number) => M0cMaskEntry` | Rounded-rect mask entry |
| `pillMask` | `(width: number, height: number) => M0cMaskEntry` | Pill (full-radius) mask entry |
| `generateMasks` | `(grid: Grid, m0: M0String \| string, opts?: GenerateMasksOptions) => MosaicMaskSetFile` | Build a mask set for a grid+m0 |
| `generateMasksByStableKey` | `(grid, m0, maskSet, canvasW, canvasH) => Record<string, MosaicMaskEntry \| null>` | Resolve a mask set to per-stable-key entries at a canvas |

---

## Specialized generators

Higher-level domain generators — open their source before use. Each family also exports lower-level helpers (encoders, check-digit / Reed–Solomon math, region locators) not listed here; see the method catalog (internal) for the full enumeration.

| Family | Primary entry points | Purpose |
|---|---|---|
| **Rank sets** | `generateRankSet(frames, mode, opts?)`, `customRankSet(ranks, modeLabel?)`, `editRankSet(base, edits, modeLabel?)`, `rankFramesFromM0(m0, opts?)` (+ `…StableKey…` variants) | Ordering overlays for ranked reveals |
| **Pixel-art / image→m0** | `classifyPixels(rgba, w, h, opts?)`, `despeckleGrid`, `labelAreas`, `binaryGridToM0`, `binaryGridToVisualDsl`/`Art`, `areaMapToVisualLabels` | Bitmap → binary grid → m0 |
| **QR** | `qrToM0(text, opts?)`, `qrToM0c`, `qrToMatrix`, `qrToRects`; payloads `qrPayload{Wifi,VCard,Mailto,Tel,Sms,Geo}`; `packDarkCells`. Channel opts (`QrChannelConfig`): `{ emit?, suppressBase? }` — `suppressBase` removes the region's cells from the base layer for callers that splice a full-coverage visual into the anchor | QR codes as m0 |
| **Barcode** | `code128Encode`, `barcodeToM0(text, opts?)`, `barcodeToM0c`, `barcodeToBars`, `barcodeToRects`, `ean13Encode`, `upcaEncode` | 1-D barcodes as m0 |

---

## Types — Builders

### Options

| Type | Fields |
|---|---|
| `ContainerAxis` | `"col" \| "row"` |
| `TileTypePrimitive` | `"F" \| "1" \| ">" \| "0" \| "-"` |
| `GridOptions` | `{ rows, cols, gutter?, outerGutters?, cellWeightBase?, outputWidth?, outputHeight? }` |
| `StripOptions` | `{ cellWeight, gutterWeight?, outerGutters?, claimant? }` |
| `WeightedSplitOptions` | `{ claimant?, claimants?, precision?, mode? }` |
| `AspectRatio` | `{ w: number; h: number }` |
| `AspectFitOptions` | `{ rootW, rootH, target, hAlign?, vAlign?, padding?, paddingLeft/Right/Top/Bottom? }` |
| `AspectFitHAlign` | `"left" \| "center" \| "right"` |
| `AspectFitVAlign` | `"top" \| "center" \| "bottom"` |
| `PlaceRectOptions` | `{ rootW, rootH, rectW, rectH, hAlign?, vAlign? }` |
| `PlaceRectHAlign` | `"left" \| "center" \| "right"` |
| `PlaceRectVAlign` | `"top" \| "center" \| "bottom"` |
| `AspectSafeGridOptions` | `{ landscapeW?, landscapeH?, portraitW?, portraitH?, minCols?, maxCols?, minRows?, maxRows?, landscapeMinRows?, landscapeMaxRows?, landscapeMinCols?, landscapeMaxCols?, portraitMinRows?, portraitMaxRows?, portraitMinCols?, portraitMaxCols?, targetCellAspectRatio?, targetCellCount?, cellCountTolerance?, letterbox?, hAlign?, vAlign?, gutter?, outerGutters?, priority? }` |
| `AspectSafeGridPriority` | `"balanced" \| "cleanPixels" \| "moreCells" \| "largerCells"` |
| `SafeCanvasOptions` | `{ cols, rows, gutter?, outerGutters?, maxWidth?, maxHeight? }` |
| `SpotlightOptions` | `{ supportCount?, arrangement?, heroWeight?, gutter? }` |
| `SpotlightArrangement` | `"bottom" \| "right" \| "l-wrap" \| "u-wrap"` |
| `ComparisonOptions` | `{ pairs?, direction?, labelSpace?, gutter? }` |
| `RankedListOptions` | `{ count?, decay?, direction?, gutter? }` |
| `RankedListDecay` | `"linear" \| "gentle" \| "steep"` |
| `SnapGridFitOptions` | `{ rootW, rootH, rows, cols, gutter?, outerGutters?, hAlign?, vAlign? }` |
| `SnapGridFindOptions` | `{ rootW, rootH, minRows?, maxRows?, minCols?, maxCols?, gutter?, … }` (search bounds over `SnapGridFitOptions`) |
| `M0FileTextOptions` | `{ size?: { width, height }, created?: Date, app?, appVersion?, … }` — `.m0`/`.m0c` file headers |
| `SvgToM0Options` | `{ packing?, output?, … }` — shared by `svgToM0` / `rectsToM0` |

### Results

| Type | Fields |
|---|---|
| `GridResult` | `{ m0, order, totalX, totalY, cellW, cellH, gutterW }` |
| `AspectFitResult` | `{ m0, frameW, frameH, totalWeight }` |
| `PlaceRectResult` | `{ m0, rectW, rectH, totalWeight }` |
| `AspectSafeGridResult` | `{ cellCount, cellAspectLogDelta, landscape: AspectSafeGridOriented, portrait: AspectSafeGridOriented }` |
| `AspectSafeGridOriented` | `{ m0, rows, cols, canvasW, canvasH, cellWPx, cellHPx, cellAspectRatio, gutterPxX, gutterPxY }` |
| `SafeCanvasResult` | `{ width, height, totalX, totalY, ppwX, ppwY, gridResult }` |
| `SpotlightResult` | `{ m0, tileCount }` |
| `ComparisonResult` | `{ m0, tileCount }` |
| `RankedListResult` | `{ m0, tileCount, weights }` |
| `SnapGridResult` | `{ m0, rectW, rectH, cellW, cellH, rows, cols, … }` (inner rect always quantization-free) |
| `SnapGridCandidate` | One enumerated snap fit (`SnapGridResult` + score/fit metadata) |
| `SvgToM0Variant` | `{ m0, … }` — one SVG/rects→m0 packing |
| `CompactDocumentOptions` | `{ m0, width, height, removeNullLayers?, pack?, preserveZOrder?, reduceSplits?, gcdDriftPercent? }` |
| `CompactDocumentResult` | `{ m0, rekey: CompactRekeyPair[], liveKeys, sourceOrder, meta }` |
| `CompactLosslessOptions` | `{ m0, width, height, removeNullLayers?, reduceSplits?, maxDriftPx? }` |
| `CompactLosslessResult` | `{ m0, keysStable, rekey: CompactRekeyPair[], liveKeys, meta }` |
| `CompactRekeyPair` | `{ from: string; to: string }` |

## Types — Transforms

| Type | Fields |
|---|---|
| `TransformTarget` | `{ by: "logicalIndex"; index } \| { by: "span"; span } \| { by: "stableKey"; key }` |
| `SplitOptions` | `{ axis, count, weights?, weightMode? }` |
| `MeasureSplitOptions` | `{ axis, count, ranges: MeasureRange[] }` |
| `MeasureRange` | `{ a: number; b: number }` — kept region within measure split |
| `ReduceSplitCountsOptions` | `{ width, height, maxDriftPx?, output? }` |
| `ReduceSplitCountsResult` | `{ m0, reduced: { stableKey, from, to }[], skipped: { stableKey, from, gcd }[], maxDriftPx }` |

## Types — Queries

| Type | Fields |
|---|---|
| `M0Canvas` | `{ width: number; height: number }` |
| `QuantizationSpreadResult` | `{ maxSpreadPx, worstLogicalIndex }` |
| `M0Evaluation` | `{ canvas, dslLength, feasibility, feasible, precision, meetsPrecision, recommendedMin, frameCount, passthroughCount, nullCount, groupCount, nodeCount, maxSpreadPx }` |
| `M0MetricDirection` | `"lower" \| "higher" \| "context"` |
| `M0MetricComparison` | `{ key, a, b, betterWhen, winner }` |
| `M0Side` | `{ perCanvas, worstSpreadPx, anyInfeasible, anyBelowPrecision }` |
| `M0Comparison` | `{ canvases, a, b, comparable, geometricallyEqual, recommendation, metrics, directionalWins, notes }` |
| `QueryOptions` | `{ width?: number; height? : number }` — canvas used during parse (default 1920×1080) |
| `EditorPredicate` | `(frame: EditorFrame, ctx: QueryContext) => boolean` |
| `EditorMapper<T>` | `(frame: EditorFrame, ctx: QueryContext) => T` |
| `FrameQuery` | Fluent walker (class): `.editor()` / `.render()` / `.logical()` / `.within(filter)` |

`EditorFrame` / `RenderFrame` / `LogicalFrame` / `StableKey` / `M0Rect` / `M0Span` are re-exported from `@m0saic/dsl` — see that package for their shapes.

## Types — Pipelines & scale

| Type | Shape |
|---|---|
| `Pipe` | Fluent transform-chain wrapper (one method per transform, `.value()` to unwrap) |
| `History` | Undo/redo stack (`.apply()` / `.undo()` / `.redo()` / `.value()`) |
| `M0Transform` | `(m0: string) => string` |
| `WithInverseResult` | `{ m0: string; inverse: M0Transform }` |
| `LinearScaleOptions` | `{ beginAtZero?: boolean; maxTicks?: number; min?: number; max?: number }` |
| `LinearScale` | `{ min, max, step, ticks: number[] }` |
