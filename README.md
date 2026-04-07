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

This repository contains multiple packages. Start with `dsl`.

### Core

- [`packages/dsl`](./packages/dsl)  
  Core language: parser, validator, canonicalization, geometry evaluation  
  → [API](./packages/dsl/API.md)  
  → [Docs](./packages/dsl/README.md)  

---

### Authoring & Construction

- [`packages/dsl-stdlib`](./packages/dsl-stdlib)  
  Builders, transforms, and utilities for constructing and modifying m0 strings  
  → [API](./packages/dsl-stdlib/API.md) 
  → [Docs](./packages/dsl-stdlib/README.md)

---

### File Formats

- [`packages/dsl-file-formats`](./packages/dsl-file-formats)  
  `.m0` and `.m0c` serialization, parsing, and metadata containers  
  → [API](./packages/dsl-file-formats/API.md)  
  → [Docs](./packages/dsl-file-formats/README.md)

---

### Validation & Testing

- [`packages/dsl-visual-tests`](./packages/dsl-visual-tests)  
  Golden tests that render layouts and verify geometry via PNG + `.m0` pairs  
  → [Docs](./packages/dsl-visual-tests/README.md)  

---

## Relationship to m0saic

m0 is the core layout algebra.

**m0saic** is a system built on top of m0 that provides:

- Visual editing tools  
- Template systems  
- Composition workflows  
- Rendering infrastructure  

m0 may be used independently of m0saic.

---

## Specification Stability

The m0 grammar and semantics follow semantic versioning.

- v1.x is backwards compatible  
- Breaking changes require a major version  
- Conformance defines correctness  

---

## Links

- Website: https://m0saic.io  
- Learn: https://app.m0saic.io/learn  
- Editor: https://app.m0saic.io/layout  

---

## Maintained by

m0 is maintained by **m0saic LLC**.

---

## License

Licensed under the Apache License, Version 2.0.  
See `LICENSE` and `NOTICE`.