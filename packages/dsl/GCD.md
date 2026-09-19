# GCD compression in m0

> **GCD is the most important property in m0.** The DSL char count and feasibility of any layout is governed by the greatest common divisor of its section sums. Everything else — drift, packing, encoder design, asset preparation — exists to maximize that GCD.

This document is a reference for how GCD relates to m0 efficiency, what makes it large or small, what to compute when generating m0, and how to design assets and encoders to maximize compression while staying pixel-exact (or controllably close).

---

## 0. TL;DR

A split `N(c0, c1, ..., cN-1)` over a parent dimension `D` gives every cell `D/N` pixels. m0 layouts are stacks of these splits. The total DSL char count scales with the total slot count, not pixel count.

For a "place a rect on a canvas" expression with section sums `w_1, w_2, w_3` (top-null, rect, bottom-null) summing to `D`:

```
emitted_slots = D / gcd(w_1, w_2, w_3)
char_count   ≈ O(emitted_slots)
```

So **DSL size shrinks linearly with the GCD of section sums**.

The "10×" headline of the svg-to-mosaic compression work is, fundamentally, raising `gcd(sections)` from `1` to `~10`.

---

## 1. The encoding model

m0 layouts are trees of containers. Each container splits a parent rectangle into N equal slots:

- `N(c_0, ..., c_{N-1})` — horizontal split (cols), N columns of width `D/N`
- `N[c_0, ..., c_{N-1}]` — vertical split (rows), N rows of height `D/N`
- `c_i` is one of: `1` (rendered tile), `-` (null/blank), `0` (zero-frame, donates space to next claimant), or another container

The engine carves dimension `D` into `N` slots via **outside-in remainder distribution** (`splitEven` in `packages/dsl/src/parse/m0StringParser.ts`):

```
base = floor(D / N)
rem  = D - base * N        # distributed +1 to slots 0, N-1, 1, N-2, ...
```

Most slots are `base` pixels; `rem` slots get `base+1`. The "outside-in" order means edges get adjusted before centers.

**Key consequence**: when `D` is divisible by `N`, every slot is exactly `D/N` pixels with no remainder shuffling. **This is the pixel-exact case**, and it's what GCD reduction targets.

---

## 2. The GCD reduction theorem

### Statement

Given a parent dimension `D` and section sums `w_1, w_2, ..., w_k` (the contiguous pixel widths each claimant should cover), if there exists an integer `d > 0` such that:

1. `d` divides `D`
2. `d` divides every `w_i`

then encoding the section as a single split `N(...)` with `N = D/d` total slots, where each section `i` occupies `w_i / d` consecutive slots, **renders pixel-exact**: section `i` covers exactly `w_i` pixels with no rounding distortion.

### Proof

`base = floor(D / N) = floor(d) = d`. `rem = D - d * (D/d) = 0`. Every slot is exactly `d` pixels. Section `i` claims `w_i / d` slots × `d` px/slot = `w_i` pixels. ∎

### Free observation

`sum(w_i) = D` (the sections cover the whole parent), so `gcd(w_i)` automatically divides `D`. **You can always pick `d = gcd(w_1, ..., w_k)` and get a pixel-exact reduction by a factor of `d`.**

The only question is *how big `d` happens to be*.

### Example

Section sums `[56, 20, 196]` over parent `D = 272`:
- `gcd(56, 20, 196) = 4`
- Reduced slot count: `272 / 4 = 68`
- Encoded as a 68-slot split where the three sections occupy 14, 5, and 49 slots respectively
- DSL size scales with 68, not 272 — **4× compression on this axis**

---

## 3. The 3-section "place rect" structure

For a single rect at grid span `(xStart, xEnd, yStart, yEnd)` on a canvas:

```
outer_row[ topNullSum, inner_col(leftNullSum, rectColSum, rightNullSum), bottomNullSum ]
```

That's two GCD-reducible splits: row (3 sections) and col (3 sections). The two axes are independent — col GCD and row GCD multiply.

**Total DSL slot count for the layer**:

```
slots ≈ canvasH/gcd_row + canvasW/gcd_col
```

(Plus a constant for the structural braces.)

