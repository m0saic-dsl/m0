import {
  getNextToken,
  findMatchingClose,
  enclosureCloseFor,
} from "./lexUtils";

/**
 * Context passed to the match callback when a rendered frame at the target
 * logical index is found during the token walk.
 */
export interface FrameMatchContext {
  /** The remaining string immediately after the consumed frame token. */
  rest: string;
  /** Whether an overlay `{...}` immediately follows the frame. */
  hasOverlay: boolean;
  /**
   * If `hasOverlay` is true, the full overlay text including braces (e.g. `{1}`).
   * If false, empty string.
   */
  overlay: string;
  /**
   * Number of characters consumed by the overlay (0 if no overlay).
   * The caller should advance `rest` by this amount after consuming the overlay.
   */
  overlayLength: number;
}

/**
 * Return value from the match callback.
 */
export interface FrameMatchResult {
  /** Text to emit in place of the matched frame (and its overlay, if consumed). */
  output: string;
  /**
   * How many characters of `rest` the callback consumed beyond the frame token.
   * Typically 0 if the callback does not touch the overlay, or
   * `overlayLength` if the callback consumed/reattached the overlay.
   */
  consumedFromRest: number;
}

/**
 * Walk a canonical m0 string by logical index, applying a callback when
 * the target rendered frame is found.
 *
 * This centralizes the recursive token-walk / rewrite engine shared by all
 * `*ByLogicalIndex` transform functions. The walk:
 *
 * - Counts only rendered frames (`1` / `F`) for logical index targeting
 * - Normalizes `1` → `F` and `0` → `>` in the output (canonical pretty form)
 * - Recursively processes overlay `{...}` and classifier `(...)` / `[...]` bodies
 * - Preserves all other tokens (`,`, `-`, numbers) verbatim
 *
 * The `onMatch` callback receives context about the matched frame (including
 * overlay lookahead) and returns the replacement text.
 */
export function walkByLogicalIndex(
  canonical: string,
  targetIndex: number,
  onMatch: (ctx: FrameMatchContext) => FrameMatchResult,
): { result: string; found: boolean } {
  let logicalIndex = 0;
  let found = false;

  const rewrite = (s: string): string => {
    let out = "";
    while (s.length > 0) {
      const t = getNextToken(s);
      s = s.substring(t.length);

      if (t === "") break;

      // Rendered frame primitives: F, 1 — these increment the logical index
      if (t === "1" || t === "F") {
        if (!found && logicalIndex === targetIndex) {
          found = true;

          // Detect overlay lookahead
          let hasOverlay = false;
          let overlay = "";
          let overlayLength = 0;
          if (s.length > 0 && s.charAt(0) === "{") {
            hasOverlay = true;
            const end = findMatchingClose(s.substring(1), "{");
            overlayLength = end + 2; // includes { ... }
            overlay = s.substring(0, overlayLength);
          }

          const match = onMatch({
            rest: s,
            hasOverlay,
            overlay,
            overlayLength,
          });
          out += match.output;
          s = s.substring(match.consumedFromRest);
        } else {
          out += "F";
        }
        logicalIndex++;
        continue;
      }

      // Non-frame leaf primitives: 0, >, - — do NOT increment logical index
      if (t === "0" || t === ">" || t === "-") {
        const canonicalToken = t === "0" ? ">" : t;
        out += canonicalToken;
        continue;
      }

      // Comma: delimiter
      if (t === ",") {
        out += t;
        continue;
      }

      // Overlay: recurse into {...}
      if (t === "{") {
        const end = findMatchingClose(s, "{");
        const inner = s.substring(0, end);
        const rest = s.substring(end + 1);
        out += "{" + rewrite(inner) + "}";
        s = rest;
        continue;
      }

      // Bare classifier open (no leading number)
      if (t === "(" || t === "[") {
        const end = findMatchingClose(s, t);
        const inner = s.substring(0, end);
        const rest = s.substring(end + 1);
        out += t + rewrite(inner) + enclosureCloseFor(t);
        s = rest;
        continue;
      }

      // Number token: followed by ( or [
      out += t;
      if (s.length === 0) break;
      const t2 = getNextToken(s);
      if (t2 !== "(" && t2 !== "[") {
        // malformed but preserve it (consume to avoid infinite loop)
        out += t2;
        s = s.substring(t2.length);
        continue;
      }
      s = s.substring(t2.length);
      const end = findMatchingClose(s, t2);
      const inner = s.substring(0, end);
      const rest = s.substring(end + 1);
      out += t2 + rewrite(inner) + enclosureCloseFor(t2);
      s = rest;
    }
    return out;
  };

  const result = rewrite(canonical);
  return { result, found };
}
