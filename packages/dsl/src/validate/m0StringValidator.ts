import type { M0ValidationResult } from "../errors";
import { toCanonicalM0String } from "../format";
import {
  getNextToken,
  isNumericChar,
} from "../internal/m0LexUtils";

type EnclosureType = "PARENTHESIS" | "BRACKET" | "CURLYBRACE" | null;

type ValidationType =
  | "PRIMITIVE"
  | "COMMA"
  | "CLASSIFIEROPEN"
  | "CLASSIFIERCLOSE"
  | "OBJECTOPEN"
  | "OBJECTCLOSE"
  | "NUMBER";

const PARENTHESISOPEN = "(";
const PARENTHESISCLOSE = ")";
const BRACKETOPEN = "[";
const BRACKETCLOSE = "]";
const CURLYBRACEOPEN = "{";
const CURLYBRACECLOSE = "}";
const HYPHEN = "-";
const COMMA = ",";

const ALLOWEDCHARS: string[] = [
  PARENTHESISOPEN,
  BRACKETOPEN,
  CURLYBRACEOPEN,
  PARENTHESISCLOSE,
  BRACKETCLOSE,
  CURLYBRACECLOSE,
  COMMA,
  HYPHEN
];

class Enclosure {
  public type: EnclosureType = "PARENTHESIS";
  public openPosition: number = 0;

  constructor(t: EnclosureType, o: number) {
    this.type = t;
    this.openPosition = o;
  }
}

class ValidationResult {
  public result: boolean = false;
  public position: number = 0;
  public info: boolean = false;
  public innerResult?: M0ValidationResult;

  constructor(res: boolean, pos: number, info?: boolean, innerResult?: M0ValidationResult) {
    this.result = res;
    this.position = pos;
    if (info !== undefined) {
      this.info = info;
    }
    this.innerResult = innerResult;
  }
}

class Stack<T> {
  private items: T[] = [];

  push(item: T): void {
    this.items.push(item);
  }

  pop(): T | undefined {
    return this.items.pop();
  }

