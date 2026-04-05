# @m0saic/dsl-stdlib

Standard library for the m0saic DSL. Builders, transforms, queries, and construction helpers.

```
npm install @m0saic/dsl-stdlib
```

Depends on `@m0saic/dsl` only.

---

## Where this fits

```
              @m0saic/dsl
        the language core (zero deps)
      grammar, parser, validator, types
                    |
      +-------------+-------------+
      |                           |
  @m0saic/dsl-         @m0saic/dsl-stdlib    <── you are here
  file-formats           builders, transforms
  .m0  .m0c              authoring toolkit
      |                           |
      +-------------+-------------+
                    |
            @m0saic/dictionary
         curated entries + generators
```

The stdlib is **additive and optional**. The core DSL defines the language; the stdlib provides tools for building and manipulating DSL strings programmatically. Nothing in stdlib changes language semantics.

---

## API overview

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                      @m0saic/dsl-stdlib                         │
  │                                                                  │
  │  CONSTRUCTORS         BUILDERS              TRANSFORMS           │
  │  ────────────         ────────              ──────────           │
  │  toM0String       container             split                │
  │  tryM0String      equalSplit            replace              │
  │                       weightedSplit         addOverlay           │
  │  QUERIES              weightedTokens        removeOverlay        │
  │  ───────              grid                  setTileType          │
  │  hasOverlayAtSpan     strip                 measureSplit         │
  │                       aspectFit             swapFrames           │
  │  NON-TARGETED         placeRect                                  │
  │  ────────────         aspectSafeGrid        All targeted ops     │
  │  addOverlayToAllFrames safeCanvas           accept a             │
  │  rewriteOverlayChains spotlight             TransformTarget      │
  │                       comparison                                 │
  │                       rankedList                                 │
  │                       bentoGrid                                  │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Constructors

### `toM0String(raw): M0String`

Canonicalize, validate, and brand a raw string. Throws on invalid input.

```typescript
import { toM0String } from "@m0saic/dsl-stdlib";

const layout = toM0String("2(F, F)");  // branded M0String: "2(1,1)"
```

### `tryM0String(raw): M0StringResult`

Same pipeline, but returns a Result instead of throwing.

```typescript
import { tryM0String } from "@m0saic/dsl-stdlib";

const result = tryM0String("2(1,1,1)");
if (result.ok) {
  console.log(result.value);  // M0String
} else {
  console.log(result.error.code);  // "TOKEN_COUNT"
}
```

```
  M0StringResult =
    | { ok: true;  value: M0String }
    | { ok: false; error: M0ValidationError }
```

Neither constructor performs overlay chain rewriting. If input may contain `}{`, call `rewriteOverlayChains` first.

---

## Builders

Builders produce validated `M0String` values from structured parameters.

### Primitives

```typescript
import { container, equalSplit, weightedSplit } from "@m0saic/dsl-stdlib";

container(["1", "1", "1"], "col");         // "3(1,1,1)"
equalSplit(4, "row");                       // "4[1,1,1,1]"
weightedSplit([2, 1, 1], "col");           // "4(0,1,0,1)"  — 2:1:1 ratio
```

```
  container(tokens, axis)                    wrap tokens in counted split
  equalSplit(count, axis, claimant?)         N equal children
  weightedSplit(weights, axis, opts?)        proportional distribution
  weightedTokens(weights, claimant?)         weight tokens without wrapping
  strip(count, axis, opts)                   linear stack with gutter control
```

### Layout builders

```typescript
import { grid, aspectFit, spotlight, bentoGrid } from "@m0saic/dsl-stdlib";
```

#### `grid(opts): GridResult`

Rectangular grid with optional gutters.

```typescript
const { m0, order } = grid({ rows: 3, cols: 4, gutter: 0.1 });
// 3 rows × 4 cols with 10% gutter
```

#### `aspectFit(opts): AspectFitResult`

Constrain content to an aspect ratio within a container.

```typescript
const { m0, frameW, frameH } = aspectFit({
  rootW: 1920, rootH: 1080,
  target: { w: 1, h: 1 },   // square
  hAlign: "center",
  vAlign: "center",
});
```

#### `placeRect(opts): PlaceRectResult`

Position a rectangle of known size within a canvas.

```typescript
const { m0 } = placeRect({
  rootW: 1920, rootH: 1080,
  rectW: 1280, rectH: 720,
  hAlign: "center", vAlign: "center",
});
```

#### `spotlight(opts): SpotlightResult`

Hero tile with supporting tiles. Four arrangements:

```
  "bottom"    hero on top, supports below
  "right"     hero on left, supports right
  "l-wrap"    hero top-left, supports in L around it
  "u-wrap"    hero top, supports in U below
```

```typescript
const { m0 } = spotlight({ supportCount: 3, arrangement: "bottom" });
```

#### `comparison(opts): ComparisonResult`

Before/after comparison pairs.

```typescript
const { m0 } = comparison({ pairs: 2, direction: "horizontal" });
// 4 tiles: 2 side-by-side pairs
```

#### `rankedList(opts): RankedListResult`

Ranked/priority list with size decay.

```typescript
const { m0 } = rankedList({ count: 5, decay: "steep", direction: "vertical" });
```

#### `bentoGrid(opts): BentoGridResult`

Curated irregular grids (Apple marketing page aesthetic).

```typescript
const { m0, tileCount } = bentoGrid({ base: "3x3", variant: 1 });
```

