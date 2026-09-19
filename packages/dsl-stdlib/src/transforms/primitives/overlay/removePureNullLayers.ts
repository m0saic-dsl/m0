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
 * Remove every ROOT-CHAIN overlay layer that paints nothing.
 *
 * The root-level overlay chain (`L0{L1{L2{...}}}` — the shape
 * {@link addOverlayLayer} and `placeRects` produce) accumulates layers
 * during exploration: draw commits, edit-mode re-lands, dropped
 * fragments. Layers whose expression contains no rendered tile (`1`)
 * anywhere — only `-` nulls and `0` passthroughs — contribute zero
 * paint and exist purely as structural leftovers. This transform drops
 * them and re-nests the survivors in their original order.
 *
 * Behavior:
 *
 *   - `removePureNullLayers("2(1,1){2(-,-)}")`        → `2(1,1)`
 *   - `removePureNullLayers("2(-,-){2(1,1)}")`        → `2(1,1)` (a
 *     paint-less BASE is dropped too — the first painting layer is
 *     promoted to base; paint order is preserved since the dropped
 *     base painted nothing).
 *   - `removePureNullLayers("A{B{C}}")` with B pure-null → `A{C}`.
 *   - Inner-cell overlays (e.g. `2[1{a},1]`) are part of their layer's
 *     expression and are NOT walked — only the trailing root-level
 *     `{...}` chain counts as layers. A layer whose only paint lives
 *     inside an inner-cell overlay is (correctly) kept.
 *
 * The document must keep at least one painting layer (guaranteed on
 * valid input — an all-null document fails NO_SOURCES upstream).
 *
 * @param m0   The m0 string
 * @param opts Optional output format preference
 */
export function removePureNullLayers(
  m0: string,
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("removePureNullLayers", m0);

  const layers = splitRootChain(canonical);
  const kept = layers.filter(layerHasPaint);

  if (kept.length === layers.length) {
    // Nothing to drop — return the canonical input unchanged.
    return finalizeM0Output("removePureNullLayers", canonical, opts);
  }
  if (kept.length === 0) {
    // Unreachable on validated input (NO_SOURCES), but fail loudly
    // rather than emit an unrenderable document.
    throw new Error(
      "removePureNullLayers: document has no painting layer to keep",
    );
  }

  let result = kept[kept.length - 1];
  for (let i = kept.length - 2; i >= 0; i--) {
    result = `${kept[i]}{${result}}`;
  }

  return finalizeM0Output("removePureNullLayers", result, opts);
}

/**
 * Split a canonical m0 string into its root-chain layer expressions:
 * `L0{L1{L2}}` → `["L0", "L1", "L2"]`. Each entry includes any
 * inner-cell overlays it carries; only the TRAILING root-level chain
 * braces are consumed by the walk (same walk as `addOverlayLayer`).
 */
export function splitRootChain(canonical: string): string[] {
  const layers: string[] = [];
  let pos = 0;
  let end = canonical.length;

  while (pos < end) {
    const sub = canonical.substring(pos, end);
    const exprLen = findExpressionLength(sub);
    const exprEnd = pos + exprLen;
    layers.push(canonical.substring(pos, exprEnd));

    if (exprEnd < end && canonical.charAt(exprEnd) === "{") {
      const innerOverlay = canonical.substring(exprEnd + 1, end);
      const closeOffset = findMatchingClose(innerOverlay, "{");
      pos = exprEnd + 1;
      end = exprEnd + 1 + closeOffset;
      continue;
    }
    break;
  }

  return layers;
}

/** Standalone rendered tile (`1` not part of a digit run) = paint. */
function layerHasPaint(layerExpr: string): boolean {
  return /(?<![0-9])1(?![0-9])/.test(layerExpr);
}

/**
 * Length (in chars) of the first complete m0 expression at the start
 * of `s`. Identical contract to `addOverlayLayer`'s internal helper —
 * leaf primitives are length 1; `N(...)` / `N[...]` span their whole
 * bracketed group. Trailing `{...}` overlays are NOT consumed.
 */
function findExpressionLength(s: string): number {
  if (s.length === 0) return 0;

  const t = getNextToken(s);

  if (t === "1" || t === "F" || t === "-" || t === "0" || t === ">") {
    return 1;
  }

  const tLen = t.length;
  if (tLen < s.length) {
    const bracket = s.charAt(tLen);
    if (bracket === "(" || bracket === "[") {
      const inner = s.substring(tLen + 1);
      const closeOffset = findMatchingClose(inner, bracket);
      return tLen + 1 + closeOffset + 1;
    }
  }

  return tLen;
}
