# Node taxonomy

The m0 DSL tree has five node types. For naming transforms, exports, and documentation, we group them into three tiers: **Node**, **Tile**, and **Frame**.

---

## All node types

| Token(s)  | Name        | Tier        | Description                                      |
|-----------|-------------|-------------|--------------------------------------------------|
| root      | Root        | Node        | The outermost container; implicit, never in DSL   |
| `N(…)`/`N[…]` | Group  | Node        | Split container with children                     |
| `0` / `>` | Passthrough | Tile        | Donates its space to the next claimant            |
| `-`       | Null        | Tile        | Consumes space as an empty gap                    |
| `1` / `F` | Frame       | Tile, Frame | Rendered leaf — holds media or overlay content    |

---

## Tiers

### Node (any node)

All five types. Use "Node" in a name when the operation can target or affect any node in the tree, including groups and the root.

Example: `replaceNodeBySpan` — replaces the body of whatever node the span points at.

### Tile (any leaf)

Passthrough, null, and frame. Use "Tile" in a name when the operation works on leaf nodes regardless of their specific type.

Example: `TileTypePrimitive` — the type representing any leaf primitive (`F`, `>`, `-`, `0`, `1`).

Example: `setTileTypeBySpan` — can change any leaf to any other leaf type via exact span.

### Frame (rendered leaf only)

Frame nodes only (`1` / `F`). Use "Frame" in a name when the operation specifically targets rendered frames and skips passthroughs and nulls.

Example: `setFrameTypeByLogicalIndex` — logical index counts only rendered frames, so this is a Frame-tier operation.

Example: `addOverlayToAllFrames` — adds overlays only to rendered frames, skipping passthroughs and nulls.

Example: `swapFramesByLogicalIndex` — swaps content between two rendered frames.

---

## Rule: Name reflects targeting, not effect

The tier in the name describes **what the operation targets**, not what it produces. `setFrameTypeByLogicalIndex` targets a frame but can change it into a passthrough or null — the name says "Frame" because only frames are selectable via logical index.

---

## Rule: LogicalIndex implies Frame tier

Logical index traversal counts only rendered frames (`1` / `F`). Any `*ByLogicalIndex` operation that selects a single target is inherently Frame-tier. See `selector-semantics.md` for counting rules.