**Generalization to multi-rect packing**: K non-overlapping rects in one layer become a *union grid* — the row-band axis is the union of all rects' y boundaries, each band's col axis is the union of contained rects' x boundaries. The same per-axis GCD reduction applies to the row split AND each band's col split. Cells inside a band collapse to one of `1` (occupied), `-` (empty).

---

## 4. What makes GCD large

| Property | Effect |
|---|---|
| Grid lines aligned to a coarse common factor | High GCD per axis |
| Canvas dimension with **rich factorization** | More candidate divisors |
| Fewer distinct grid lines (sparse layout) | Easier to find a common factor |
| Canvas dim is power-of-2 or smooth (e.g. 256, 1024, 1080, 1200) | Many divisors |
| Source SVG snapped to a regular grid in step 03 | Per-rect section sums likely to share factors |

### Canvas dim factorization is destiny

| Canvas dim | Factorization | # of divisors | Useful divisors near drift budget |
|---:|---|---:|---|
| 256 | 2⁸ | 9 | 1,2,4,8,16,32,64,128,256 |
| 1024 | 2¹⁰ | 11 | dense |
| 1080 | 2³ · 3³ · 5 | 32 | very dense |
| 1008 | 2⁴ · 3² · 7 | 30 | very dense |
| 1200 | 2⁴ · 3 · 5² | 30 | very dense |
| 192 | 2⁶ · 3 | 14 | dense |
| **997** | **prime** | **2** | **only 1 and 997 — terrible** |
| 1009 | prime | 2 | terrible |

**Designing canvases at smooth-numbered sizes is the highest-leverage optimization for compression.** A 1080×1080 canvas can hit divisors like 8, 9, 10, 12, 15, 18, 20, 24, 27, 30, 36, 40, 45, 54, 60, 72, 90, 108, ... A 997×997 canvas has nothing useful between 1 and 997.

---

## 5. What kills GCD

| Problem | Mechanism |
|---|---|
| Float-precision grid lines from SVG path bounds | Random sub-pixel positions never share factors |
| One off-by-one row weight | Drops `gcd` from `d` to 1 |
| Prime canvas dimensions | No useful divisors at all |
| Too many tightly-spaced lines | Union of cell widths becomes irregular |
| Mixing letter shapes with curves at arbitrary y positions | Each shape introduces its own y boundary, fragmenting the grid |

### The float noise floor

SVG path bounds come back as floats (e.g. `75.6776`, `76.4961`). After clustering at the noise floor (`tolerance = 0.25 px` by default), nearby lines collapse into integer-ish positions. But two lines like `75.68` and `76.50` round to **distinct integer pixels** (76 vs 76 in one rounding mode, 76 vs 77 in another) — they survive as separate lines, and any small width sums between them become arbitrary integers that share no factor with the rest.

This is why the gcd-snap drift mode actively snaps lines to multiples of the chosen divisor instead of just clustering — clustering is opportunistic, snapping is directed.

---

## 6. The drift slider as a GCD-discovery tool

Drift is **not fundamentally about reducing precision**. It is **a budget for nudging grid lines onto positions that produce a higher GCD**.

### Two drift modes

1. **`cluster` mode** — relax the line-merge tolerance. Higher tolerance fuses more lines into single cluster means. The resulting grid sometimes happens to land on factor-friendly positions, sometimes doesn't. Behavior is opportunistic and **non-monotone in drift** (drift=2% can yield worse compression than drift=1% if the new clustering destroys a divisor).

2. **`gcd-snap` mode** — **directed search**. For a given drift budget `D_px`, enumerate divisors of `canvasDim` in descending order and pick the largest `d` such that snapping every grid line to its nearest multiple of `d` keeps every shape's drift ≤ `D_px` and every shape non-degenerate. This is **monotone in drift** and produces ~**9× compression** at small drifts on real assets.

### Reverse calculation

Given a drift budget `D_px`, max achievable divisor is bounded by:

```
d_max ≈ 2 * D_px    (worst-case: line lands halfway between two multiples)
```

In practice the achievable `d` depends on actual line positions and is found by trying divisors in descending order. The algorithm is `O(σ(canvasDim))` per axis (number of divisors of `canvasDim`), which is small (~30 for 1008).

