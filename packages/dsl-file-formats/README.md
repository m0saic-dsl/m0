# @m0saic/dsl-file-formats

Container formats for persisting and exchanging m0saic layouts.

This package owns the serialization boundary between the m0saic DSL (a pure spatial decomposition string) and the file containers that wrap it with metadata, labels, and derived assets.

```
npm install @m0saic/dsl-file-formats
```

---

## Where this fits

```
                    @m0saic/dsl
              the language core (zero deps)
            grammar, parser, validator, types
                        |
          +-------------+-------------+
          |                           |
  @m0saic/dsl-file-formats    @m0saic/dsl-stdlib
    .m0  .m0c  containers      builders, transforms
    serialize / parse           authoring toolkit
          |                           |
          +-------------+-------------+
                        |
                @m0saic/dictionary
             curated entries + generators
```

`dsl-file-formats` depends on `@m0saic/dsl` for canonicalization, validation, and branded types. It has no other dependencies.

---

## Two formats

```
  .m0 (text)                          .m0c (JSON)
  +--------------------------+        +--------------------------+
  | # m0                     |        | {                        |
  | # version: 1             |        |   "format": "m0c",       |
  | # created: 2026-04-02... |        |   "version": 1,          |
  | # size: 1920x1080        |        |   "created": "...",      |
  | # app: m0saic-desktop    |        |   "size": {...},         |
  | # appVersion: 1.0.0      |        |   "labels": {...},       |
  | # title: My Layout       |        |   "derive": {...}        |
  |                          |        | }                        |
  | 2(1,1)                   |        +--------------------------+
  +--------------------------+
                                       + labels (StableKey -> text/color)
  lightweight, human-readable(ish)          + derived images (base64 thumbnails)
  storage and transfer                 rich composition documents
```

| | `.m0` | `.m0c` |
|---|---|---|
| Format | Text (headers + payload) | JSON |
| Labels | No | Yes (keyed by `StableKey`) |
| Derived images | No | Yes (base64 PNG/JPEG/WebP) |
| Use case | Storage, exchange, CLI | Editor documents, exports |
| DSL payload | Always canonical | Always canonical |
| Human-readable | Yes | Partially |

---

## API

### Functions

```
  serializeM0File(opts) ──────> "# m0\n# version: 1\n..."
  parseM0File(text) ──────────> M0File

  serializeM0cFile(opts) ─────> '{"format":"m0c",...}'
  parseM0cFile(jsonText) ─────> M0cFile

  formatISO(date) ────────────> "2026-04-02T14:30:00.000Z"
```

### `serializeM0File(opts): string`

Produces a deterministic `.m0` text file. The DSL payload is always canonicalized (`F`->`1`, `>`->`0`, whitespace stripped).

```typescript
import { serializeM0File } from "@m0saic/dsl-file-formats";

const text = serializeM0File({
  m0: "2(F, F)",               // canonicalized to "2(1,1)"
  size: { width: 1920, height: 1080 },
  app: "my-app",
  appVersion: "1.0.0",
  meta: { title: "Side by side", author: "Studio" },
});
```

Output:
```
# m0
# version: 1
# created: 2026-04-02T14:30:00.000Z
# size: 1920x1080
# app: my-app
# appVersion: 1.0.0
# title: Side by side
# author: Studio

2(1,1)
```

### `parseM0File(text): M0File`

Parses an `.m0` text file. Case-sensitive header keys. Requires `created`. Validates `format` and `version` if present. Normalizes absent fields to `null`.

```typescript
import { parseM0File } from "@m0saic/dsl-file-formats";

const file = parseM0File(text);
// file.m0saic     → "2(1,1)"
// file.created    → "2026-04-02T14:30:00.000Z"
// file.appVersion → "1.0.0"
// file.meta       → { title: "Side by side", author: "Studio" }
```

### `serializeM0cFile(opts): string`

Produces a deterministic `.m0c` JSON file. DSL payload is canonicalized. Label keys are sorted alphabetically. Label text is trimmed; empty labels are filtered.

```typescript
import { serializeM0cFile } from "@m0saic/dsl-file-formats";
import type { StableKey } from "@m0saic/dsl";

const json = serializeM0cFile({
  m0: "2(1,1)",
  size: { width: 1920, height: 1080 },
  labels: {
    "r/fc0" as StableKey: { text: "Camera A", color: "#ff0000" },
    "r/fc1" as StableKey: { text: "Camera B" },
  },
  deriveImage: {
    mime: "image/png",
    bytes: 4096,
    b64: "iVBORw0KGgo...",
  },
});
```

### `parseM0cFile(jsonText): M0cFile`

Parses an `.m0c` JSON file. Validates format, version, required fields, size constraints, label structure, and derive image types.

```typescript
import { parseM0cFile } from "@m0saic/dsl-file-formats";

const file = parseM0cFile(jsonString);
// file.labels  → Record<StableKey, M0Label> | null
// file.derive  → { image: M0cDeriveImage | null }
```

### `formatISO(date): string`

UTC ISO 8601 with milliseconds and trailing Z. Exported for consistent timestamp formatting across tools.

```typescript
import { formatISO } from "@m0saic/dsl-file-formats";

formatISO(new Date());  // "2026-04-02T14:30:00.000Z"
```

---

## Types

```
  M0File
  +-- format: "m0"
  +-- version: 1
  +-- created: string (ISO 8601)
  +-- app: string | null
  +-- appVersion: string | null
  +-- meta: M0FileMeta | null
  |     +-- title?: string
  |     +-- author?: string
  |     +-- source?: string
  |     +-- note?: string
  +-- size: { width, height } | null
  +-- m0: string (canonical DSL)

  M0cFile
  +-- format: "m0c"
  +-- version: 1
  +-- created: string (ISO 8601)
  +-- app: string | null
  +-- appVersion: string | null
  +-- meta: M0FileMeta | null
  +-- size: { width, height } | null
  +-- m0: string (canonical DSL)
  +-- labels: Record<StableKey, M0Label> | null
  +-- derive
       +-- image: M0cDeriveImage | null
              +-- mime: "image/png" | "image/jpeg" | "image/webp"
              +-- bytes: number
              +-- b64: string
```

---

## Guarantees

### Canonical output

Both serializers canonicalize the DSL payload via `toCanonicalM0String()` before writing. Two files containing the same layout will always produce identical payloads regardless of input form.

### Deterministic serialization

- `.m0` headers are emitted in a fixed order
- `.m0c` label keys are sorted alphabetically via `localeCompare`
- Timestamps are UTC ISO 8601 with milliseconds

Byte-identical inputs produce byte-identical outputs.

### Roundtrip stability

```
  serialize ─────> text/JSON ─────> parse
      \                              /
       \______ same M0File/M0cFile _/
```

`parseM0File(serializeM0File(opts))` and `parseM0cFile(serializeM0cFile(opts))` preserve all fields. Roundtrip tests verify this for every field including `appVersion`, `meta`, `labels`, `derive`, and `size`.

### Versioning

`version: 1` is a literal type. A new file format version requires a **major package version bump**. Consumers can safely match on `version === 1` without forward-compatibility concerns within the v1.x line.

---

## License

Licensed under the Apache License, Version 2.0.
See `LICENSE` and `NOTICE`.
