# @m0saic/dsl

The **m0saic DSL** is a deterministic, context-free language for describing recursive spatial decompositions of a rectangle. It encodes layout as structure — not configuration.

```
npm install @m0saic/dsl
```

Zero dependencies.

---

## Where this fits

```
              @m0saic/dsl            <── you are here
        the language core (zero deps)
      grammar, parser, validator, types
                    |
      +-------------+-------------+
      |                           |
  @m0saic/dsl-         @m0saic/dsl-stdlib
  file-formats           builders, transforms
  .m0  .m0c              authoring toolkit
      |                           |
      +-------------+-------------+
                    |
            @m0saic/dictionary
         curated entries + generators
```

---

## The language

A m0 string describes how a rectangle is recursively subdivided.

```
  2(1,1)              two columns
  3[1,1,1]            three rows
  2(1,3[1,1,1])       left tile + right column of 3 rows
  1{1}                tile with overlay
  3(0,0,1)            passthrough — all space donated to last tile
  3(1,-,1)            null gap in the middle
```

### Tokens

```
  1  (or F)     tile — claims one slot, consumes one source
  0  (or >)     passthrough — donates space to next claimant
  -             null — claims space, renders nothing
  N(...)        horizontal split into N children (left → right)
  N[...]        vertical split into N children (top → bottom)
  X{Y}          overlay — Y composited on top of X, same rect
```

### Properties

```
  deterministic         same string + same resolution = same geometry, always
  context-free          no ambient state, no identifier resolution
  linear-time parse     O(n) validation, O(n) feasibility, O(n) parse
  composable            any valid string embeds inside any other
  resolution-independent  geometry adapts to container size
  no temporal concepts    geometry and time are orthogonal
```

### Grammar rules

```
  1( and 1[ are illegal             ILLEGAL_ONE_SPLIT
  }{ is illegal (overlay chains)    OVERLAY_CHAIN — normalize with dsl-stdlib
  trailing 0 is illegal             PASSTHROUGH_TO_NOTHING
  empty layouts are illegal         NO_SOURCES
  empty overlay bodies illegal      ZERO_SOURCE_OVERLAY
  whitespace is stripped globally
  aliases normalized: F→1, >→0      canonical form
```

---

## API overview

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                        @m0saic/dsl                              │
  │                                                                 │
  │  VALIDATE              PARSE                 FORMAT             │
  │  ─────────             ─────                 ──────             │
  │  validateM0String  parseM0StringTo      toCanonicalM0String │
  │  isValidM0String   RenderFrames          toPrettyM0String    │
  │                        LogicalFrames                            │
  │                        FullGraph             EQUALITY           │
  │                        FullGraphWith         ────────           │
  │  COMPLEXITY            Traversal             areM0Strings       │
  │  ──────────            Complete              CanonicalEqual     │
  │  getComplexityMetrics                        areM0Strings       │
  │  getComplexityMetrics  FEASIBILITY           FrameEqual         │
  │  Fast                  ───────────                              │
  │  getFrameCount         computeFeasibility    HELPERS            │
  │  getPassthroughCount   computePrecision      ───────            │
  │  getNodeCount          FromString            assertOk           │
  │  getPrecisionCost                                               │
  └─────────────────────────────────────────────────────────────────┘
```

---

## Validation

```typescript
import { validateM0String, isValidM0String } from "@m0saic/dsl";

// Boolean check
isValidM0String("2(1,1)");    // true
isValidM0String("1(1)");      // false — ILLEGAL_ONE_SPLIT

// Structured result
const result = validateM0String("2(1,1,1)");
if (!result.ok) {
  console.log(result.error.code);      // "TOKEN_COUNT"
  console.log(result.error.kind);      // "SEMANTIC"
  console.log(result.error.position);  // exact character offset
  console.log(result.error.span);      // { start, end }
}
```

All validation is O(n). Canonicalizes input first (whitespace + aliases).

### Error codes

```
  SYNTAX errors           SEMANTIC errors          ANTIPATTERN errors
  ─────────────           ───────────────          ──────────────────
  INVALID_CHAR            TOKEN_COUNT              PASSTHROUGH_TO_NOTHING
  INVALID_EMPTY           NO_SOURCES               ILLEGAL_ONE_SPLIT
  UNBALANCED              ZERO_SOURCE_OVERLAY      SPLIT_EXCEEDS_AXIS
  TOKEN_RULE              OVERLAY_CHAIN
```

Each error includes `code`, `kind`, `message`, `position`, and `span`.

---

## Parsing

Three tiers. Choose the cheapest that gives you what you need.

### Tier 1: Render frames (fastest)

```typescript
import { parseM0StringToRenderFrames } from "@m0saic/dsl";

const frames = parseM0StringToRenderFrames("2(1,1)", 1920, 1080);
// [
//   { x: 0, y: 0, width: 960, height: 1080, paintOrder: 0, logicalIndex: 0, meta: {...} },
//   { x: 960, y: 0, width: 960, height: 1080, paintOrder: 1, logicalIndex: 1, meta: {...} },
// ]
```

End geometry only. Synthetic stableKeys (`f0`, `f1`). Use for previews, thumbnails, feasibility checks.

### Tier 2: Logical frames (with identity)

```typescript
import { parseM0StringToLogicalFrames } from "@m0saic/dsl";

const frames = parseM0StringToLogicalFrames("2(1,1)", 1920, 1080);
// Real stableKeys, parent keys, spans. Source-order (logicalIndex).
```

Use for templates, builders, anything needing stable identity.

### Tier 3: Full structural graph

```typescript
import { parseM0StringComplete, assertOk } from "@m0saic/dsl";

const result = parseM0StringComplete("2(1,1)", 1920, 1080);
assertOk(result);  // type-narrows to success