### Drift budget per asset

Drift is expressed as `% of min(canvasW, canvasH)`. So `1%` on a `1008×2177` canvas is `10.08 px`, while `1%` on `192×256` is `1.92 px`. Smaller canvases have *less absolute room* to nudge lines, so they need a higher percentage to unlock the same divisor.

---

## 7. Multi-rect packing as GCD compounding

Single-rect-per-layer is pixel-exact and GCD-aware on its own axis. Multi-rect packing **shares the per-layer scaffolding** across many rects:

- Per-axis GCD reduction still applies to the union grid
- The cell count grows with `K + boundaries`, but the layer count drops from `N` rects to `K` packed groups
- Total slot count drops sub-linearly in N when packing succeeds

**The multiplicative effect**:

```
total_chars(pack=multi, gcd-snap) ≈ (chars / pixel) × (1 / gcd_col) × (1 / gcd_row) × (layers / N rects)
```

Empirically observed on the m0saic-pattern asset (110 rects, 2177×1008 canvas):

| mode | composed bytes | reduction vs legacy |
|---|---:|---:|
| legacy full-grid | 702,127 |  1.0× |
| 3-section + GCD, drift=0, pack=one | 647,897 | 1.08× |
| pack=multi, drift=0 | 65,262 | **10.8×** |
| gcd-snap drift=1.75%, pack=one | 73,315 | 9.6× |
| **gcd-snap drift=2%, pack=multi** | **9,048** | **77.6×** |

The compounding of pack=multi + gcd-snap is the most aggressive setting and lands at ~80× on a complex asset, with ~20px max actual drift on a 1008px-min canvas (~2% of canvas dim).

**Production values (shipped brand assets).** The three canonical brand entries use gcd-snap at moderate drift levels chosen for structural cleanness:

| asset | drift | pack | gcd (col×row) | DSL bytes | nodeCount | reduction vs legacy |
|---|---|---|---|---:|---:|---:|
| m0 (26 rects, 192×256) | ~0.75% | multi | 2×2 | 2,195 | 1,026 | ~11× vs 23 KB legacy |
| m-33 (33 rects, 272×272) | ~0.25% | multi | 1×2 | 6,359 | 3,097 | ~6× vs 36 KB legacy |
| m0saic-pattern (110 rects, 2177×1008) | ~0.5% | multi | 7×9 | 9,331 | 4,580 | **~75× vs 702 KB legacy** |

The pattern's column GCD of 7 aligns with the canvas's natural modulus (gcd(2177, 1008) = 7). The m0's both-axes GCD of 2 means it renders pixel-perfect at half-size (96×128).

---

## 8. Constraints & gotchas

### Multi-rect packing requires y-band compatibility

Two rects in the same packed layer must have y ranges that are either **identical** OR **fully disjoint**. Anything in between (one rect's y endpoint strictly inside another's range) would force the union grid to subdivide one of them into multiple render frames. Step 06 expects one render frame per shape, so the packing rule rejects mixed-y configurations at the same layer.

This is why `m0_v2` (digital lettering with clean horizontal rows) packs to **1 layer** but `mlogo_v2` (m logo with curved shapes at varying heights) packs to **4 layers**.

### Index space vs pixel space

The packing rule and the encoder must operate in the **same** coordinate space. Two grid lines that round to the same pixel value can still be distinct *index-space* lines (e.g. `yLines[4]=75.68, yLines[5]=76.50` both round to `76`). Using pixel-space bounds for packing while the encoder uses index-space gridSpans causes the encoder to subdivide rects whose `gridSpan.yEnd` differs by 1 even though their snapped pixels match. Always use the same space for both.

### Frame-to-shape assignment must be by bounds

When step 06 walks render frames to assign mask shapes, it must match by **spatial bounds**, not by index. Pack=one happens to preserve manifest order in the rendered frame list, but pack=multi traverses by row bands and produces frames in a different order. Index-based assignment maps the wrong shape to the wrong frame and the masks pipeline outputs visually wrong results (curves rendered as their wrong rectangular sibling).

---

## 9. What to compute and look for

When generating m0 from any source, the following measurements are the minimum useful telemetry:

