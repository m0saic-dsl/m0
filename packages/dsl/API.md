# @m0saic/dsl — API Reference

Zero-dependency core parser, validator, and algebra for the m0 layout DSL.

```
npm install @m0saic/dsl
```

---

## Validation

| Function | Signature | Description |
|---|---|---|
| `validateM0String` | `(input: string) => M0ValidationResult` | `{ ok: true }` or `{ ok: false, error }` with code, position, span. Never throws. |
| `isValidM0String` | `(input: string) => boolean` | Boolean shorthand. |

Canonicalizes first (whitespace + aliases), then validates. O(n).

**Error codes:** `OVERLAY_CHAIN`, `INVALID_CHAR`, `UNBALANCED`, `TOKEN_RULE`, `TOKEN_COUNT`, `ILLEGAL_ONE_SPLIT`, `INVALID_EMPTY`, `PASSTHROUGH_TO_NOTHING`, `NO_SOURCES`, `ZERO_SOURCE_OVERLAY`, `SPLIT_EXCEEDS_AXIS`.

**Error specs:**

| Export | Kind | Description |
|---|---|---|
| `M0_VALIDATION_ERROR_SPECS` | const | Record of all error codes → `{ kind, defaultMessage }` |
| `makeValidationError` | function | `(args) => M0ValidationError` — factory helper |

**Types:**

| Type | Shape |
|---|---|
| `M0ValidationResult` | `{ ok: true } \| { ok: false; error: M0ValidationError }` |
| `M0ValidationError` | `{ code, kind, message, span, position, details? }` |
| `M0ValidationErrorCode` | `keyof typeof M0_VALIDATION_ERROR_SPECS` |
| `M0ValidationErrorKind` | `"SYNTAX" \| "ANTIPATTERN" \| "SEMANTIC"` |

---

## Parsing

Choose the cheapest tier that gives you what you need.

### Tier 1 — Render frames (fastest)

```typescript
parseM0StringToRenderFrames(s: string, width: number, height: number): RenderFrame[]
```

Geometry-only. Returns rendered tile rectangles in paint order. Use for previews, feasibility checks, any path where you only need positions and sizes.

Returns `[]` on invalid input. `meta.stableKey` values are synthetic placeholders — use Tier 2+ for real stableKeys.

### Tier 2 — Logical frames

```typescript
parseM0StringToLogicalFrames(s: string, width: number, height: number): LogicalFrame[]
```

Rendered tiles in DSL source order with real stableKeys. Use when you need stable identity but don't need the full structural graph.

Returns `[]` on invalid input. Array index === logicalIndex.

### Tier 3 — Full graph

```typescript
parseM0StringToFullGraph(s: string, width: number, height: number): EditorFrame[]
```

Every structural node — root, groups, frames, passthroughs, nulls, overlay subtrees. Real `meta.stableKey` paths. Use for editor UIs that visualize split boundaries and structural hierarchy.

Returns `[]` on invalid input.

### Tier 3+ — Full graph with traversal

```typescript
parseM0StringToFullGraphWithTraversal(s: string, width: number, height: number): FullGraphWithTraversal
```

Full graph plus DFS event stream (enter/emitLeaf/exit). Use for custom renderers or analysis that walks the tree.

Returns `{ editorFrames: [], traversal: [] }` on invalid input.

### Tier 4 — Complete parse

```typescript
parseM0StringComplete(s: string, width: number, height: number, opts?: ParseM0Options): ParseM0Result
```

Everything in one call. Discriminated union result:
- `{ ok: true, ir, precision, warnings }` — `ir` contains renderFrames, editorFrames, width, height, optional traversal
- `{ ok: false, error, precision, warnings }` — error is `M0ValidationError`

`precision` and `warnings` are always present regardless of `ok`.

### Parse utilities

| Function | Signature | Description |
|---|---|---|
| `computePrecisionFromString` | `(input: string) => M0Precision` | Structural split metrics without geometry parse |
| `assertOk` | `(result: ParseM0Result) => M0IR` | Assert success, extract IR. Throws on failure. |

---

## Formatting

