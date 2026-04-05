# perf/

Performance and breakpoint tests for the DSL parser and validator.

**Rules:**
- Tests must NOT depend on `@m0saic/dsl-file-formats` or any file-format APIs
- Tests must operate on raw DSL strings only
- File-format tests (`.m0` / `.m0c` serialization) belong in `packages/dsl-file-formats`
- Load fixtures as raw text, not via `parseM0File`