```
  Base sizes     Variants
  ──────────     ────────
  "3x3"          1, 2, 3
  "4x3"          1, 2
  "4x4"          1, 2
```

#### Other builders

```
  safeCanvas(opts)         canvas grid with feasibility constraints
  aspectSafeGrid(opts)     grid with aspect ratio preservation
```

---

## Transforms

Structural edits on DSL strings. Each transform accepts a `TransformTarget` to identify which node to operate on:

```typescript
type TransformTarget =
  | { by: "logicalIndex"; index: number }   // 0-based rendered frame index
  | { by: "span"; span: { start: number; end: number } }  // character span
  | { by: "stableKey"; key: string };       // structural identity path
```

### `split(m0, target, opts)`

Split a tile into N children along an axis.

```typescript
import { split } from "@m0saic/dsl-stdlib";

// Split the first frame into 3 columns
split(m0, { by: "logicalIndex", index: 0 }, { axis: "col", count: 3 });

// With weights
split(m0, { by: "span", span }, { axis: "row", count: 2, weights: [2, 1] });
```

### `replace(m0, target, replacement)`

Replace a node with a new DSL fragment.

```typescript
import { replace } from "@m0saic/dsl-stdlib";

replace(m0, { by: "stableKey", key: stableKey }, "3(1,1,1)");
```

### `addOverlay(m0, target)` / `removeOverlay(m0, target)`

Add or remove an overlay `{1}` on a node. No-op if already present/absent.

```typescript
import { addOverlay, removeOverlay } from "@m0saic/dsl-stdlib";

addOverlay(m0, { by: "span", span });
removeOverlay(m0, { by: "stableKey", key: stableKey });
```

### `setTileType(m0, target, type)`

Change a leaf node's type (`"1"`, `"0"`, `"-"`, `"F"`, `">"`).

```typescript
import { setTileType } from "@m0saic/dsl-stdlib";

setTileType(m0, { by: "logicalIndex", index: 2 }, "-");
```

### `measureSplit(m0, target, opts)`

Replace a tile with a measure-mode split (kept regions within N slots).

```typescript
import { measureSplit } from "@m0saic/dsl-stdlib";

measureSplit(m0, { by: "logicalIndex", index: 0 }, {
  axis: "col", count: 4,
  ranges: [{ start: 1, end: 3 }],
});
```

### `swapFrames(m0, indexA, indexB)`

Atomically swap two rendered frames (including overlays). Addressed by logical index only.

```typescript
import { swapFrames } from "@m0saic/dsl-stdlib";

swapFrames(m0, 0, 2);
```

### Non-targeted transforms

```typescript
import { addOverlayToAllFrames, rewriteOverlayChains } from "@m0saic/dsl-stdlib";

addOverlayToAllFrames(m0);         // overlay every rendered frame
rewriteOverlayChains("1{1}{1}");   // → "1{1{1}}"  (collapse chains)
```

---

## Overlay Chain Rewriting

`rewriteOverlayChains` collapses overlay chains (`}{`) into nested form. The DSL validator rejects `}{` — this helper is required preprocessing for generated/intermediate strings.

```
  Input                    Output
  ─────                    ──────
  X{A}{B}                  X{A{B}}
  X{A}{B}{C}               X{A{B{C}}}
```

Idempotent. Already-nested strings pass through unchanged. Not part of the DSL language — it is a preprocessing helper for composition/flattening pipelines.

```typescript
import { rewriteOverlayChains, toM0String } from "@m0saic/dsl-stdlib";

const raw = rewriteOverlayChains("1{1}{1}");  // "1{1{1}}"
const branded = toM0String(raw);            // validated + branded
```

---

## Queries

```typescript
import { hasOverlayAtSpan } from "@m0saic/dsl-stdlib";

hasOverlayAtSpan("1{1}", { start: 0, end: 3 });  // true
```

---

## Types

```typescript
import type {
  // Constructors
  M0StringResult,

  // Transforms
  TransformTarget,       // { by: "logicalIndex" | "span" | "stableKey", ... }
  SplitOptions,
  MeasureSplitOptions,
  MeasureRange,

  // Builder primitives
  ContainerAxis,         // "col" | "row"
  WeightedSplitOptions,
  TileTypePrimitive,     // "F" | "1" | ">" | "0" | "-"

  // Builder options / results
  GridOptions,
  GridResult,
  StripOptions,
  AspectRatio,           // { w: number; h: number }
  AspectFitOptions,
  AspectFitResult,
  AspectFitHAlign,       // "left" | "center" | "right"
  AspectFitVAlign,       // "top" | "center" | "bottom"
} from "@m0saic/dsl-stdlib";
```

`ContainerAxis` is structurally identical to `M0Axis` from `@m0saic/dsl` (`"col" | "row"`). They are interchangeable via TypeScript structural typing.

---

## Design principles

- **Additive only** — stdlib never changes DSL semantics
- **All builders validate** — every builder returns a branded `M0String` (validation overhead is < 25us)
- **No implicit rewrites** — overlay chain rewriting is explicit, never automatic
- **One function, three addressing schemes** — every transform takes a `TransformTarget` discriminated union: `logicalIndex` for arrays, `span` for text editors, `stableKey` for structural operations
- **Deterministic output** — same params always produce the same DSL string

---

## License

Licensed under the Apache License, Version 2.0.
See `LICENSE` and `NOTICE`.
