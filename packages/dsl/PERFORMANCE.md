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

## What this means

A m0 string with 1 million characters parses in seconds, not minutes.
There is no layout too large for the parser. The practical limit is
memory (for the output frame arrays), not CPU time.

