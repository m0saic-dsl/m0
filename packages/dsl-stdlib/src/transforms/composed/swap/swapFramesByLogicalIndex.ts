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
 * Temporary marker used during the swap walk. Emitted at the first target's
 * position and replaced with the second target's content after the walk.
 *
 * This character is not valid in canonical m0 strings (the validator
 * rejects it), so it cannot collide with input content.
 */
const SWAP_MARKER = "\uFFFD";

/**
 * Atomically swap two rendered frames identified by logical index.
 *
 * Each frame's owned overlay travels with it — if frame A has overlay `{X}`
 * and frame B has no overlay, after the swap position A has no overlay and
 * position B has `{X}`.
 *
 * This avoids the shifting-target bug that would occur with two sequential
 * `replaceNodeByLogicalIndex` calls (which also incorrectly preserves the
 * *destination's* overlay instead of the *source's*).
 *
 * If `indexA === indexB`, the operation is a no-op.
 *
 * @param m0      The m0 string
 * @param indexA  0-based logical index of the first frame
 * @param indexB  0-based logical index of the second frame
 * @param opts    Optional output format preference
 * @returns       The modified canonical string with the two frames swapped
 *
 * @example
 * swapFramesByLogicalIndex("2(1{1},1)", 0, 1)
 * // => "2(1,1{1})"  — overlay travels with its frame
 *
 * @example
 * swapFramesByLogicalIndex("3(1,0,1)", 0, 1)
 * // => "3(1,0,1)"  — frames are identical, result unchanged
 */
export function swapFramesByLogicalIndex(
  m0: string,
  indexA: number,
  indexB: number,
  opts?: OpOutputOptions,
): string {
  if (!Number.isFinite(indexA) || indexA < 0)
    throw new Error("swapFramesByLogicalIndex: indexA must be >= 0");
  if (!Number.isFinite(indexB) || indexB < 0)
    throw new Error("swapFramesByLogicalIndex: indexB must be >= 0");

  const canonical = validateInputOrThrow("swapFramesByLogicalIndex", m0);

  // Same index — no-op
  if (indexA === indexB) {
    return finalizeM0Output("swapFramesByLogicalIndex", canonical, opts);
  }

  // Normalize so lo < hi
  const lo = Math.min(indexA, indexB);
  const hi = Math.max(indexA, indexB);

  const { result, foundBoth } = swapWalk(canonical, lo, hi);

  if (!foundBoth) {
    throw new Error(
      `swapFramesByLogicalIndex: one or both indices not found (indexA=${indexA}, indexB=${indexB})`,
    );
  }

  return finalizeM0Output("swapFramesByLogicalIndex", result, opts);
}

/**
 * Single-pass token walk that swaps two rendered frames (including overlays).
 *
 * When the frame at index `lo` is encountered, its content (frame + overlay)
 * is recorded and a temporary marker is emitted. When the frame at index `hi`
 * is encountered, its content is recorded and `lo`'s content is emitted in
 * its place. After the walk, the marker is replaced with `hi`'s content.
 */
function swapWalk(
  canonical: string,
  lo: number,
  hi: number,
): { result: string; foundBoth: boolean } {
  let logicalIndex = 0;
  let loContent = "";
  let hiContent = "";
  let foundLo = false;
  let foundHi = false;

  const rewrite = (s: string): string => {
    let out = "";
    while (s.length > 0) {
      const t = getNextToken(s);
      s = s.substring(t.length);

      if (t === "") break;

      // Rendered frame: 1 or F
      if (t === "1" || t === "F") {
        // Detect overlay
        let overlay = "";
        let overlayLen = 0;
        if (s.length > 0 && s.charAt(0) === "{") {
          const end = findMatchingClose(s.substring(1), "{");
          overlayLen = end + 2;
          overlay = s.substring(0, overlayLen);
        }

        if (!foundLo && logicalIndex === lo) {
          foundLo = true;
          loContent = "F" + overlay;
          s = s.substring(overlayLen);
          out += SWAP_MARKER;
        } else if (!foundHi && logicalIndex === hi) {
          foundHi = true;
          hiContent = "F" + overlay;
          s = s.substring(overlayLen);
          out += loContent;
        } else {
          out += "F";
        }
        logicalIndex++;
        continue;
      }

      // Non-frame leaf primitives
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

      // Overlay: recurse into {...}
      if (t === "{") {
        const end = findMatchingClose(s, "{");
        const inner = s.substring(0, end);
        const rest = s.substring(end + 1);
        out += "{" + rewrite(inner) + "}";
        s = rest;
        continue;
      }

      // Bare classifier open
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

  const rawResult = rewrite(canonical);
  const result = rawResult.replace(SWAP_MARKER, hiContent);
  return { result, foundBoth: foundLo && foundHi };
}
