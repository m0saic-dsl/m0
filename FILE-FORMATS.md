# File formats

Six file types carry m0 around. Four are owned by this repo, through
[`@m0saic/dsl-file-formats`](./packages/dsl-file-formats); two are defined by
[m0saic](https://github.com/m0saic-project/m0saic), the compiler, and listed here so
the whole family sits in one place.

| | Extension | What it is | Shape | Defined in |
|:-:|---|---|---|---|
| <img src="assets/file-icons/m0.svg" width="56" alt=".m0 icon"> | `.m0` | the layout string and its canvas size; small, durable, diff-friendly | text: `#` header lines, a blank line, the m0 string | `@m0saic/dsl-file-formats` |
| <img src="assets/file-icons/m0c.svg" width="56" alt=".m0c icon"> | `.m0c` | m0 with context: the string plus labels, masks, a background and a reference image, keyed by stable key | JSON | `@m0saic/dsl-file-formats` |
| <img src="assets/file-icons/m0p.svg" width="56" alt=".m0p icon"> | `.m0p` | m0 pack: every variant of one layout under one identity | JSON | `@m0saic/dsl-file-formats` |
| <img src="assets/file-icons/m0v.svg" width="56" alt=".m0v icon"> | `.m0v` | m0 vocab: output and asset presets | JSON | `@m0saic/dsl-file-formats` |
| <img src="assets/file-icons/mosaic.svg" width="56" alt=".mosaic icon"> | `.mosaic` | a resolved document the engine renders as-is: geometry, one source per rectangle, timing | JSON | m0saic |
| <img src="assets/file-icons/mosaicx.svg" width="56" alt=".mosaicx icon"> | `.mosaicx` | the authoring source: a template id and its props, or a pipeline of them, resolved to a `.mosaic` at render time | JSON | m0saic |

The `.m0` goldens in
[`packages/dsl-visual-tests/src/realWorld/__goldens__`](./packages/dsl-visual-tests/src/realWorld/__goldens__)
are real examples: one shipped template's whole geometry per file.

## Icons

The icons above are the family's file icons. Installing
[Mosaic Desktop](https://m0saic.io/download) registers all six with the operating system
on macOS and Windows, so they show up in Finder and Explorer and double-click into the
app. The m0saic VS Code extension overlays the same icons in the editor. The SVGs live in
[`assets/file-icons`](./assets/file-icons) and are free to reuse under this repo's licence.
