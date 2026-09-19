<p align="left">
  <a href="https://m0saic.io" target="_blank" rel="noopener noreferrer">
    <img src="assets/m0.png" alt="m0saic" width="180" />
  </a>
</p>

> A deterministic layout language for exact rectangular geometry.

# m0 (m0saic DSL)

**m0** is a deterministic, integer-only rectangle layout algebra and canonical string encoding maintained by **m0saic LLC**.

It defines a minimal grammar for transforming a single rectangle into a structured, deterministic set of child rectangles with stable identity and exact geometry.

---

## Install

The four packages in this repository publish to npm under the `@m0saic` scope:

```bash
npm i @m0saic/dsl               # the language: parser, validator, canonical form, geometry
npm i @m0saic/dsl-stdlib        # builders, transforms, queries that produce m0 strings
npm i @m0saic/dsl-file-formats  # .m0 / .m0c / .m0p files: parse, serialize, convert
npm i @m0saic/dsl-visual-tests  # golden-test harness (PNG + .m0 pairs) for DSL coverage
```

Render layouts to video from the command line with the m0saic CLI:

```bash
npm i -g m0saic
```

---

## Getting Started

Start with the core DSL:

👉 https://github.com/m0saic-dsl/m0/tree/main/packages/dsl

Interactive editor:

👉 https://app.m0saic.io/layout

---

## Example

```
2(1,1)
```

Two equal columns.

```
3(1,0,1)
```

Middle slot donates its space to neighbors.
Result: two outer tiles grow while preserving a 3-slot structure.

```
2(1,3[1,1,1])
```

Left tile + right column of three rows.

---

## Definition

Given:

- A root rectangle `(width, height)`
- A valid m0 string

Evaluation produces:

- A deterministic set of rectangles
- Stable ordering
- Stable identity
- Exact integer geometry
- No floating-point ambiguity
- No runtime-dependent variation

m0 produces **geometry only**.
It does not assign meaning to rectangles.

---

## Scope

m0 intentionally does not define:

- Content measurement
- Responsive layout behavior
- Styling or rendering
- Runtime-dependent layout

It is a layout algebra, not a UI system.

---

## Composition Model

m0 defines deterministic geometry as a pure function of:

```
(root rectangle, m0 string) → rectangles
```

Higher-level systems may bind meaning onto the resulting rectangles.

In the **m0saic** system, rectangles may be associated with:

- Media sources
- Text primitives
- Nested compositions
- Rendering pipelines

This separation preserves m0 as a portable, implementation-independent layout core.

---

## Packages

This repository contains four packages. Start with `dsl`.

### DSL

- [`packages/dsl`](./packages/dsl) — `@m0saic/dsl`
  Core language: parser, validator, canonicalization, geometry evaluation
  → [API](./packages/dsl/API.md)
  → [Docs](./packages/dsl/README.md)

### DSL Standard Library

- [`packages/dsl-stdlib`](./packages/dsl-stdlib) — `@m0saic/dsl-stdlib`
  Builders, transforms, and utilities for constructing and modifying m0 strings
  → [API](./packages/dsl-stdlib/API.md)
  → [Docs](./packages/dsl-stdlib/README.md)

### File Formats

- [`packages/dsl-file-formats`](./packages/dsl-file-formats) — `@m0saic/dsl-file-formats`
  `.m0`, `.m0c` and `.m0p` serialization, parsing, and metadata containers
  → [API](./packages/dsl-file-formats/API.md)
  → [Docs](./packages/dsl-file-formats/README.md)

### Validation & Testing

- [`packages/dsl-visual-tests`](./packages/dsl-visual-tests) — `@m0saic/dsl-visual-tests`
  Golden tests that render layouts and verify geometry via PNG + `.m0` pairs
  → [Docs](./packages/dsl-visual-tests/README.md)

### Working in this repo

```bash
npm install
npm run build      # every package, in dependency order
npm test           # the fast suites
npm run test:slow  # the dsl stress / perf suites
```

---

## Relationship to m0saic

m0 is the core layout algebra.

[**m0saic**](https://github.com/m0saic-project) is a system built on top of m0 that provides:

- Visual editing tools
- Template systems
- Composition workflows
- Rendering infrastructure

The public packages of that system — types, platform, template utilities, the dictionary of named layouts, the built-in templates — live in [m0saic-project/m0saic-packages](https://github.com/m0saic-project/m0saic-packages) and consume the packages here from npm. The `m0saic` CLI (`npm i -g m0saic`) renders m0 layouts to video and image sequences.

m0 may be used independently of m0saic.

---

## Specification Stability

The m0 grammar and semantics follow semantic versioning.

- Breaking changes require a major version
- Conformance defines correctness
- Each package carries its own `CHANGELOG.md` and its own version; git tags are `<package>-v<version>`

---

## Links

- Website: https://m0saic.io
- Learn: https://app.m0saic.io/learn
- Editor: https://app.m0saic.io/layout
- The rest of the public packages: https://github.com/m0saic-project/m0saic-packages

---

## Maintained by

m0 is maintained by **m0saic LLC**.

---

## Licensing

Every package in this repository is licensed under the **Apache License, Version 2.0**. See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE); each package ships its own copy.

m0saic and the m0saic logo are trademarks of m0saic LLC. The license does not grant permission to use the trade names, trademarks, service marks, or product names of m0saic LLC, except as required for reasonable and customary use in describing the origin of the work.
