import {
  getNextToken,
  findMatchingClose,
  enclosureCloseFor,
} from "../../_internal/lexUtils";
import {
  validateInputOrThrow,
  finalizeM0Output,
  type OpOutputOptions,
} from "../../_internal/output";

/**
 * Add an overlay `{F}` to every rendered frame (`1` / `F`) that does not
 * already own one.
 *
 * Frames that already have an immediately attached overlay block are left
 * unchanged — both the frame and its overlay body are preserved as-is.
 * Group/container overlays, passthrough tokens, null tokens, and nested
 * classifier structure are all preserved.
 *
 * The walk recurses into classifier bodies `(...)` and `[...]` to find
 * frames at all structural depths, but does **not** recurse into overlay
 * bodies `{...}` — existing overlay content is never modified.
 *
 * This is a safe structural replacement for regex-based overlay injection
 * patterns like `m0saic.replace(/(?<=…)1(?=…)/g, "1{1}")`.
 *
 * @param m0    The m0 string
 * @param opts  Optional output format preference
 * @returns     The modified canonical string with overlays on all rendered frames
 *
 * @example
 * addOverlayToAllFrames("3(1,0,1)")
 * // => "3(1{1},0,1{1})"
 *
 * @example
 * addOverlayToAllFrames("2[1{1},1]")
 * // => "2[1{1},1{1}]"  — first frame already has overlay, preserved
 *
 * @example
 * addOverlayToAllFrames("2(1,1){1}")
 * // => "2(1{1},1{1}){1}"  — group overlay preserved, child overlays added
 */
export function addOverlayToAllFrames(
  m0: string,
  opts?: OpOutputOptions,
): string {
  const canonical = validateInputOrThrow("addOverlayToAllFrames", m0);

  const result = rewriteAll(canonical);

  return finalizeM0Output("addOverlayToAllFrames", result, opts);
}

/**
 * Single-pass token walk that adds `{F}` after every rendered frame that
 * does not already own an overlay.
 *
 * Recurses into classifier bodies but preserves overlay bodies verbatim.
 */
function rewriteAll(s: string): string {
  let out = "";
  while (s.length > 0) {
    const t = getNextToken(s);
    s = s.substring(t.length);

    if (t === "") break;

    // Rendered frame: 1 or F — check for existing overlay
    if (t === "1" || t === "F") {
      if (s.length > 0 && s.charAt(0) === "{") {
        // Already has overlay — preserve frame + overlay verbatim (no recursion)
        const end = findMatchingClose(s.substring(1), "{");
        const overlay = s.substring(0, end + 2); // includes { ... }
        s = s.substring(end + 2);
        out += "F" + overlay;
      } else {
        // No overlay — add {F}
        out += "F{F}";
      }
      continue;
    }

    // Non-frame leaf primitives: pass through, normalize
    if (t === "0" || t === ">" || t === "-") {
      const canonicalToken = t === "0" ? ">" : t;
      out += canonicalToken;
      continue;
    }

    // Comma
    if (t === ",") {
      out += t;
      continue;
    }

    // Overlay block not attached to a frame (group overlay) — preserve verbatim
    if (t === "{") {
      const end = findMatchingClose(s, "{");
      const block = s.substring(0, end + 1); // inner + closing }
      s = s.substring(end + 1);
      out += "{" + block;
      continue;
    }

    // Bare classifier open — recurse into body
    if (t === "(" || t === "[") {
      const end = findMatchingClose(s, t);
      const inner = s.substring(0, end);
      const rest = s.substring(end + 1);
      out += t + rewriteAll(inner) + enclosureCloseFor(t);
      s = rest;
      continue;
    }

    // Number token: followed by ( or [
    out += t;
    if (s.length === 0) break;
    const t2 = getNextToken(s);
    if (t2 !== "(" && t2 !== "[") {
      out += t2;
      s = s.substring(t2.length);
      continue;
    }
    s = s.substring(t2.length);
    const end = findMatchingClose(s, t2);
    const inner = s.substring(0, end);
    const rest = s.substring(end + 1);
    out += t2 + rewriteAll(inner) + enclosureCloseFor(t2);
    s = rest;
  }
  return out;
}
