# DSL Performance

All core DSL operations — validation, parsing, complexity scanning,
feasibility analysis — are **O(n)** in the length of the m0 string.
There is no quadratic blowup. The language scales linearly.

## Proven scale

The test suite exercises DSL operations across four stress vectors
and verifies linear scaling at each:

### Wide flat splits

`N(1,1,...,1)` — a single split with N children.

| N | DSL chars | Frames | Validate |
|---|-----------|--------|----------|
| 100 | 200 | 100 | ~0.3ms |
| 1,000 | 2K | 1,000 | ~1ms |
| 10,000 | 20K | 10,000 | ~2ms |
| 50,000 | 100K | 50,000 | ~7ms |
| 100,000 | 200K | 100,000 | ~12ms |

### Deep nesting

`2(1,2(1,2(1,...)))` — D levels of nested splits.

| Depth | DSL chars | Frames | Validate |
|-------|-----------|--------|----------|
| 50 | 250 | 51 | ~0.3ms |
| 500 | 2.5K | 501 | ~1ms |
| 1,000 | 5K | 1,001 | ~1ms |
| 5,000 | 25K | 5,001 | ~2ms |
| 10,000 | 50K | 10,001 | ~5ms |

### Deep overlays

`1{1{1{...}}}` — D levels of nested overlay braces.

| Depth | DSL chars | Frames | Validate |
|-------|-----------|--------|----------|
| 100 | 300 | 101 | ~0.4ms |
| 1,000 | 3K | 1,001 | ~1ms |
| 5,000 | 15K | 5,001 | ~1ms |
| 10,000 | 30K | 10,001 | ~3ms |

### Giant frame output

`N[N(1,...,1), ...]` — NxN uniform grid producing N^2 rendered frames.

| Grid | Frames | DSL chars | Validate | Render |
|------|--------|-----------|----------|--------|
| 10x10 | 100 | 243 | ~0.3ms | ~1ms |
| 50x50 | 2,500 | 5K | ~2ms | ~5ms |
| 100x100 | 10,000 | 20K | ~2ms | ~10ms |
| 200x200 | 40,000 | 81K | ~5ms | ~50ms |
| 316x316 | ~100K | ~200K | - | - |

### Production fixture (m0saic M logo)

A real 33-frame production layout (36K chars, 17K nodes including
16K passthroughs) tiled NxN to stress real-world complexity:

| Tile | DSL chars | Nodes | Frames | Validate | Render |
|------|-----------|-------|--------|----------|--------|
| 1x1 | 36K | 18K | 33 | ~7ms | ~36ms |
| 2x2 | 145K | 72K | 132 | ~7ms | ~99ms |
| 3x3 | 326K | 162K | 297 | ~17ms | ~197ms |
| 4x4 | 579K | 288K | 528 | ~27ms | ~461ms |
| 5x5 | 905K | 450K | 825 | ~49ms | ~891ms |
| 6x6 | 1.3M | 647K | 1,188 | ~76ms | ~1s |

### Production-scale regression (10K nodes)

A 100x100 passthrough-heavy layout (~10K total nodes, 100 rendered frames):

| Operation | Threshold |
|-----------|-----------|
| Validate | < 100ms |
| Render frames | < 100ms |
| Full graph | < 500ms |
| 2x input ≈ 2x time | ratio < 10x |

*Timings measured on a single-threaded Node.js process. Hardware-dependent
but relative scaling holds across machines.*

## Scaling linearity

The test suite explicitly verifies that operations scale linearly,
not quadratically:

- **10x input ≈ 10x time** (validation, parsing) — ratio capped at 30x
- **4x4 vs 1x1** tiled M — render time ratio capped at 40x (16x linear)
- **6x6 vs 1x1** tiled M — validation ratio capped at 80x (36x linear)
- **2x input vs 1x input** — full graph ratio capped at 10x (4x linear)

Thresholds are generous (10x+ headroom) to absorb CI variance.
The point is to catch O(n^2) regressions, not benchmark exact milliseconds.

## Complexity scanning

`getComplexityMetricsFast` is always faster than validation — it skips
the structural index and only scans for node counts and precision.
This is verified at every scale in the test suite.

## Parse tiers (pick the cheapest that answers your question)

Not every caller needs the full structural graph. The parser exposes tiers
that trade materialization cost for detail:

| Tier | Function | Materializes | Keys | Use for |
|------|----------|--------------|------|---------|
| Validate | `isValidM0String` | nothing | — | accept/reject a string |
| Geometry | `parseM0StringToRenderFrames` | rendered frames only | synthetic (`f0`,`f1`…) | render plan, counts, feasibility |
| Render-only | `parseM0StringComplete(…, { materialize: "renderOnly" })` | rendered frames + real-key identity map + spans | **real** | editor canvas / previews / editing surfaces that need stable identity (and the splice anchor) but not passthrough/null |
| Full | `parseM0StringComplete` (default) | **every** node + spans + passthrough owners | real | structural editing, tree dock, inspection |

`parseM0StringToLogicalFrames` is the render-only tier in source order.