result.ir.renderFrames;     // RenderFrame[] in paint order
result.ir.editorFrames;     // EditorFrame[] — ALL nodes (root, groups, frames, passthroughs, nulls)
result.precision;           // M0Precision
result.warnings;            // M0Warning[]
```

Use for editor, inspector, tree dock, structural analysis.

---

## String formatting

```typescript
import { toCanonicalM0String, toPrettyM0String } from "@m0saic/dsl";

toCanonicalM0String("2( F, F )");  // "2(1,1)"  — canonical form
toPrettyM0String("2(1,0,1)");      // "2(F,>,F)" — presentation form
```

Canonical form: no whitespace, `1` not `F`, `0` not `>`.

---

## Complexity analysis

Two paths — choose based on your constraints:

```
  getComplexityMetricsFast(s)     getComplexityMetrics(s)
  ──────────────────────────      ──────────────────────
  never validates                 validates first
  never returns null              returns null if invalid
  never throws                    never throws
  < 1ms on any input              ~13ms for 130K chars
  use for: UI, badges,            use for: reports,
  real-time keystroke analysis    validated analysis
```

```typescript
import { getComplexityMetricsFast } from "@m0saic/dsl";

const m = getComplexityMetricsFast("3[2(1,1),2(1,1),2(1,1)]");
// {
//   frameCount: 6,
//   passthroughCount: 0,
//   nullCount: 0,
//   groupCount: 4,
//   nodeCount: 10,
//   precisionCost: 3,
//   precision: { maxSplitX: 2, maxSplitY: 3, maxSplitAny: 3 }
// }
```

---

## Feasibility analysis

Exact minimum resolution at which a layout is parseable (no 0-size frames).

```typescript
import { computeFeasibility } from "@m0saic/dsl";

computeFeasibility("2(5(1,1,1,1,1),5(1,1,1,1,1))");
// { minWidthPx: 10, minHeightPx: 1 }
// nested: outer 2-split × inner 5-split = 10 minimum width

computeFeasibility("3[3(1,1,1),3(1,1,1),3(1,1,1)]");
// { minWidthPx: 3, minHeightPx: 3 }
```

O(n) structural analysis — no repeated parse probing.

### Precision vs Feasibility

```
  M0Precision                    M0Feasibility
  (structural split metrics)         (exact minimum resolution)
  ──────────────────────             ─────────────────────────
  maxSplitX: 5                       minWidthPx: 10
  maxSplitY: 1                       minHeightPx: 1
  maxSplitAny: 5

  O(n) character scan                O(n) structural analysis
  single-level max                   accounts for nesting
  cheap, always available            exact, authoritative
```

Use `computePrecisionFromString` for quick structural metrics.
Use `computeFeasibility` for exact minimum pixel dimensions.

---

## Equality

```typescript
import { areM0StringsCanonicalEqual, areM0StringsFrameEqual } from "@m0saic/dsl";

// Same canonical program?
areM0StringsCanonicalEqual("2(F,F)", "2(1,1)");  // true

// Same rendered geometry?
areM0StringsFrameEqual("1", "2(0,1)");      // true
```

Frame equality parses both strings at the maximum of their feasibility requirements and compares all frame rects.

---

## Key types

### RenderFrame

```
  RenderFrame
  +-- x, y, width, height        pixel geometry
  +-- paintOrder: number          0-based, back to front
  +-- logicalIndex: number        0-based, DFS source order
  +-- meta: M0NodeIdentity    stableKey, parentStableKey, span
```

### EditorFrame

```
  EditorFrame
  +-- x, y, width, height        pixel geometry
  +-- kind: M0NodeKind        "root" | "group" | "frame" | "passthrough" | "null"
  +-- axis?: M0Axis           "row" | "col" (groups/root only)
  +-- overlayDepth: number        0 = base layer, 1+ = inside overlay
  +-- meta: M0NodeIdentity    stableKey, parentStableKey, structuralDepth, span
  +-- logicalIndex?: number       source index (frames only)
  +-- passthroughOwner?           which frame received donated space
```

### StableKey

Branded string encoding structural traversal path. Survives edits that don't change ancestry.

```
  r                   root
  r/growc0            first child of root, group split (row axis)
  r/growc0/fc1        second child of that group, a frame
  r/growc0/fc1/ov1c0  overlay on that frame
```

### Branded M0String

```typescript
type M0String = string & { readonly __m0Brand: unique symbol };
```

Construction contract:
1. `toCanonicalM0String(raw)` — normalize
2. `validateM0StringCanonical(canonical)` — must succeed
3. Brand the result

If input may contain overlay chains (`}{`), normalize first with `rewriteOverlayChains` from `@m0saic/dsl-stdlib`.

---

## Performance

All public functions are O(n).

```
  Operation                          130K chars / 55K nodes
  ─────────                          ──────────────────────
  getComplexityMetricsFast           < 1ms
  computeFeasibility                 < 1ms
  validateM0String               ~13ms
  parseM0StringToRenderFrames    ~400ms
  parseM0StringComplete          ~500ms
```

---

## splitEven remainder distribution

When splitting an integer pixel length into parts, remainders are distributed **outside-in**:

```
  splitEven(1080, 7)
  base = 154, remainder = 2
  distribution order: index 0, index 6, index 1, index 5, ...
  result: [155, 154, 154, 154, 154, 154, 155]
```

Symmetric from edges inward. Deterministic. Visually balanced.

---

## File formats

`.m0` and `.m0c` file format APIs are in `@m0saic/dsl-file-formats`.

```typescript
import { parseM0File, serializeM0File } from "@m0saic/dsl-file-formats";
```

---

## License

Licensed under the Apache License, Version 2.0.
See `LICENSE` and `NOTICE`.
