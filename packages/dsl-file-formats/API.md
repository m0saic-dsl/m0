# @m0saic/dsl-file-formats — API Reference

`.m0` and `.m0c` file format parsing and serialization for the m0 DSL.

```
npm install @m0saic/dsl-file-formats
```

Depends on `@m0saic/dsl` only.

---

## .m0 Format (text)

Plain-text layout file. Header comments + single-line DSL payload.

### `serializeM0File(opts): string`

```typescript
serializeM0File(opts: {
  m0: string;
  size?: { width: number; height: number } | null;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
}): string
```

Canonicalizes the DSL payload. Defaults `created` to `new Date()`. Throws on empty payload or invalid size.

### `parseM0File(text: string): M0File`

Parses a `.m0` text file. Requires `created` header. Validates `version` if present. Ignores unknown headers (forward-compatible). Returns null-stable shape — optional fields are `null`, never `undefined`.

### `formatISO(d: Date): string`

UTC ISO 8601 with milliseconds and trailing `Z`. E.g. `"2026-04-03T14:30:00.000Z"`.

---

## .m0c Format (JSON container)

JSON container with layout, labels, and optional derived assets.

### `serializeM0cFile(opts): string`

```typescript
serializeM0cFile(opts: {
  m0: string;
  size?: { width: number; height: number } | null;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
  labels?: Record<string, M0Label> | null;
  deriveImage?: M0cDeriveImage | null;
}): string
```

Canonicalizes DSL payload. Sorts label keys alphabetically. Filters empty label text. 2-space indented JSON with trailing newline. Deterministic output.

### `parseM0cFile(jsonText: string): M0cFile`

Parses a `.m0c` JSON file. Requires `format: "m0c"`, `version: 1`, `created`, `m0`. Validates size, labels, and derive image structure. Ignores unknown fields (forward-compatible).

---

## Types

### `M0File`

```typescript
type M0File = {
  version: 1;
  created: string;                              // ISO 8601 string (not Date)
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;
  size: { width: number; height: number } | null;
  m0: string;                                   // canonical DSL payload
};
```

### `M0FileMeta`

```typescript
type M0FileMeta = {
  title?: string;
  author?: string;
  source?: string;
  note?: string;
};
```

### `M0cFile`

```typescript
type M0cFile = {
  format: "m0c";
  version: 1;
  created: string;
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;
  size: { width: number; height: number } | null;
  m0: string;
  labels: Record<string, M0Label> | null;   // keyed by StableKey
  derive: { image: M0cDeriveImage | null };
};
```

### `M0cDeriveImage`

```typescript
type M0cDeriveImage = {
  mime: M0cDeriveImageMime;
  bytes: number;    // decoded byte length
  b64: string;      // base64-encoded data
};
```

### `M0cDeriveImageMime`

```typescript
type M0cDeriveImageMime = "image/png" | "image/jpeg" | "image/webp";
```

---

## Guarantees

- **Canonical payloads**: layout field (`m0saic` in `.m0`, `m0` in `.m0c`) is always canonical (`F`→`1`, `>`→`0`, whitespace stripped)
- **Deterministic serialization**: fixed header order, sorted label keys, consistent formatting
- **Roundtrip stability**: `parse(serialize(x))` preserves all fields
- **Null-stable shape**: optional fields normalize to `null`, never `undefined`
- **Forward-compatible parsing**: unknown headers/fields silently ignored
- **Format version rule**: within v1.x of this package, `version === 1` for both formats. A new format version requires a major package version bump.