The engine geometry walk (resolving every node's rect) is unavoidable and
shared by all tiers — you must walk the whole string to place the tiles. What
the tiers skip is **materialization**: the per-node `EditorFrame` objects and
the passthrough-owner DFS. `renderOnly` additionally **prunes the identity
walk** — it builds real stableKeys only along rendered-frame ancestor paths,
never for the spacer subtrees it wouldn't return (keys stay byte-identical). On
the 1M fixture that cut the identity pass from ~1.4s to ~0.14s, leaving
`renderOnly` essentially geometry-bound. On passthrough/null-dense layouts
(total nodes N ≫ rendered frames R) this saved work dominates.

**Spans are free.** Source spans (`meta.span` — the splice anchor for
drag-to-frame, rect-edit-by-span, and the structural tree) are captured during
the engine's existing offset-based parse walk and read straight off each frame.
There is no separate span scan, so both tiers carry spans at no extra cost.
(Removing the old second-pass scan also made the **full** tier ~1.75× faster:
the 1M-char fixture below dropped from ~7.7s to ~4.4s.)

## Extreme scale (1M–10M chars)

Measured on a single Node.js process, one parse mode per process (M-series,
node 20). Indicative — reproduce with `npm run test:stress`. The dense generator
is one N-way split of `0,1,-` groups (~1/3 rendered), so total nodes ≈ 3× chars/18.
`render-only` and `full` both include spans (free, engine-captured).

| chars | nodes | rendered | validate | geometry | render-only | full |
|-------|-------|----------|----------|----------|-------------|------|
| 1.0M  | 0.5M  | 167K  | 87ms   | 0.46s | 1.0s  | 1.3s  |
| 3.0M  | 1.5M  | 500K  | 235ms  | 1.5s  | 3.3s  | 4.9s  |
| 5.0M  | 2.5M  | 833K  | 395ms  | 2.6s  | 6.7s  | OOM* |
| 7.0M  | 3.5M  | 1.17M | 505ms  | 3.9s  | 10.5s | **OOM** |
| 10.0M | 5.0M  | 1.67M | 735ms  | 6.3s  | **OOM** | **OOM** |

\* `full` at 5M (2.5M nodes) sits on the ~2.5M-node memory edge — OK with a
raised heap (`--max-old-space-size=4096`), OOMs at the default ~2 GB worker.

Validate, geometry, and render-only stay ~linear in chars. The **full** tier
inflates super-linearly at the top (1M→1.3s but 10M→tens of seconds at a raised
heap) as the per-passthrough owner work and heavy GC near the memory ceiling
pile up. The hard failures are **memory**, not CPU.

## The real limitations

CPU is never the wall — every operation is O(n). **Memory is**, and it is
tiered by how much each parse materializes. Against the **default ~2 GB Node
heap**:

- **Validation** — no graph; effectively unbounded for any practical layout.
- **Geometry parse** — materializes only the rendered frames; scales past
  **10M chars** (~1 GB). The most scalable tier that returns data.
- **Render-only** — prunes the identity walk, so it stores only **R** rendered
  identities, not one per node. Its memory is dominated by the engine frame list
  + `childrenOf` (both O(total nodes)), so its ceiling now tracks the geometry
  tier rather than the full identity map. Spans ride on the frames the parse
  already builds, so they don't move the ceiling either.
- **Full** — builds an `EditorFrame` per node plus spans + passthrough-owner
  DFS: OOMs around **~3M nodes** at 2 GB (OK at 2.5M, fails at 3.5M).

Raising the cap with `--max-old-space-size=4096` clears 10M for every tier
(full at 10M: ~54s, ~1 GB steady-state; render-only: ~17s). The Electron app
and CLI can set this; plain `node`/jest workers default to ~2 GB.

Two more limits are about feasibility, not size:

- **Split feasibility** — a split can't exceed its axis in pixels
  (`SPLIT_EXCEEDS_AXIS`). A 1920-way split needs ≥1920px on that axis.
- **Precision** — `precisionCost` is the largest split factor; layouts near
  the canvas resolution sit at the feasibility edge (the 1M-char bg-pattern
  fixture has `maxSplit 1920` and `minWidth 1898` on a 1920px canvas).

## What this means in practice

Real hand-authored layouts sit far below every ceiling. The largest real
fixture in the suite — `bg-pattern-1m.m0`, a 1080p background pattern of
**1,066,527 chars / 532,330 nodes (530,754 passthroughs) but only 226
rendered tiles** — full-parses in ~4.4s and render-only-parses in ~3.3s (spans
included, byte-identical to full), both well inside the default heap. Render-only
there collapses materialization from **532,330 nodes to 226** with
byte-identical stableKeys, and is now ~95% engine-geometry time — the identity
walk is pruned to the 226 rendered paths (~0.14s). The remaining wall is placing
half a million rectangles, which is the floor for this (maximally verbose)
encoding: the lever past it is **compacting the DSL**, not a faster parser.

The ceilings only bite synthetic multi-million-node strings. For those, drop to
the geometry tier (scales past 10M at default heap) or raise the heap cap.