| Function | Signature | Description |
|---|---|---|
| `toCanonicalM0String` | `(s: string) => string` | Strip whitespace, `F`→`1`, `>`→`0`. Idempotent. |
| `toPrettyM0String` | `(s: string) => string` | Reverse: `1`→`F`, `0`→`>`. Presentation form. |

---

## Complexity

| Function | Returns | Validates? | Use for |
|---|---|---|---|
| `getComplexityMetricsFast` | `ComplexityMetrics` | No | UI badges, preflight, real-time analysis |
| `getComplexityMetrics` | `ComplexityMetrics \| null` | Yes | Validated analysis (null on invalid) |
| `getFrameCount` | `number \| null` | Yes | Rendered frame count |
| `getPassthroughCount` | `number \| null` | Yes | Passthrough leaf count |
| `getNodeCount` | `number \| null` | Yes | Total structural node count |
| `getPrecisionCost` | `number \| null` | Yes | Max split factor |

---

## Feasibility

```typescript
computeFeasibility(input: string): M0Feasibility
```

Exact minimum integer resolution where no frame gets 0 pixels. O(n) structural analysis. Throws on invalid input.

---

## Equality

| Function | Signature | Description |
|---|---|---|
| `areM0StringsCanonicalEqual` | `(a: string, b: string) => boolean` | Same normalized program? |
| `areM0StringsFrameEqual` | `(a: string, b: string) => boolean` | Same rendered geometry? |

---

## Warnings

| Export | Kind | Description |
|---|---|---|
| `M0_WARNING_SPECS` | const | Record of warning codes → `{ defaultMessage }` |
| `makeWarning` | function | `(args) => M0Warning` — factory helper |

Currently one warning code: `PRECISION_EXCEEDS_NORM`.

---

## Key Types

### Primitives

| Type | Shape |
|---|---|
| `M0String` | `string & { readonly [__m0Brand]: true }` — branded canonical string |
| `M0Axis` | `"row" \| "col"` |
| `M0NodeKind` | `"root" \| "group" \| "frame" \| "passthrough" \| "null"` |
| `M0Span` | `{ start: number; end: number }` — UTF-16 character span |
| `M0Rect` | `{ x: number; y: number; width: number; height: number }` |
| `StableKey` | `string & { __brand: "StableKey" }` — structural identity path |
| `M0Label` | `{ text: string; color?: string }` |

### Parse output

| Type | Shape |
|---|---|
| `RenderFrame` | `M0Rect & { paintOrder, logicalIndex, meta }` |
| `LogicalFrame` | `M0RectNode & { logicalIndex }` |
| `EditorFrame` | `M0RectNode & { kind, axis?, overlayDepth, nullFrame, passthroughFrame, ... }` |
| `M0RectNode` | `M0Rect & { meta: M0NodeIdentity }` |
| `M0NodeIdentity` | Discriminated by `kind` — includes stableKey, parentStableKey, structuralDepth, span |
| `M0IR` | `{ width, height, renderFrames, editorFrames, traversal? }` |
| `FullGraphWithTraversal` | `{ editorFrames: EditorFrame[], traversal: M0TraversalEvent[] }` |
| `PassthroughOwner` | `{ kind: "frame"; logicalIndex; ownerStableKey } \| { kind: "group"; ownerStableKey }` |

### Analysis

| Type | Shape |
|---|---|
| `M0Precision` | `{ maxSplitX, maxSplitY, maxSplitAny }` |
| `M0Feasibility` | `{ minWidthPx, minHeightPx }` |
| `ComplexityMetrics` | `{ frameCount, passthroughCount, nullCount, groupCount, nodeCount, precisionCost, precision }` |
| `M0ResolutionDiagnostics` | `{ tightestWidthPx, tightestHeightPx, tightestWidthStableKey, tightestHeightStableKey }` |

### Options and results

| Type | Shape |
|---|---|
| `ParseM0Options` | `{ trace?: boolean; precisionNorm?: number }` |
| `ParseM0Result` | `{ ok: true; ir; precision; warnings } \| { ok: false; error; precision; warnings }` |
| `M0WarningCode` | `"PRECISION_EXCEEDS_NORM"` |
| `M0Warning` | `{ severity, code, message, span, position, details? }` |
| `M0TraversalEvent` | Discriminated by `type`: `"enter" \| "emitLeaf" \| "exit"` |
