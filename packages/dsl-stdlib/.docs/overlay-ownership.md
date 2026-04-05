# Overlay ownership

Overlays (`{...}`) are visual layers attached to nodes. The ownership model is simple and strict.

---

## Rule: Overlays are owned by the node immediately before them

```
1{F}        ← the overlay {F} belongs to the tile 1
2(1,1){F}   ← the overlay {F} belongs to the group 2(1,1)
```

The `{` must appear at exactly `span.end` of the owning node. There is no other attachment mechanism.

---

## Rule: Add overlay

`addOverlay*` attaches `{F}` to a node.

Behavior:
- If no overlay exists → insert `{F}` at `span.end`
- If overlay already exists → **no-op** (return unchanged)

The no-op rule prevents double-wrapping. UI may navigate into the existing overlay instead.

---

## Rule: Remove overlay

`removeOverlay*` detaches the `{...}` block from a node.

Behavior:
- If overlay exists → remove everything from `{` to matching `}`
- If no overlay exists → **no-op** (return unchanged)

---

## Rule: Replace preserves overlay

`replaceNodeBySpan` (and all selectors that delegate to it) preserves the overlay owned by the replaced node.

```
replaceNodeBySpan("1{F}", {start:0, end:1}, "2(1,1)")
→ "2(1,1){F}"
```

The span identifies the **node body** only. The overlay is detached, the body is replaced, and the overlay is reattached to the replacement.

---

## Rule: Split preserves overlay

`splitBySpan` delegates through `replaceNodeBySpan`, so overlay preservation is automatic.

```
splitBySpan("1{F}", {start:0, end:1}, "col", 2)
→ "2(1,1){F}"
```

---

## Rule: Swap moves overlays with their tiles

`swapFramesByLogicalIndex` treats the overlay as part of the frame's content. When two frames are swapped, each frame's overlay travels with it.

```
swapFramesByLogicalIndex("2(1{F},1)", 0, 1)
→ "2(1,1{F})"
```

This is intentionally different from `replaceNodeBySpan`, which preserves the *destination's* overlay. Swap is a content-level operation, not a position-level one.

---

## Rule: Add overlay to all tiles does not recurse into overlay bodies

`addOverlayToAllFrames` adds `{F}` to every rendered frame that does not already own an overlay. It recurses into classifier bodies `(...)` / `[...]` but **not** into overlay bodies `{...}` — existing overlay content is preserved verbatim.

```
addOverlayToAllFrames("2(1,1){1}")
→ "2(1{1},1{1}){1}"    ← group overlay body untouched
```

This prevents recursive overlay injection into content that is already overlaid.

---

## Rule: Overlay operations are owner-based, not view-based

Never "remove the current layer" or "add overlay to what I see". Always operate on the **owner node**.

The owner is identified by its span, stableKey, or logical index — not by the current viewport depth or visual state.
