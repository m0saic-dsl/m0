# m0 — composable layouts for rectilinear art

> A structural layout DSL that decouples spatial structure from content, so any rectangular region of any design can be animated, scaled, swapped, or composed independently of the rest.

This is the one-page introduction. If you want the technical depth on the compression math, read [`GCD.md`](./GCD.md). If you want to convert an SVG to m0 right now, jump to [Get started](#get-started).

---

## What m0 is, in one paragraph

m0 is a tiny domain-specific language for describing **how a rectangle is divided into smaller rectangles**, recursively. Every node in an m0 expression is an axis-aligned region of some parent canvas. The language has no concept of color, no curves, no fills, no strokes — none of the visual primitives that SVG has. Instead, it describes the *spatial structure* of a design: where every region lives, how they nest, and how the whole thing scales when the target canvas changes size.

That sounds limiting until you realize what falls out of it.

---

## Why it exists

Most "graphics" formats describe what to draw. SVG, PDF, raster images — each is a self-contained visual artifact. They are excellent at *representing* a design but they fight you the moment you want to *manipulate* it programmatically:

- Scaling an SVG works, but rearranging its parts means parsing and rewriting paths.
- Animating a region of an SVG means surgically targeting elements with selectors and CSS, hoping the structure doesn't shift under you.
- Re-using one designer's SVG inside another template means transforms, viewBox math, and a lot of hope.
- Generating a video from one SVG with varying content per frame is hand-rolled per project.

Underneath all of those operations is the same unmet need: **a layout layer that's separate from the visual layer.** Once you know where every rectangular region lives and how they nest, every templating, animation, and composition operation becomes free. The visual content of each region is then a completely separate concern that can come from anywhere — a color, an image, a video frame, a generated chart, another m0 layout.

m0 is that layout layer. Not a replacement for SVG — a complement to it. **SVG describes the visual artifact; m0 describes the spatial structure underneath.**

---

## The mental model

Think of m0 as the load-bearing skeleton of a design.

- **A node is a region.** Every rectangle on the canvas, no matter how small, has an identity in the layout tree.
- **A region can be split.** Containers like `N(...)` (cols) or `N[...]` (rows) cut a parent region into N child regions.
- **A region can host content.** A leaf node is a *slot* — somebody else (a renderer, a video pipeline, an editor) decides what goes in it.
- **Layouts compose.** One m0 expression can be nested inside another's slot via `parent{inner}`. The inner layout sees the parent slot as its full canvas.
- **Resolution is a render-time decision.** The same m0 string renders at 256×256, 1080×1080, or 4096×4096. The engine scales the splits proportionally with no precision loss until you ask for it.

If you've used CSS Grid or SwiftUI's stack/grid system, the spatial intuition is similar — except m0 is a *string*, not an in-memory tree. You can email it. You can `cat` it. You can compose it with other m0 strings via string concatenation. You can store thousands of them in a dictionary and look them up by name.

---

## What it isn't

To save you from a few wrong mental models:

- **Not a vector graphics format.** Curves, gradients, and arbitrary fills don't live in m0. They live in *masks* — sidecar files that describe the content of each rectangular region. The layout and the content are separated by design.
- **Not a bitmap format.** m0 doesn't store pixels. It stores the relationships between rectangles, and the renderer turns those into pixels at the target size.
- **Not a replacement for SVG, PNG, or video.** It's a layer above them — a scaffold that any of those formats can fill. You convert *into* m0 to gain composability and animation control; you render *out of* m0 to whatever target you need.
- **Not a 2D scene graph in the game-engine sense.** There's no z-index attribute, no transform matrices, no event hooks. Composition is layer-by-layer brace nesting; ordering is the order you nest them in.

---

## What just shipped (the production milestone)

m0 has existed as a research idea, a parser, a small stdlib, and a visual editor for some time. What shipped in this milestone moves it from "theoretical curiosity backed by a parser" to **a working production pipeline that turns any rectilinear SVG into a small, composable, animatable m0 string in a single command**.

The four pieces that matter:

### 1. The svg-to-mosaic pipeline

A CLI that takes an SVG and produces an m0 file plus a mask sidecar. Designers hand off SVGs; engineers run the pipeline; out comes an asset that's drop-in compatible with every other m0 consumer (templates, animation libraries, the editor, the dictionary).

```
SVG → 01-extract-geometry → 03-infer-grid → 04-generate-rects → 05-compose → 06-masks → m0
```

It handles:
- Pixel-exact mode (`drift=0`) for assets that demand source fidelity
- Bounded-drift modes (`gcd-snap`) for assets where small geometric drift is acceptable in exchange for much smaller DSL output
- Multi-rect packing (`pack=multi`) for assets where multiple shapes can share a single layer

### 2. The GCD realization

The fundamental insight that makes m0 practical at scale: **DSL char count is governed by the greatest common divisor of section sums, not by canvas resolution**. A 2000×1000 design with shapes aligned to a 50-pixel grid emits the same DSL size as a 40×20 design — the GCD collapses both to the same slot count.

Once we understood that, the compression algorithm became straightforward: directly search for the largest divisor that fits within the user's allowed drift budget and snap the grid to it. The full math, proofs, and design heuristics are in [`GCD.md`](./GCD.md). The empirical results across three canonical assets:

| asset | source SVG | best m0 | reduction |
|---|---:|---:|---:|
| `m0` (a digital DSL logo, 192×256) | 24 KB | **0.6 KB** | **42×** |
| `mlogo` (an m logo, 272×272) | 36 KB | **1.5 KB** | **25×** |
| `m0saic-pattern` (a complex tile, 2177×1008) | 702 KB | **9 KB** | **78×** |

Geometric mean: ~42× over a baseline that itself was already pixel-exact. **The original "10× headline" turned out to be a significant underestimate.**

### 3. The stdlib

A small set of opinionated builders (`placeRect`, `aspectFit`, `grid`, `strip`, `safeCanvas`, `weightedTokens`, `container`, ...) that produce well-formed m0 strings for common layout patterns. You don't have to handwrite m0 for the 90% case — and the builders are designed to be GCD-friendly out of the box.

### 4. The spatial editor

A visual environment for inspecting, editing, and composing m0 layouts. Drag a region, swap a child, nest one layout inside another, see the result update live. The editor is what makes m0 feel like a *design tool* rather than just a string format.

---

## What you can do with m0 today

Brand assets are now first-class participants in the m0 ecosystem. Anything you'd previously have shipped as an SVG and a separate animation script can now flow through a single pipeline:

### Convert your brand SVG → drop into existing animation templates

If your team already has m0 templates that animate regions of a layout (transitions, reveals, motion graphics), the new svg-to-mosaic pipeline means **any rectilinear brand asset can be the input to those templates without per-asset hand work**. The asset has stable region identities — you can target individual rects in animations the same way you target named layers in After Effects.

### Brand-aware QR code overlays

QR overlays are an obvious win because they're already structured: a rectangular code in a rectangular frame, often surrounded by branding regions. Once a brand asset is m0, you can compose it directly into a QR overlay template via brace nesting (`overlay{brand_logo}`) and render the combined result at any size, with any QR payload, in a single CLI invocation. No image stitching, no per-render Photoshop step.

### Resolution-independent rendering for any target

The same m0 string renders at icon size, social media size, and 4K video frame size. Pick the variant that fits the target:

- **`source`**: pixel-exact, used at high render resolutions and for editing
- **`lite`**: small drift, dramatic char savings, used as the general-purpose default
- **`ico`**: aggressive drift, smallest possible representation, used at icon/thumbnail sizes where the drift is invisible

Since these are all variants of the same source, they live together in the dictionary keyed by intent.

### CI/CD-driven video and image generation

A build pipeline can render m0 to any output format programmatically. Vary which content fills which slot per frame, render the sequence, encode to video. The DSL parses fast enough at engine time that the per-frame cost is negligible — m0 size matters for editor load and storage, not for render throughput.

### Templates that consume m0 as a building block

Any template that previously expected a "logo asset" can now accept an m0 — and gain everything that comes with that: per-region animation, resolution independence, composability with other layouts. The template author writes one consumer; the asset author hands off one m0; everything composes.

---

## Why this is a milestone, in one line

**m0 has crossed the threshold from "the parser works" to "the format is production-ready for converting, animating, composing, and rendering rectilinear designs at any scale."**

Before this milestone, using m0 for a real asset meant either hand-writing the layout (only practical for tiny designs) or accepting an encoder that produced bloated DSL (not practical for complex assets). After this milestone:

- **Any rectilinear SVG** can be converted in one command.
- **Any complex asset** compresses to a usable size (the m0saic-pattern went from 702 KB to 9 KB while remaining visually faithful).
- **Any encoder author** has a documented mental model (GCD reduction) for what makes m0 efficient.
- **Any template author** has a stdlib of building blocks and a spatial editor for visual iteration.
- **Any designer** has a path from their tools (SVG export) to the m0 ecosystem without learning a new format.

The format went from paper → parser → stdlib → spatial editor → production pipeline → documented depth. That progression is the milestone, not any single piece.

---

## What's next

Three production tracks come into focus now that the foundation is solid:

### 1. The generator experience

The svg-to-mosaic CLI is the on-ramp; the next iteration is a **visual generator inside the editor**. Paste an SVG, slide a "drift budget" knob, watch the m0 size and visual fidelity update in real time, pick the variant you want, and save it to the dictionary as one of the asset's named entries (`source`, `lite`, `ico`, or whatever you call them). The CLI already does the search; the editor just needs to wrap it in a UI.

### 2. The template ecosystem

Brand-asset animation templates and QR overlay templates exist. The next step is documenting the *contract* between templates and the m0 they consume — what slots a template expects, what shape its input m0 should have, how to compose. Once the contract is clear, third parties can ship m0-consuming templates, and brand assets become drop-in fuel for everything in the ecosystem.

### 3. Dictionary as a content network

The dictionary already stores m0 entries with metadata, complexity scores, and feasibility info. With multi-variant assets (`source`/`lite`/`ico`), it becomes the natural distribution point for brand assets across an organization: one m0 ID, multiple precision levels, automatic selection based on render target. This is where m0 stops being a "format" and starts being an "asset network" — designers ship to the dictionary, consumers (templates, render pipelines, editors) read from it, everything composes.

---

## How m0 compares (a one-line cheat sheet for the people who'll ask)

| Format | What it represents | What it's good at | What m0 adds |
|---|---|---|---|
| **SVG** | Vector geometry | Visual fidelity, browser rendering | Decoupled spatial structure, composability, programmatic region control |
| **PNG / JPG** | Pixels | Universal display | Resolution independence, vectorizable layout, animation per region |
| **CSS Grid / Flexbox** | DOM layout | Web layout | Standalone, language-agnostic, embeddable in any renderer |
| **Figma frames** | Designer-tool layouts | Visual editing | Open format, scriptable, no proprietary runtime |
| **After Effects compositions** | Time-based scenes | Motion design | Lightweight (KB not MB), version-controllable as text, CLI-renderable |

m0 isn't trying to win any of these categories on its own terms. It's trying to be **the thin structural layer that makes them all interoperable** for rectilinear designs.

---

## Get started

**Convert an SVG:**

```bash
ts-node packages/docs/svg-to-mosaic/tools/00-run-all-modes.ts <asset-name>
```

This produces the full variant matrix at `packages/docs/svg-to-mosaic/examples/<asset-name>/_modes/` with a `report.md` that highlights the leanest option. Pick the one that matches your visual fidelity needs.

**Read the technical depth:**

- [`GCD.md`](./GCD.md) — the math that makes m0 efficient. Start here if you're implementing an encoder, designing assets for compression, or curious why a 700 KB design becomes 9 KB.
- [`packages/docs/svg-to-mosaic/pipeline-modes-plan.md`](../docs/svg-to-mosaic/pipeline-modes-plan.md) — the full pipeline design, mode definitions, and validation discipline.
- [`packages/dsl-stdlib/`](../dsl-stdlib/) — the builder library for handwriting m0 in code.

**Try the spatial editor:**

The editor lives at `apps/mosaic/web`. Open any `.m0` file, drag regions, see the layout tree update live.

---

## One more thing

The most important thing to take away from this introduction is the *decoupling*. m0 isn't a graphics format that competes with SVG. It's the missing layer between "I have a design" and "I have a programmable, composable, animatable, resolution-independent template that any pipeline can render."

Once you have that layer, every operation that uses spatial structure as a primitive becomes free. Every template that previously had to bake assumptions about its inputs can now accept any m0. Every brand asset becomes ambient infrastructure that composes with everything else in the ecosystem.

That's what just shipped. The next milestone is making it easy enough that designers don't have to know any of this is happening — they hand over an SVG, the pipeline does the math, and their work flows into every template the organization has built.

This is m0 leaving the lab.
