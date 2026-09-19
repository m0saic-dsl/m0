import { isValidM0String } from "@m0saic/dsl";

/**
 * Total overlay-layer count for an m0 string.
 *
 * Counts the deepest `{…}` nesting in the DSL and adds 1 for the
 * always-present base layer. Matches the ViewFrame layer-navigator
 * convention:
 *   - a flat grid → 1 layer (base only)
 *   - one overlay channel → 2 layers (base + overlay)
 *   - nested overlays bump the count further
 *
 * Validates the input first (via `isValidM0String`) and returns `null`
 * on bad input. Same shape as `@m0saic/dsl`'s `getFrameCount` — callers
 * can null-check with `??` if they want a fallback. Lives here, not in
 * `@m0saic/dsl`'s `ComplexityMetrics`, because dsl is frozen for this
 * round; a future minor bump on dsl can fold it in.
 *
 * The scan itself is O(n), no parse; the upfront validate is the only
 * cost above a raw brace-count. Pure, deterministic.
 */
export function getLayerCount(m0: string): number | null {
  if (!isValidM0String(m0)) return null;
  let depth = 0;
  let maxDepth = 0;
  for (let i = 0; i < m0.length; i++) {
    const ch = m0.charCodeAt(i);
    if (ch === 0x7b /* { */) {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === 0x7d /* } */) {
      depth--;
    }
  }
  return maxDepth + 1;
}
