/**
 * Collapse overlay chains into nested form.
 *
 * Rewrites adjacent overlay chains into the deepest possible nesting:
 *
 *   X{A}{B}        → X{A{B}}
 *   X{A}{B}{C}     → X{A{B{C}}}
 *   1{2{3}}{4}     → 1{2{3{4}}}
 *   1{2{3}}{4}{5}  → 1{2{3{4{5}}}}
 *
 * Each chain continuation nests inside the innermost overlay of the
 * preceding expression, preserving paint order (base → A → B → C).
 *
 * Idempotent — already-nested strings pass through unchanged.
 *
 * **Important context:**
 * - The input may contain overlay chains which are INVALID DSL — the validator
 *   rejects `}{`. This function normalizes generated / intermediate strings
 *   (e.g., from flattening or composition) before validation.
 * - This is NOT part of the DSL language semantics. It is a preprocessing /
 *   normalization helper that lives in dsl-stdlib, not in the core DSL package.
 * - Expects a canonical (whitespace-free, F/> already converted) m0 string.
 */

import { findMatchingClose } from "./_internal/lexUtils";

export function rewriteOverlayChains(s: string): string {
  // Fast path
  if (!s.includes("}{")) return s;

  // Strategy: iteratively find `}{` boundaries and nest the second overlay
  // at the deepest point of the first. We use the original splicing algorithm
  // but locate the correct insertion point — just before the LAST `}` of the
  // left overlay subtree (the innermost close).
  //
  // For `1{2{3}}{4}`:
  //   - Chain boundary at `}}{4}` — the outer `}` at position 6
  //   - The innermost close of the left subtree is at position 5 (closing `{3}`)
  //   - Remove the outer `}` at 6, find matching close of `{4}`, insert `}` after it
  //   - Result: `1{2{3{4}}}`

  let result = s;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Find the first `}{` chain boundary.
    // We need the OUTERMOST `}` that is followed by `{` — this is the overlay
    // close that forms the chain. But to nest deeply, we remove THIS `}` and
    // push it past the second overlay's close.
    const idx = result.indexOf("}{");
    if (idx === -1) break;

    // `idx` is the position of the `}` in `}{`.
    // Remove it — this "opens up" the left overlay to accept the right one.
    const withoutClose = result.substring(0, idx) + result.substring(idx + 1);

    // The `{` that was at idx+1 is now at idx. Find its matching `}`.
    const afterOpen = withoutClose.substring(idx + 1);
    const matchOffset = findMatchingClose(afterOpen, "{");
    const matchPos = idx + 1 + matchOffset;

    // Re-insert the removed `}` right after the matched close.
    result =
      withoutClose.substring(0, matchPos + 1) +
      "}" +
      withoutClose.substring(matchPos + 1);
  }

  return result;
}