| Metric | Why |
|---|---|
| `gcd_col` per layer | The col-axis compression factor for that layer |
| `gcd_row` per layer | The row-axis compression factor for that layer |
| `canvasW`, `canvasH` factorizations | What divisors are even available |
| `min(canvasW, canvasH)` | The denominator for drift % budgets |
| `total slot count = sum_layers(slots(layer))` | Approximates DSL char count |
| `composed bytes` | Real metric (the user pays this) |
| `max actual drift px` | What was given up in exchange for compression |
| `layer count` | Indicates how well multi-rect packing worked |
| `feasibility min dim` | What target render size still produces a valid layout |

When *exploring* drift budgets for an asset, sweep both `pack` modes against a fine drift matrix in `[0, 2]` and report:

1. The leanest combo (min composed bytes among status=ok)
2. The "step transitions" — drift values where compression jumps significantly (these correspond to a new divisor unlocking)
3. The visual breakdown threshold — drift above which the geometry diverges noticeably from source

Then offer the user multiple variants:
- **`source`**: drift=0, the precise version. Use at high render resolutions.
- **`lite`**: smallest drift that delivers a meaningful compression gain without visible distortion. Use for general purposes.
- **`ico`**: the most aggressive drift that still produces a recognizable layout. Use for very small render sizes (icons, thumbnails).

---

## 10. Heuristics for asset designers

If you control the source SVG (or the canvas dims), the following choices give the GCD algorithm the most to work with:

1. **Choose smooth canvas dimensions.** `1024`, `1080`, `1200`, `256`, `288`, `360`, `512`, `720`, `768`, `960` are all divisible by lots of small primes. Avoid `997`, `1009`, `1013`, and similar primes. If you must use a prime-ish dim, accept that drift mode is the only lever.

2. **Snap source rects to a regular grid.** If your design naturally lives on a 16 px or 24 px grid, encode that explicitly in the SVG. The encoder will find a high GCD without needing any drift.

3. **Align rect heights when possible.** Multi-rect packing wins big when shapes share y ranges. Designing letters / icons / patterns at consistent heights pays compounding dividends.

4. **Avoid floating-point coordinates in source SVG.** Use integer or half-integer pixel coordinates. Float noise is the #1 destroyer of GCD.

5. **Avoid one-off small rects.** A single 3-pixel rect somewhere can prevent the row axis from collapsing to a divisor of 4 or higher, costing the entire rest of the asset.

---

## 11. Heuristics for encoder authors

If you're implementing a new m0 encoder for some other source format (not just SVG), the following are the high-leverage choices:

1. **Always apply per-axis GCD reduction** in your container builders. It's free, pixel-exact, and gives modest baseline wins.

2. **Use the 3-section "place rect" structure** for any single-rect placement. Don't enumerate per-cell.

3. **For multi-rect output, use the union-grid encoder** with row bands → per-band col splits. Same GCD reduction applies at every level.

4. **Don't use brace overlay chains for multi-rect.** Brace overlay attaches to the outer GROUP frame, not to leaves. Multi-leaf splits (`N(1,1,1,...)`) are fully legal and the right encoding for "K rects in one canvas."

5. **Match rendered frames to source shapes by spatial bounds, not by index.** Encoder traversal order is not stable across pack modes; bounds matching is.

6. **Offer both a `cluster` (opportunistic) and a `gcd-snap` (directed) drift mode** if you're going to expose drift at all. They produce different curves; users may prefer one for exploration and the other for production.

---

## 12. Heuristics for canvas-dim selection

When you have control over the rendered canvas dimensions (e.g., when generating new assets vs adapting legacy ones), prefer dimensions whose factorizations include lots of small primes:

```
Tier 1 (great): 256, 288, 360, 384, 432, 480, 512, 576, 640, 720, 768, 864, 960, 1080, 1200, 1440, 2160
Tier 2 (good):  192, 224, 320, 400, 528, 600, 672, 800, 1024, 1152, 1280, 1600, 1920
Tier 3 (avoid): primes near a target size (997, 1013, 1019, 1021, 1031, ...)
                semi-primes with one tiny factor (1018 = 2 · 509)
```