  peek(): T | undefined {
    return this.items[this.items.length - 1];
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

function characterCheck(s: string): { result: boolean; position: number } {
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    let valid = false;
    for (const allowed of ALLOWEDCHARS) {
      if (c === allowed) {
        valid = true;
        break;
      }
    }
    if (isNumericChar(c)) {
      valid = true;
    }
    if (!valid) {
      return { result: false, position: i };
    }
  }
  return { result: true, position: -1 };
}

function getEnclosureType(c: string): EnclosureType {
  if (c === PARENTHESISOPEN || c === PARENTHESISCLOSE) {
    return "PARENTHESIS";
  }
  if (c === BRACKETOPEN || c === BRACKETCLOSE) {
    return "BRACKET";
  }
  if (c === CURLYBRACEOPEN || c === CURLYBRACECLOSE) {
    return "CURLYBRACE";
  }
  return null;
}


/**
 * Token-rule matrix validator.
 * Checks that the current token is valid given the previous token type.
 * This is the heart of the DSL syntax validation.
 */
function checkValidationRules(prev: ValidationType, cur: ValidationType): boolean {
  if (prev === "PRIMITIVE") {
    if (
      cur !== "COMMA" &&
      cur !== "CLASSIFIERCLOSE" &&
      cur !== "OBJECTCLOSE" &&
      cur !== "OBJECTOPEN"
    ) {
      return false;
    }
  }

  if (prev === "COMMA") {
    if (cur !== "PRIMITIVE" && cur !== "NUMBER") {
      return false;
    }
  }

  if (prev === "CLASSIFIEROPEN") {
    if (cur !== "PRIMITIVE" && cur !== "NUMBER") {
      return false;
    }
  }

  if (prev === "CLASSIFIERCLOSE") {
    if (
      cur !== "COMMA" &&
      cur !== "CLASSIFIERCLOSE" &&
      cur !== "OBJECTCLOSE" &&
      cur !== "OBJECTOPEN"
    ) {
      return false;
    }
  }

  if (prev === "OBJECTOPEN") {
    if (cur !== "COMMA" && cur !== "PRIMITIVE" && cur !== "NUMBER") {
      return false;
    }
  }

  if (prev === "OBJECTCLOSE") {
    if (
      cur !== "CLASSIFIERCLOSE" &&
      cur !== "COMMA" &&
      cur !== "OBJECTCLOSE"
    ) {
      return false;
    }
  }

  if (prev === "NUMBER") {
    if (cur !== "CLASSIFIEROPEN") {
      return false;
    }
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// Structural index — built in a single O(n) pass
// ─────────────────────────────────────────────────────────────

/**
 * Pre-computed structural index for a balanced canonical string.
 *
 * Built in one O(n) left-to-right pass. Eliminates all O(n²) substring
 * scanning in tokenCheck, tokenNumberCheck, checkTrailingPassthrough,
 * and findZeroSourceOverlayPosition.
 */
type StructuralIndex = {
  /** Maps each opener position to its matching closer position. */
  matchingClose: Int32Array;
  /**
   * For each opener `(`, `[`, `{` at position p: the positions of
   * depth-0 commas inside the pair. Gives O(1) child-count and
   * child-boundary lookup.
   */
  childCommas: Map<number, number[]>;
};

function buildStructuralIndex(s: string): StructuralIndex {
  const matchingClose = new Int32Array(s.length).fill(-1);
  const childCommas = new Map<number, number[]>();

  // Stack of opener positions
  const stack: number[] = [];
  // For each depth level, track the opener whose direct commas we're recording
  const openerAtDepth: number[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    // ( = 40, [ = 91, { = 123
    if (ch === 40 || ch === 91 || ch === 123) {
      stack.push(i);
      openerAtDepth.push(i);
      childCommas.set(i, []);
    }
    // ) = 41, ] = 93, } = 125
    else if (ch === 41 || ch === 93 || ch === 125) {
      const opener = stack.pop()!;
      openerAtDepth.pop();
      matchingClose[opener] = i;
    }
    // , = 44
    else if (ch === 44) {
      // Record comma for the innermost enclosing opener
      if (openerAtDepth.length > 0) {
        const parent = openerAtDepth[openerAtDepth.length - 1];
        childCommas.get(parent)!.push(i);
      }
    }
  }

  return { matchingClose, childCommas };
}

// ─────────────────────────────────────────────────────────────
// Balance check
// ─────────────────────────────────────────────────────────────

function balanceCheck(s: string): { result: boolean; position: number } {
  const enclosures = new Stack<Enclosure>();
  for (let i = 0; i < s.length; i++) {
    const currentChar = s.charAt(i);
    switch (currentChar) {
      case PARENTHESISOPEN:
      case BRACKETOPEN:
        enclosures.push(new Enclosure(getEnclosureType(currentChar), i));
        break;
      case CURLYBRACEOPEN:
        enclosures.push(new Enclosure("CURLYBRACE", i));
        break;
      case PARENTHESISCLOSE:
      case BRACKETCLOSE:
        if (enclosures.isEmpty()) {
          return { result: false, position: i };
        } else if (getEnclosureType(currentChar) !== enclosures.peek()?.type) {
          return {
            result: false,
            position: enclosures.peek()?.openPosition ?? -1,
          };
        } else {
          enclosures.pop();
        }
        break;
      case CURLYBRACECLOSE:
        if (enclosures.isEmpty()) {
          return { result: false, position: i };
        }
        if (enclosures.peek()?.type === "CURLYBRACE") {
          enclosures.pop();
        } else {
          return {
            result: false,
            position: enclosures.peek()?.openPosition ?? -1,
          };
        }
        break;
    }
  }
  if (!enclosures.isEmpty()) {
    return { result: false, position: enclosures.pop()?.openPosition ?? -1 };
  }
  return { result: true, position: -1 };
}

// ─────────────────────────────────────────────────────────────
// Iterative token-rule check — O(n) offset-based scanning
//
// Validates token sequences by reading tokens at increasing
// offsets into the original string. No substring copies.
// ─────────────────────────────────────────────────────────────

/**
 * Read the next token starting at `pos` in `s`, return its length.
 * Classifies the token into a ValidationType.
 *
 * Token rules (canonical form):
 * - Single char: 0, 1, -, (, ), [, ], {, }, ,
 * - Multi-digit number: 1-9 followed by more digits
 */
function readTokenAt(s: string, pos: number): { len: number; type: ValidationType } {
  const ch = s.charCodeAt(pos);

  // 0 (48), - (45), or 1 (49) not followed by digit → PRIMITIVE
  if (ch === 48 || ch === 45) return { len: 1, type: "PRIMITIVE" };
  if (ch === 49) {
    // '1' — check if followed by another digit (making it part of a multi-digit number)
    if (pos + 1 < s.length) {
      const next = s.charCodeAt(pos + 1);
      if (next >= 48 && next <= 57) {
        // Multi-digit starting with 1 (e.g. 10, 12, 100)
        let j = pos + 2;
        while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
        return { len: j - pos, type: "NUMBER" };
      }
    }
    return { len: 1, type: "PRIMITIVE" };
  }

  // Digits 2-9: always start a multi-digit number
  if (ch >= 50 && ch <= 57) {
    let j = pos + 1;
    while (j < s.length && s.charCodeAt(j) >= 48 && s.charCodeAt(j) <= 57) j++;
    return { len: j - pos, type: "NUMBER" };
  }

  // Single-char structural tokens
  if (ch === 44) return { len: 1, type: "COMMA" };           // ,
  if (ch === 40 || ch === 91) return { len: 1, type: "CLASSIFIEROPEN" };  // ( [
  if (ch === 41 || ch === 93) return { len: 1, type: "CLASSIFIERCLOSE" }; // ) ]
  if (ch === 123) return { len: 1, type: "OBJECTOPEN" };     // {
  if (ch === 125) return { len: 1, type: "OBJECTCLOSE" };    // }

  // Unknown character — will be caught by characterCheck, treat as PRIMITIVE
  return { len: 1, type: "PRIMITIVE" };
}

function iterativeCheck(input: string): { result: boolean; position: number } {
  if (input.length === 0) return { result: false, position: 0 };

  // First token must be numeric (a number or '1')
  const first = readTokenAt(input, 0);
  if (first.type !== "PRIMITIVE" && first.type !== "NUMBER") {
    return { result: false, position: 0 };
  }
  // First token must be all digits
  for (let i = 0; i < first.len; i++) {
    if (!isNumericChar(input.charAt(i))) return { result: false, position: 0 };
  }

  let pos = first.len;
  if (pos >= input.length) return { result: false, position: 0 };

  // Second token must be CLASSIFIEROPEN or OBJECTOPEN
  const sec = readTokenAt(input, pos);
  if (sec.type !== "CLASSIFIEROPEN" && sec.type !== "OBJECTOPEN") {
    return { result: false, position: pos };
  }
  let prev: ValidationType = sec.type;
  pos += sec.len;

  // Remaining tokens: validate each (prev, cur) pair
  while (pos < input.length) {
    const tok = readTokenAt(input, pos);
    if (!checkValidationRules(prev, tok.type)) {
      return { result: false, position: pos };
    }
    prev = tok.type;
    pos += tok.len;
  }

  // Final token must be PRIMITIVE, CLASSIFIERCLOSE, or OBJECTCLOSE
  if (
    prev !== "PRIMITIVE" &&
    prev !== "CLASSIFIERCLOSE" &&
    prev !== "OBJECTCLOSE"
  ) {
    return { result: false, position: pos };
  }

  return { result: true, position: -1 };
}

// ─────────────────────────────────────────────────────────────
// Token check — O(n) using structural index
// ─────────────────────────────────────────────────────────────

/**
 * Validate token count and structure using the pre-built structural index.
 * Operates on absolute positions in the original string — no substrings.
 */
// Iterative with explicit stack to avoid V8 call-stack overflow
// on deeply nested but valid DSL inputs (nesting depth >5000).
function tokenCheckIndexed(
  s: string,
  idx: StructuralIndex,
  startArg: number,
  endArg: number,
): ValidationResult {
  // Stack of {start, end} ranges still to validate.
  const pending: Array<{ start: number; end: number }> = [{ start: startArg, end: endArg }];

  while (pending.length > 0) {
    const { start, end } = pending.pop()!;

    // Extract leading token
    let i = start;
    while (i < end && isNumericChar(s.charAt(i))) i++;
    if (i === start) {
      const ch = s.charAt(start);
      if (ch === "1" || ch === "0" || ch === "-") continue; // valid primitive
      return new ValidationResult(false, start, true);
    }

    const tokenLen = i - start;
    const tokenStr = s.substring(start, i);

    if (i >= end) {
      if (tokenStr === "1" || tokenStr === "0" || tokenStr === "-") continue;
      return new ValidationResult(false, start, true);
    }

    const bracket = s.charAt(i);

    // Object (overlay): token + {inner}
    // Validate the overlay body inline via the pending stack instead of
    // recursing into a separate syntax-only validator, which would
    // recurse once per overlay nesting level and overflow on deep
    // valid chains like 1{1{1{...}}}.
    if (bracket === "{") {
      const closePos = idx.matchingClose[i];
      if (closePos < 0) return new ValidationResult(false, i, false);

      if (closePos + 1 < end) return new ValidationResult(false, closePos + 1, false);

      // Quick-reject bare overlay bodies that validateM0StringSyntaxOnly
      // would have caught (empty, bare 0, bare -)
      const innerLen = closePos - (i + 1);
      if (innerLen === 0) {
        return new ValidationResult(false, i + 1, true, {
          ok: false, error: { code: "INVALID_EMPTY", kind: "SYNTAX",
            message: "An empty m0 string is not a valid renderable layout.",
            position: 0, span: { start: 0, end: 0 } } });
      }
      if (innerLen === 1) {
        const innerCh = s.charAt(i + 1);
        if (innerCh === "0" || innerCh === "-") {
          const msg = innerCh === "0"
            ? "A bare passthrough tile ('0') produces no renderable output."
            : "A bare null tile ('-') produces no renderable output.";
          return new ValidationResult(false, i + 1, true, {
            ok: false, error: { code: "INVALID_EMPTY", kind: "SYNTAX",
              message: msg, position: 0, span: { start: 0, end: 1 } } });
        }
      }

      // Push overlay body range for validation on the same stack
      if (i + 1 < closePos) {
        pending.push({ start: i + 1, end: closePos });
      }
      continue;
    }

    // Classifier: token + ( or [ + children + ) or ]
    if (bracket !== "(" && bracket !== "[") {
      return new ValidationResult(false, i, false);
    }

    const closePos = idx.matchingClose[i];
    if (closePos < 0) return new ValidationResult(false, i, false);

    const tokenCount = parseInt(tokenStr, 10);
    const commas = idx.childCommas.get(i) ?? [];
    const childCount = commas.length + 1;

    if (childCount !== tokenCount) {
      if (childCount > tokenCount) {
        const extraComma = commas[tokenCount - 1];
        const t = getNextToken(s.substring(extraComma + 1));
        return new ValidationResult(false, extraComma + 1 + t.length + 1, false);
      }
      return new ValidationResult(false, start + tokenLen, false);
    }

    // Push each child range onto the stack (reverse order for LIFO)
    let childStart = i + 1;
    for (let ci = 0; ci < childCount; ci++) {
      const childEnd = ci < commas.length ? commas[ci] : closePos;
      pending.push({ start: childStart, end: childEnd });
      childStart = childEnd + 1;
    }

    // Check for trailing overlay after classifier close — validate
    // inline via the pending stack (same rationale as the overlay case above).
    if (closePos + 1 < end && s.charAt(closePos + 1) === "{") {
      const overlayOpen = closePos + 1;
      const overlayClose = idx.matchingClose[overlayOpen];
      if (overlayClose < 0) return new ValidationResult(false, overlayOpen, false);

      const ovInnerLen = overlayClose - (overlayOpen + 1);
      if (ovInnerLen === 0) {
        return new ValidationResult(false, overlayOpen + 1, true, {
          ok: false, error: { code: "INVALID_EMPTY", kind: "SYNTAX",
            message: "An empty m0 string is not a valid renderable layout.",
            position: 0, span: { start: 0, end: 0 } } });
      }
      if (ovInnerLen === 1) {
        const ch = s.charAt(overlayOpen + 1);
        if (ch === "0" || ch === "-") {
          const msg = ch === "0"
            ? "A bare passthrough tile ('0') produces no renderable output."
            : "A bare null tile ('-') produces no renderable output.";
          return new ValidationResult(false, overlayOpen + 1, true, {
            ok: false, error: { code: "INVALID_EMPTY", kind: "SYNTAX",
              message: msg, position: 0, span: { start: 0, end: 1 } } });
        }
      }

      if (overlayOpen + 1 < overlayClose) {
        pending.push({ start: overlayOpen + 1, end: overlayClose });
      }
    }
  }

  return new ValidationResult(true, startArg);
}

function findIllegalOneSplitPosition(s: string): number {
  for (let i = 0; i < s.length - 1; i++) {
    if (s.charAt(i) !== "1") continue;
    const next = s.charAt(i + 1);
    if (next !== "(" && next !== "[") continue;
    const prev = i > 0 ? s.charAt(i - 1) : "";
    if (i === 0 || !isNumericChar(prev)) {
      return i;
    }
  }
  return -1;
}

/**
 * Returns true if `s` contains at least one leaf '1' token.
 * A leaf '1' is a numeric run exactly equal to "1" NOT followed by '(' or '['.
 */
function hasLeafOneToken(s: string): boolean {
  let i = 0;
  while (i < s.length) {
    if (isNumericChar(s.charAt(i))) {
      const start = i;
      while (i < s.length && isNumericChar(s.charAt(i))) i++;
      const run = s.substring(start, i);
      if (run === "1") {
        const next = i < s.length ? s.charAt(i) : "";
        if (next !== "(" && next !== "[") return true;
      }
    } else {
      i++;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Semantic checks — O(n) using structural index
// ─────────────────────────────────────────────────────────────

/**
 * Check for trailing passthrough using the structural index.
 * Walks the tree via index lookups — no substring scanning.
 */
// Iterative with explicit stack to avoid V8 call-stack overflow
// on deeply nested but valid DSL inputs (nesting depth >5000).
function checkTrailingPassthroughIndexed(
  s: string,
  idx: StructuralIndex,
  startArg: number,
  endArg: number,
): number {
  const pending: Array<{ start: number; end: number }> = [{ start: startArg, end: endArg }];

  while (pending.length > 0) {
    const { start, end } = pending.pop()!;
    if (end - start <= 1) continue;

    let i = start;
    while (i < end && isNumericChar(s.charAt(i))) i++;
    if (i === start) i = start + 1;
    if (i >= end) continue;

    const bracket = s.charAt(i);

    if (bracket === "{") {
      const closePos = idx.matchingClose[i];
      if (closePos < 0) continue;
      pending.push({ start: i + 1, end: closePos });
      continue;
    }

    if (bracket !== "(" && bracket !== "[") continue;

    const closePos = idx.matchingClose[i];
    if (closePos < 0) continue;

    const commas = idx.childCommas.get(i) ?? [];
    const childCount = commas.length + 1;

    const lastChildStart = childCount > 1 ? commas[commas.length - 1] + 1 : i + 1;
    const lastChildEnd = closePos;

    if (lastChildStart < lastChildEnd) {
      const firstToken = getNextToken(s.substring(lastChildStart, lastChildEnd));
      if (firstToken === "0") return lastChildStart;
    }

    let childStart = i + 1;
    for (let ci = 0; ci < childCount; ci++) {
      const childEnd = ci < commas.length ? commas[ci] : closePos;
      pending.push({ start: childStart, end: childEnd });
      childStart = childEnd + 1;
    }

    if (closePos + 1 < end && s.charAt(closePos + 1) === "{") {
      const overlayOpen = closePos + 1;
      const overlayClose = idx.matchingClose[overlayOpen];
      if (overlayClose > 0) {
        pending.push({ start: overlayOpen + 1, end: overlayClose });
      }
    }
  }

  return -1;
}

/**
 * Check every overlay body for presence of a leaf '1' using the structural index.
 */
// Iterative with explicit stack to avoid V8 call-stack overflow
// on deeply nested but valid DSL inputs (nesting depth >5000).
function findZeroSourceOverlayIndexed(
  s: string,
  idx: StructuralIndex,
  startArg: number,
  endArg: number,
): number {
  const pending: Array<{ start: number; end: number }> = [{ start: startArg, end: endArg }];

  while (pending.length > 0) {
    const { start, end } = pending.pop()!;
    let i = start;
    while (i < end) {
      if (s.charAt(i) === "{") {
        const closePos = idx.matchingClose[i];
        if (closePos < 0 || closePos >= end) { i++; continue; }

        // Push inner range to check nested overlays
        pending.push({ start: i + 1, end: closePos });

        // Check this overlay body
        const inner = s.substring(i + 1, closePos);
        if (!hasLeafOneToken(inner)) return i;

        i = closePos + 1;
      } else {
        i++;
      }
    }
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────
// Main validator — O(n) using structural index
// ─────────────────────────────────────────────────────────────

export function validateM0StringCanonical(
  input: string,
): M0ValidationResult {
  const chainPos = input.indexOf("}{");
  if (chainPos !== -1) {
    return {
      ok: false,
      error: {
        code: "OVERLAY_CHAIN",
        kind: "SYNTAX",
        message: "Overlay chains are not allowed; use nested overlays.",
        position: chainPos,
        span: { start: chainPos, end: chainPos + 2 },
      },
    };
  }

  const doubleOpenPos = input.indexOf("{{");
  if (doubleOpenPos !== -1) {
    return {
      ok: false,
      error: {
        code: "TOKEN_RULE",
        kind: "SYNTAX",
        message:
          "Invalid token sequence: '{' cannot be immediately followed by '{'.",
        position: doubleOpenPos,
        span: { start: doubleOpenPos, end: doubleOpenPos + 2 },
      },
    };
  }

  if (input === "") {
    return {
      ok: false,
      error: {
        code: "INVALID_EMPTY",
        kind: "SYNTAX",
        message: "An empty m0 string is not a valid renderable layout.",
        position: 0,
        span: { start: 0, end: 0 },
      },
    };
  }
  if (input === "1") return { ok: true };
  if (input === "-") {
    return {
      ok: false,
      error: {
        code: "INVALID_EMPTY",
        kind: "SYNTAX",
        message: "A bare null tile ('-') produces no renderable output.",
        position: 0,
        span: { start: 0, end: 1 },
      },
    };
  }
  if (input === "0") {
    return {
      ok: false,
      error: {
        code: "INVALID_EMPTY",
        kind: "SYNTAX",
        message: "A bare passthrough tile ('0') produces no renderable output.",
        position: 0,
        span: { start: 0, end: 1 },
      },
    };
  }

  const illegalOneSplitPos = findIllegalOneSplitPosition(input);
  if (illegalOneSplitPos !== -1) {
    return {
      ok: false,
      error: {
        code: "ILLEGAL_ONE_SPLIT",
        kind: "SYNTAX",
        message:
          "Invalid classifier: '1(' and '1[' are not allowed. Use a count >= 2 for splits.",
        position: illegalOneSplitPos,
        span: { start: illegalOneSplitPos, end: illegalOneSplitPos + 2 },
      },
    };
  }

  // Character check — O(n)
  let result = characterCheck(input);
  if (!result.result) {
    return {
      ok: false,
      error: {
        code: "INVALID_CHAR",
        kind: "SYNTAX",
        message: `Invalid character at position ${result.position}.`,
        position: result.position,
        span: { start: result.position, end: result.position + 1 },
      },
    };
  }

  // Balance check — O(n)
  result = balanceCheck(input);
  if (!result.result) {
    return {
      ok: false,
      error: {
        code: "UNBALANCED",
        kind: "SYNTAX",
        message: `Unbalanced brackets at position ${result.position}.`,
        position: result.position,
        span: { start: result.position, end: result.position + 1 },
      },
    };
  }

  // Build structural index — O(n), done once, used by all subsequent checks
  const idx = buildStructuralIndex(input);

  // Iterative token-rule check — O(n)
  result = iterativeCheck(input);
  if (!result.result) {
    return {
      ok: false,
      error: {
        code: "TOKEN_RULE",
        kind: "SYNTAX",
        message: `Invalid token sequence at position ${result.position}.`,
        position: result.position,
        span: { start: result.position, end: result.position + 1 },
      },
    };
  }

  // Token check (count + structure) — O(n) via index
  const tcResult2 = tokenCheckIndexed(input, idx, 0, input.length);
  if (!tcResult2.result) {
    const innerRes2 = tcResult2.innerResult;
    if (tcResult2.info && innerRes2 && innerRes2.ok === false) {
      const inner = innerRes2.error;
      const offset = tcResult2.position;
      return {
        ok: false,
        error: {
          code: inner.code,
          kind: inner.kind,
          message: inner.message,
          position: inner.position !== null ? inner.position + offset : offset,
          span: inner.span
            ? { start: inner.span.start + offset, end: inner.span.end + offset }
            : { start: offset, end: offset + 1 },
        },
      };
    }
    return {
      ok: false,
      error: {
        code: "TOKEN_COUNT",
        kind: "SYNTAX",
        message: `Child count mismatch at position ${tcResult2.position}.`,
        position: tcResult2.position,
        span: { start: tcResult2.position, end: tcResult2.position + 1 },
      },
    };
  }

  // No-sources check — O(n)
  if (!hasLeafOneToken(input)) {
    return {
      ok: false,
      error: {
        code: "NO_SOURCES",
        kind: "ANTIPATTERN",
        message:
          "Layout contains no source tiles — at least one '1' / 'F' is required.",
        position: 0,
        span: { start: 0, end: input.length },
      },
    };
  }

  // Zero-source overlay — O(n) via index
  const zsoPos = findZeroSourceOverlayIndexed(input, idx, 0, input.length);
  if (zsoPos !== -1) {
    return {
      ok: false,
      error: {
        code: "ZERO_SOURCE_OVERLAY",
        kind: "SEMANTIC",
        message:
          "Overlay body must contain at least one source tile ('1' / 'F').",
        position: zsoPos,
        span: { start: zsoPos, end: zsoPos + 1 },
      },
    };
  }

  // Root-level passthrough
  if (getNextToken(input) === "0") {
    return {
      ok: false,
      error: {
        code: "PASSTHROUGH_TO_NOTHING",
        kind: "ANTIPATTERN",
        message:
          "Passthrough '0 / >' cannot be the last child in a split — there is no next tile to donate space to.",
        position: 0,
        span: { start: 0, end: 1 },
      },
    };
  }

  // Passthrough-to-nothing — O(n) via index
  const ptPos = checkTrailingPassthroughIndexed(input, idx, 0, input.length);
  if (ptPos !== -1) {
    return {
      ok: false,
      error: {
        code: "PASSTHROUGH_TO_NOTHING",
        kind: "ANTIPATTERN",
        message:
          "Passthrough '0 / >' cannot be the last child in a split — there is no next tile to donate space to.",
        position: ptPos,
        span: { start: ptPos, end: ptPos + 1 },
      },
    };
  }

  return { ok: true };
}

/**
 * Validate a m0 string. Canonicalizes first (F→1, >→0, strip whitespace).
 *
 * @returns `{ ok: true }` if valid.
 *          `{ ok: false, error }` if invalid — `error` has `code` (e.g.
 *          `"UNBALANCED"`, `"NO_SOURCES"`), `message`, `position`, and `span`.
 *
 * Never throws.
 */
export function validateM0String(input: string): M0ValidationResult {
  input = toCanonicalM0String(input);
  return validateM0StringCanonical(input);
}

/**
 * Boolean shorthand for `validateM0String(input).ok`.
 *
 * @returns `true` if the input is a valid m0 string, `false` otherwise.
 */
export function isValidM0String(input: string): boolean {
  return validateM0String(input).ok;
}
