# Primitives vs composed transforms

The `transforms/` directory is split into two layers with a strict dependency direction.

```
transforms/
  primitives/     ← stable, minimal, composable
  composed/       ← higher-level, product-aware
  _internal/      ← shared utilities (lexUtils, output, constants)
```

---

## Primitives

Located in `transforms/primitives/`.

Categories:
- **split** — divide a tile into a multi-child container
- **replace** — swap a node body with a new fragment
- **overlay** — add/remove `{...}` blocks
- **tile** — change leaf primitive type (F, >, -)

Properties:
- Minimal logic — one clear mutation per function
- Predictable — same input always produces same output
- Composable — can be chained or used as building blocks
- Stable forever — these APIs do not change

Each category provides three selector variants: `BySpan`, `ByStableId`, `ByLogicalIndex`.

---

## Composed

Located in `transforms/composed/`.

Categories:
- **measure** — measure-mode splits with kept groups and gap sinks
- **overlay** — bulk overlay operations (`addOverlayToAllFrames`)
- **swap** — atomic multi-target tile mutations (`swapFramesByLogicalIndex`)

Properties:
- Higher-level — encode product decisions (e.g., how gaps are filled)
- Built on primitives or on shared `_internal/` walk infrastructure
- May evolve — semantics can change as the product evolves

---

## Rule: One-way dependency

```
composed → primitives     (allowed)
primitives → composed     (NEVER)
primitives → primitives   (allowed, within reason)
composed → composed       (allowed)
```

A primitive that imports from `composed/` is a structural violation.

---

## Rule: Keep primitives clean

Primitives must not contain:
- UI assumptions (viewport size, user intent)
- Heuristics (guessing what the user wants)
- Opinionated layout shaping (aesthetic preferences)
- Product-specific logic (measure mode, templates)

If a transform needs any of these, it belongs in `composed/`.

---

## Rule: Shared helpers live in `_internal/`

Utilities used across both layers:
- `lexUtils.ts` — token walking
- `output.ts` — `finalizeM0Output`, `validateInputOrThrow`, `assertValidSpan`, `assertRenderedTileSpan`, `OpOutputOptions`
- `constants.ts` — `SAFE_PARSE_CANVAS`
- `walkByLogicalIndex.ts` — shared token-walk rewrite engine for all `*ByLogicalIndex` transforms
- `resolveSpanByStableId.ts` — shared stableKey → span resolver for all `*ByStableId` transforms

Category-specific helpers (e.g., `buildSplitFragment`, `buildMeasureFragment`) live in the category's own `_internal/` folder.
