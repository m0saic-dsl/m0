# @m0saic/dsl-stdlib — API Reference

Builders, transforms, queries, and construction helpers for the m0 DSL.

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
| `aspectSafeGrid` | `(opts: AspectSafeGridOptions) => AspectSafeGridResult` | Grid with zero distortion across landscape + portrait |
| `safeCanvas` | `(opts: SafeCanvasOptions) => SafeCanvasResult` | Largest canvas where a guttered grid has zero rounding |
| `spotlight` | `(opts?: SpotlightOptions) => SpotlightResult` | Hero tile with weighted supporting tiles |
| `comparison` | `(opts?: ComparisonOptions) => ComparisonResult` | Side-by-side or stacked A/B pairs |
| `rankedList` | `(opts?: RankedListOptions) => RankedListResult` | Weighted stack with progressive size decay |
| `bentoGrid` | `(opts?: BentoGridOptions) => BentoGridResult` | Curated irregular grid patterns |

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

### Non-targeted transforms

| Function | Signature | Description |
|---|---|---|
| `addOverlayToAllFrames` | `(m0: string, opts?) => string` | Add overlay to every rendered frame |
| `rewriteOverlayChains` | `(s: string) => string` | Collapse `}{` chains into nested `{...{...}}` form. Idempotent. |

---

## Queries

| Function | Signature | Description |
|---|---|---|
| `hasOverlayAtSpan` | `(m0: string, span: M0Span) => boolean` | Check if node at span has an overlay |

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
| `AspectSafeGridOptions` | `{ landscapeW?, landscapeH?, portraitW?, portraitH?, minCols?, maxCols?, minRows?, maxRows?, gutter?, outerGutters?, priority? }` |
| `AspectSafeGridPriority` | `"balanced" \| "cleanPixels" \| "moreCells" \| "largerCells"` |
| `SafeCanvasOptions` | `{ cols, rows, gutter?, outerGutters?, maxWidth?, maxHeight? }` |
| `SpotlightOptions` | `{ supportCount?, arrangement?, heroWeight?, gutter? }` |
| `SpotlightArrangement` | `"bottom" \| "right" \| "l-wrap" \| "u-wrap"` |
| `ComparisonOptions` | `{ pairs?, direction?, labelSpace?, gutter? }` |
| `RankedListOptions` | `{ count?, decay?, direction?, gutter? }` |
| `RankedListDecay` | `"linear" \| "gentle" \| "steep"` |
| `BentoGridOptions` | `{ base?, variant? }` |
| `BentoBase` | `"3x3" \| "4x3" \| "4x4"` |

### Results

| Type | Fields |
|---|---|
| `GridResult` | `{ m0, order, totalX, totalY, cellW, cellH, gutterW }` |
| `AspectFitResult` | `{ m0, frameW, frameH, totalWeight }` |
| `PlaceRectResult` | `{ m0, rectW, rectH, totalWeight }` |
| `AspectSafeGridResult` | `{ m0, rows, cols, cellCount, cellW, cellH, gutterW, gutterRatio, ppwLandscape, ppwPortrait, gridResult }` |
| `SafeCanvasResult` | `{ width, height, totalX, totalY, ppwX, ppwY, gridResult }` |
| `SpotlightResult` | `{ m0, tileCount }` |
| `ComparisonResult` | `{ m0, tileCount }` |
| `RankedListResult` | `{ m0, tileCount, weights }` |
| `BentoGridResult` | `{ m0, tileCount, base, variant }` |

## Types — Transforms

| Type | Fields |
|---|---|
| `TransformTarget` | `{ by: "logicalIndex"; index } \| { by: "span"; span } \| { by: "stableKey"; key }` |
| `SplitOptions` | `{ axis, count, weights?, weightMode? }` |
| `MeasureSplitOptions` | `{ axis, count, ranges: MeasureRange[] }` |
| `MeasureRange` | `{ a: number; b: number }` — kept region within measure split |
