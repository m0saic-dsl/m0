# Selector semantics

Every transform in dsl-stdlib uses one of three selector strategies. Each has distinct scope, counting rules, and use cases.

---

## LogicalIndex

Selects the Nth **rendered tile** in traversal order.

Counting rules:
- `1` / `F` — increments the counter
- `0` / `>` — skipped (passthrough)
- `-` — skipped (null)
- Groups — traversed recursively, not counted
- Overlays — traversed recursively, tiles inside count

Return type: `string | null` — returns `null` if the index doesn't exist.

Use cases:
- User-facing tile selection (tile 0, tile 1, ...)
- Bulk operations on rendered tiles

---

## Span

Selects by exact UTF-16 source offsets in the **canonical** string.

Properties:
- `{ start: number; end: number }` — half-open range `[start, end)`
- Comes from `EditorFrame.meta.span`
- Can target **any** leaf primitive: tiles, passthroughs, nulls, groups
- Always operates on the canonical form (input is canonicalized first)

Return type: `string` — always succeeds if the span is valid.

Use cases:
- Editor interactions where the parser has resolved the target
- Precise source-level operations

---

## StableId

Selects by structural identity key.

Implementation pattern (always the same):
```
stableKey → parse frames → find target → extract span → delegate to Span variant
```

Properties:
- Uses `SAFE_PARSE_CANVAS` for structural parsing (no rendering precision needed)
- Throws if the stableKey is not found or has no span

Return type: `string` — throws on failure.

Use cases:
- Identity-stable operations that survive edits
- Operations driven by tree/inspector UI

---

## Rule: Do not mix selector semantics

Each selector has a clear domain:
- **LogicalIndex** counts rendered tiles only
- **Span** is exact source targeting
- **StableId** is identity-based, always resolves to span

A function that "mostly uses logical index but falls back to span" is a design error. Pick one selector per function.

---

## Rule: StableId is always a thin resolver

StableId variants must contain **zero** transform logic. Their only job is:
1. Canonicalize
2. Parse
3. Find
4. Extract span
5. Delegate

All behavior lives in the Span variant.
