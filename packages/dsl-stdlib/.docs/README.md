# dsl-stdlib design rules

This folder contains design rules and philosophy for the m0 DSL standard library.

## What this is

Concise, rule-based documentation that defines the **intent** behind `dsl-stdlib` — not just what the API does, but why it works the way it does and what constraints must hold.

These rules are part of the system contract. Violating them produces code that is technically valid but semantically wrong.

## Who this is for

- Contributors implementing new transforms or builders
- Advanced users composing stdlib operations
- AI agents generating or modifying DSL transforms

## How to read these docs

Each file is organized as a set of **rules**. Rules are short, opinionated, and final. Examples are provided where the rule isn't self-evident.

| File | Covers |
|------|--------|
| `node-taxonomy.md` | Node vs Tile vs Frame — naming tiers |
| `selector-semantics.md` | LogicalIndex vs Span vs StableId |
| `primitives-vs-composed.md` | Transform architecture and dependency direction |
| `overlay-ownership.md` | Overlay attachment, add/remove semantics |
| `hygiene-rules.md` | DSL output quality and idiom |
