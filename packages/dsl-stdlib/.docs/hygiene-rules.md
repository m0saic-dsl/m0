# DSL hygiene rules

Rules for producing clean, idiomatic m0 DSL output.

Valid DSL is not necessarily good DSL. The stdlib must produce output that is correct, composable, and structurally sound.

---

## Rule: Avoid null chains

Bad:
```
-,-,-
```

Better:
```
0,0,-
```

Why:
- Null chains destroy structure. Three consecutive `-` tokens collapse into dead geometry with no anchor points.
- Passthrough (`>` / `0`) preserves flow — a future transform can replace a passthrough with a real tile or split.
- Null (`-`) terminates flow permanently.

---

## Rule: Prefer passthrough over null when preserving structure

- `>` keeps the slot alive. It donates its space to the next claimant but remains a valid target for future transforms.
- `-` kills the slot. It produces dead geometry that cannot be reclaimed without restructuring the parent.

Use `-` only when the intent is to permanently discard a region (e.g., gap sinks in measure splits).

---

## Rule: Composed transforms should generate idiomatic DSL

A transform that produces `10(>,>,>,>,>,>,>,>,>,1)` is valid. But if the intent is a single tile, `1` is better.

Stdlib output should be:
- Minimal — no unnecessary wrapper splits
- Canonical — `1` not `F`, `0` not `>`
- Structurally clean — no redundant nesting

---

## Rule: Every slot should remain meaningful

Avoid generating layouts where slots serve no purpose. Every passthrough should donate to a claimant. Every null should represent an intentional absence.

Dead geometry (slots that are neither claimed nor intentionally absent) signals a bug in the transform logic.

---

## Rule: Canonicalize all output

All stdlib functions must return canonical DSL:
- `F` → `1`
- `>` → `0`
- No whitespace

This is enforced by `finalizeM0Output`. Never bypass it.
