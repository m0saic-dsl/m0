## dsl-visual-tests

Visual golden tests for `@m0saic/dsl-stdlib`.

These tests render m0 strings to wireframe PNGs and compare them against committed goldens. Each golden also has a sibling `.m0` file so the underlying geometry can be inspected directly.

### Purpose

- Validate **geometry correctness**, not styling
- Lock down layout invariants across stdlib helpers
- Provide human- and AI-readable artifacts (`.png` + `.m0`)

### Structure

Tests are organized by feature area:

- `grid/`
- `strip/`
- `split/`
- `measureSplit/`
- `overlay/`
- `edgeCases/`
- `replace/`
- `swap/`

Each folder contains:
- `*.goldens.test.ts`
- `__goldens__/` (PNG + `.m0` pairs)

### How it works

Each test:
1. Builds a DSL string using stdlib helpers
2. Serializes to a deterministic `.m0` file (includes `# size: WxH`)
3. Renders a wireframe PNG via the `m0saic` CLI
4. Compares against the committed golden

### Running tests

Verify mode (default):

npm test -- --testPathPattern dsl-visual-tests

Update goldens:

M0SAIC_UPDATE_GOLDENS=1 npm test -- --testPathPattern dsl-visual-tests

Verbose output:

M0SAIC_GOLDEN_VERBOSE=1 npm test -- --testPathPattern dsl-visual-tests

### Philosophy

- PNG = visual truth
- `.m0` = geometric truth
- Input string = “before”
- Golden = “after”

These tests are intentionally minimal and high-signal.  
Not all helpers require visual coverage—some are better validated via unit tests.

---

## License

Licensed under the Apache License, Version 2.0.  
See `LICENSE` and `NOTICE`.