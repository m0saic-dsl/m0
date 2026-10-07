# File formats

Six file types carry m0 around. Four belong to the language and live in this repo, in
[`@m0saic/dsl-file-formats`](./packages/dsl-file-formats). Two belong to
[m0saic](https://github.com/m0saic-project/m0saic), the video compiler, and sit below the line
because they come up in the same breath.

## The m0 language

| | Extension | What it is | Defined in |
|:-:|---|---|---|
| <img src="assets/file-icons/m0.svg" width="96" alt=".m0 icon"> | `.m0` | the layout string and its canvas size, as text: a few `#` header lines, a blank line, the m0 string. Small, durable, diff-friendly. | [`@m0saic/dsl-file-formats`](./packages/dsl-file-formats/src/m0) |
| <img src="assets/file-icons/m0c.svg" width="96" alt=".m0c icon"> | `.m0c` | m0 with context, as JSON: the string plus any of labels, masks, fills, insets, rank sets, a background, a reference image and agent notes, each keyed by stable key. Every part of the context is optional; it only makes the layout more descriptive. | [`@m0saic/dsl-file-formats`](./packages/dsl-file-formats/src/m0c) |
| <img src="assets/file-icons/m0p.svg" width="96" alt=".m0p icon"> | `.m0p` | m0 pack, as JSON: every variant of one layout under one identity. | [`@m0saic/dsl-file-formats`](./packages/dsl-file-formats/src/m0p) |
| <img src="assets/file-icons/m0v.svg" width="96" alt=".m0v icon"> | `.m0v` | m0 vocab, as JSON: output and asset presets. | [`@m0saic/dsl-file-formats`](./packages/dsl-file-formats/src/m0v) |

The `.m0` goldens in
[`packages/dsl-visual-tests/src/realWorld/__goldens__`](./packages/dsl-visual-tests/src/realWorld/__goldens__)
are real examples: one shipped template's whole geometry per file.

---

## m0saic types

Not part of the m0 language. These are the video compiler's documents, and the ones you will meet
next to a `.m0` on disk.

| | Extension | What it is | Defined in |
|:-:|---|---|---|
| <img src="assets/file-icons/mosaic.svg" width="96" alt=".mosaic icon"> | `.mosaic` | a resolved document the engine renders as-is, as JSON: the geometry, one source per rectangle, timing. | [`@m0saic/types`](https://github.com/m0saic-project/m0saic-packages/blob/main/packages/types/src/document/document.ts) |
| <img src="assets/file-icons/mosaicx.svg" width="96" alt=".mosaicx icon"> | `.mosaicx` | the authoring source, as JSON: a template id and its props, or a pipeline of them, resolved to a `.mosaic` at render time. | [`@m0saic/types`](https://github.com/m0saic-project/m0saic-packages/blob/main/packages/types/src/document/mosaicx-document.ts) |

## Icons

The icons above are the family's file icons. Installing
[Mosaic Desktop](https://m0saic.io/download) registers all six with the operating system
on macOS and Windows, so they show up in Finder and Explorer and double-click into the
app. The m0saic VS Code extension overlays the same icons in the editor. The SVGs live in
[`assets/file-icons`](./assets/file-icons) and are free to reuse under this repo's licence.
