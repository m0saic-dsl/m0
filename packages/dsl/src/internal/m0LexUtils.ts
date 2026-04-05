export function isNumericChar(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 48 && c <= 57;
}

export function getNextToken(s: string): string {
  let c = s.charAt(0);

  if (isNumericChar(c) && c !== "0" && s.length !== 1) {
    let i = 1;
    while (i < s.length && isNumericChar(s.charAt(i))) {
      c += s.charAt(i);
      i++;
    }
  }

  return c;
}

export function enclosureCloseFor(open: string): string {
  switch (open) {
    case "(":
      return ")";
    case "[":
      return "]";
    case "{":
      return "}";
    default:
      throw new Error(`Unsupported enclosure open: ${open}`);
  }
}

/**
 * Find the position of the matching close bracket for `open`.
 *
 * Only tracks depth for the single bracket type (`open`/`close`).
 * Does NOT handle cross-bracket nesting — `([)]` would match incorrectly.
 * Callers must ensure the input is already validated for balanced brackets
 * (e.g., via the validator's balance check).
 */
export function findMatchingClose(sAfterOpen: string, open: string): number {
  const close = enclosureCloseFor(open);
  let depth = 1;

  for (let i = 0; i < sAfterOpen.length; i++) {
    const ch = sAfterOpen.charAt(i);
    if (ch === open) depth++;
    else if (ch === close) depth--;
    if (depth === 0) return i;
  }

  throw new Error(`Unclosed enclosure for ${open}`);
}
