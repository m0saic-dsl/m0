import {
  getNextToken,
  findMatchingClose,
} from "../../_internal/lexUtils";
import {
  validateInputOrThrow,
  finalizeM0Output,
  type OpOutputOptions,
} from "../../_internal/output";

/**
 * Add a new overlay layer at the deepest root-level position.
 *
 * Mirrors the multi-layer composition convention that {@link placeRects}
 * produces — the new layer nests INSIDE the existing chain of root-level
 * overlays (`L0{L1{L2{...{Ln{newLayer}}}}}`). Compared to the unrelated
 * `addOverlayBySpan` family (which attaches an EMPTY `{F}` to a specific
 * leaf), this transform:
 *
 *   - takes the overlay's content as an argument (no separate `replace`
 *     pass needed to fill it),
 *   - auto-targets the deepest root-level position (no caller-side span
 *     hunting),
 *   - works the same way after any number of prior calls (calling it K
 *     times produces a K-deep nested chain).
 *
 * Behavior:
 *
 *   - `addOverlayLayer("X", "L")`              → `X{L}`
 *   - `addOverlayLayer("X{Y}", "L")`           → `X{Y{L}}`
 *   - `addOverlayLayer("X{Y{Z}}", "L")`        → `X{Y{Z{L}}}`
 *   - `addOverlayLayer("2(1,1)", "L")`         → `2(1,1){L}`
 *   - `addOverlayLayer("2[1{a},1]", "L")`      → `2[1{a},1]{L}` (the
 *     inner `1{a}` overlay is NOT touched — we only walk root-level
 *     overlays via the trailing `{...}` chain).
 *
 * Use cases: programmatic stacking of full-canvas overlay layers that
 * mirror placeRects' output shape (e.g. the editor's "Add as overlay"
 * draw-mode commit).
 *
 * @param m0           The base m0 string
 * @param layerContent The m0 string to nest as a new overlay layer
 * @param opts         Optional output format preference
 */
export function addOverlayLayer(
  m0: string,
  layerContent: string,
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("addOverlayLayer", m0);
  const layerCanonical = validateInputOrThrow(
    "addOverlayLayer (layerContent)",
    layerContent,
  );

  const insertAt = findDeepestRootOverlayEnd(canonical);

  const result =
    canonical.substring(0, insertAt) +
    "{" + layerCanonical + "}" +
    canonical.substring(insertAt);

  return finalizeM0Output("addOverlayLayer", result, opts);
}

/**
 * Walk root expression → root overlay → root expression … to find the
 * end of the deepest root-level expression. The returned position is
 * the right place to insert `{newLayer}` for canonical nested-overlay
 * composition.
 *
 * Concretely: start at offset 0, find the end of the first expression
 * (a leaf primitive, or `N(...)` / `N[...]` block). If the immediate
 * next char is `{`, this is a root-level overlay — recurse into its
 * content (the substring between the matched `{}`). Otherwise the
 * end-of-expression IS the insertion point.
 */
function findDeepestRootOverlayEnd(canonical: string): number {
  let pos = 0;
  let end = canonical.length;

  // Bounded loop — each iteration descends one overlay level, and the
  // m0 grammar caps overlay depth at well below the string length.
  while (pos < end) {
    const sub = canonical.substring(pos, end);
    const exprLen = findExpressionLength(sub);
    const exprEnd = pos + exprLen;

    if (exprEnd < end && canonical.charAt(exprEnd) === "{") {
      // Root-level overlay attached here — descend into its body.
      const innerOverlay = canonical.substring(exprEnd + 1, end);
      const closeOffset = findMatchingClose(innerOverlay, "{");
      pos = exprEnd + 1;
      end = exprEnd + 1 + closeOffset;
      continue;
    }

    return exprEnd;
  }

  return end;
}

/**
 * Length (in chars) of the first complete m0 expression at the start of `s`.
 *
 * Handles:
 *   - Leaf primitives — `1`, `F`, `-`, `0`, `>` → length 1
 *   - `N(...)` and `N[...]` blocks (N is `2..9` or any multi-digit
 *     number — `1(...)` / `1[...]` is illegal per the validator and
 *     therefore never appears here) → length spans the whole bracketed
 *     group, including the count prefix and matching close
 *
 * Does NOT consume any trailing `{...}` overlay — that's the caller's
 * job (it's what tells us whether to descend further).
 */
function findExpressionLength(s: string): number {
  if (s.length === 0) return 0;

  const t = getNextToken(s);

  // Leaf primitives (post-canonicalization F→1 and >→0; pre-canonical
  // forms still listed defensively).
  if (t === "1" || t === "F" || t === "-" || t === "0" || t === ">") {
    return 1;
  }

  // Numeric prefix → must be followed by `(` or `[` in valid m0.
  // getNextToken returns the full digit run (e.g. "2", "12", "100").
  const tLen = t.length;
  if (tLen < s.length) {
    const bracket = s.charAt(tLen);
    if (bracket === "(" || bracket === "[") {
      const inner = s.substring(tLen + 1);
      const closeOffset = findMatchingClose(inner, bracket);
      return tLen + 1 + closeOffset + 1;
    }
  }

  // Fallback (shouldn't happen on validated input).
  return tLen;
}