A canvas of `1080 = 2³ · 3³ · 5` divides cleanly by `1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 18, 20, 24, 27, 30, 36, 40, 45, 54, 60, 72, 90, 108, 120, 135, 180, 216, 270, 360, 540, 1080` — over 30 candidate divisors. Most reasonable drift budgets unlock several of them.

A canvas of `997` divides cleanly by `1, 997`. Nothing in between. The GCD algorithm has no room to operate. You'd need ~50% drift to get any compression at all, which is well past visual breakdown.

---

## 13. Reference results

End-to-end on three canonical SVG assets, all using the directed `gcd-snap` mode:

| asset | canvas | rects | legacy | best gcd-snap | total |
|---|---|---:|---:|---:|---:|
| `m0_v2` (digital DSL logo) | 192×256 | 26 | 23,744 B | 570 B (drift 2%, pack=multi, gcd=8) | **41.7×** |
| `mlogo_v2` (m logo) | 272×272 | 33 | 36,415 B | 1,475 B (drift 1.5%, pack=multi, gcd=8) | **24.7×** |
| `m0saic-pattern_v2` (mosaic pattern) | 2177×1008 | 110 | 702,127 B | 9,048 B (drift 2%, pack=multi, gcd col=7 row=48) | **77.6×** |

The geometric mean of these three is **~42×**. The original svg-to-mosaic TODO speculated about a "10×" headline; the realization is that the right algorithm is closer to 30–80× and the limiting factor is the canvas dimension's factorization, not the encoder.

---

## 14. Open questions / next directions

1. **Cross-axis interaction.** Currently each axis's GCD is computed independently. Could a joint optimization (e.g. picking divisors `d_col` and `d_row` such that the *product* of slot counts is minimized) win further? Probably small gains; not yet explored.
   **Resolved 2026-07-10:** the cost function is separable per axis (total slots = row slots + Σ per-band col slots, each term depending only on its own axis's gcd), so joint cross-axis optimization gains ≈ nothing — see the internal composition-arithmetic notes §5.

2. **Per-layer drift budgets.** Currently drift is global. Could allowing different drifts on different rects (where one rect tolerates more drift than another) unlock additional compression? Not yet explored.
   **Update 2026-07-10:** per-RECT budgets shipped (`placeOptimizedRects` `driftPx`, `0` = lock). The sharper unexplored form is **layer partitioning by divisor-class** — choosing which lines share a lattice, not how far each may move — see `composition-arithmetic.md` §5.

3. **Multi-rect packing with tolerance.** The current packing rule rejects rects with overlapping-but-unequal y ranges. With a small relaxation (allow ≤ 1 px y boundary mismatch by snapping the smaller range to match), packing would be denser. Tradeoff: 1 px geometry shift per affected rect.

4. **Encoder for non-axis-aligned content.** Rotated rects or curves that aren't snapped to a grid can't use the union-grid encoder directly. The current pipeline only handles axis-aligned grids. Generalization would require rethinking the section model.

5. **Generator UX.** The svg-to-mosaic harness already produces `source`/`lite`/`ico` candidates from a single SVG. A future editor integration would expose this as a slider: paste SVG, slide drift, see real-time GCD + bytes + visual diff, save the chosen variant.

---

## Appendix A: glossary

- **Section sum** — the total pixel width of one consecutive group of cells (e.g. "the rect's row band" = 20 px).
- **Slot** — the smallest unit a split divides the parent into. A split of N slots over D pixels gives slots of `D/N` pixels each.
- **Claimant** — the token that occupies a slot: `1` (rendered tile), `-` (null), `0` (zero-frame), or a nested expression.
- **Container** — `N(...)` (cols) or `N[...]` (rows). The structural building block.
- **3-section structure** — the canonical "place a rect on a canvas" expression: `outerRow[topNull, innerCol(leftNull, F, rightNull), bottomNull]`.
- **Union grid** — the grid formed by taking the union of all rects' boundaries on each axis. Used by the multi-rect encoder.
- **Drift budget** — the maximum pixel displacement permitted per grid line during snap-to-divisor.
- **gcd-snap** — directed drift mode that picks the largest divisor of `canvasDim` whose snap respects the drift budget.
