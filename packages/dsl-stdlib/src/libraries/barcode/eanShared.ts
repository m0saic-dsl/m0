/**
 * EAN / UPC shared encoding tables + helpers.
 *
 * EAN-13 and UPC-A share their entire bar-encoding scheme:
 *   - The same 7-module-wide L / G / R code tables.
 *   - The same start guard (101), center guard (01010), end guard (101).
 *   - The same first-digit parity pattern table.
 *   - The same mod-10 check digit.
 *
 * UPC-A is structurally EAN-13 with an implicit leading "0" (encoded by
 * the parity pattern, not by any bar). The bar pattern of UPC-A is
 * BYTE-IDENTICAL to EAN-13("0" + upcaText). Only the HRI digit grouping
 * (1-5-5-1 vs 1-6-6) and the canonical payload form (12 vs 13 digits)
 * differ.
 *
 * Algorithmic reference: ISO/IEC 15420:2009 (EAN/UPC symbology).
 * Cross-verification reference: JsBarcode (Johan Lindell, MIT,
 * github.com/lindell/JsBarcode). Used as offline oracle only — no runtime
 * or test-time dependency.
 *
 * Pure, deterministic, no I/O.
 */

// ── 7-module-wide digit codes ───────────────────────────────────────

/**
 * L-code (Left Odd / Set A). Used for left-half digits with parity L.
 * 7 modules each, 4 alternating widths starting with **space** (light):
 *   widths[0]=space, widths[1]=bar, widths[2]=space, widths[3]=bar
 * Each L-code starts with `0` and ends with `1`, with an odd number of `1`s.
 */
export const L_CODES: readonly (readonly [number, number, number, number])[] = [
  [3, 2, 1, 1], // 0  0001101
  [2, 2, 2, 1], // 1  0011001
  [2, 1, 2, 2], // 2  0010011
  [1, 4, 1, 1], // 3  0111101
  [1, 1, 3, 2], // 4  0100011
  [1, 2, 3, 1], // 5  0110001
  [1, 1, 1, 4], // 6  0101111
  [1, 3, 1, 2], // 7  0111011
  [1, 2, 1, 3], // 8  0110111
  [3, 1, 1, 2], // 9  0001011
];

/**
 * G-code (Left Even / Set B). Used for left-half digits with parity G.
 * 7 modules each, 4 alternating widths starting with **space**.
 * Each G-code starts with `0` and ends with `1`, with an even number of `1`s.
 * (G-code n is the bit-reversal of R-code n.)
 */
export const G_CODES: readonly (readonly [number, number, number, number])[] = [
  [1, 1, 2, 3], // 0  0100111
  [1, 2, 2, 2], // 1  0110011
  [2, 2, 1, 2], // 2  0011011
  [1, 1, 4, 1], // 3  0100001
  [2, 3, 1, 1], // 4  0011101
  [1, 3, 2, 1], // 5  0111001
  [4, 1, 1, 1], // 6  0000101
  [2, 1, 3, 1], // 7  0010001
  [3, 1, 2, 1], // 8  0001001
  [2, 1, 1, 3], // 9  0010111
];

/**
 * R-code (Right / Set C). Used for right-half digits.
 * 7 modules each, 4 alternating widths starting with **bar** (dark):
 *   widths[0]=bar, widths[1]=space, widths[2]=bar, widths[3]=space
 * Each R-code is the bitwise inverse of the corresponding L-code.
 */
export const R_CODES: readonly (readonly [number, number, number, number])[] = [
  [3, 2, 1, 1], // 0  1110010
  [2, 2, 2, 1], // 1  1100110
  [2, 1, 2, 2], // 2  1101100
  [1, 4, 1, 1], // 3  1000010
  [1, 1, 3, 2], // 4  1011100
  [1, 2, 3, 1], // 5  1001110
  [1, 1, 1, 4], // 6  1010000
  [1, 3, 1, 2], // 7  1000100
  [1, 2, 1, 3], // 8  1001000
  [3, 1, 1, 2], // 9  1110100
];

// ── First-digit parity pattern ─────────────────────────────────────

/**
 * EAN-13 first-digit parity pattern table. Indexed by `firstDigit ∈ 0..9`,
 * returns 6 codes (`"L"` = use L-code, `"G"` = use G-code) for the 6 left-
 * half digits. UPC-A always uses the digit-0 pattern (all L) since it
 * prepends an implicit "0".
 */
export const PARITY_PATTERNS: readonly (readonly ("L" | "G")[])[] = [
  ["L", "L", "L", "L", "L", "L"], // 0
  ["L", "L", "G", "L", "G", "G"], // 1
  ["L", "L", "G", "G", "L", "G"], // 2
  ["L", "L", "G", "G", "G", "L"], // 3
  ["L", "G", "L", "L", "G", "G"], // 4
  ["L", "G", "G", "L", "L", "G"], // 5
  ["L", "G", "G", "G", "L", "L"], // 6
  ["L", "G", "L", "G", "L", "G"], // 7
  ["L", "G", "L", "G", "G", "L"], // 8
  ["L", "G", "G", "L", "G", "L"], // 9
];

// ── Guard widths ────────────────────────────────────────────────────

/**
 * Start guard: pattern "101" = bar, space, bar. 3 modules. Inner sequence
 * begins here, starting with a dark bar.
 */
export const START_GUARD_WIDTHS = [1, 1, 1] as const;

/**
 * Center guard: pattern "01010" = space, bar, space, bar, space. 5 modules.
 * Sits between the left 6 digits (each ending with bar) and right 6 digits
 * (each starting with bar), so the center alternates correctly with both.
 */
export const CENTER_GUARD_WIDTHS = [1, 1, 1, 1, 1] as const;

/**
 * End guard: pattern "101" = bar, space, bar. 3 modules. Inner sequence
 * ends with a dark bar, matching the right quiet zone's light start.
 */
export const END_GUARD_WIDTHS = [1, 1, 1] as const;

/** Total inner module width of any EAN-13 / UPC-A bar pattern. */
export const EAN_INNER_MODULES = 95;

// ── Check digit ─────────────────────────────────────────────────────

/**
 * Compute the EAN-13 mod-10 check digit for the first 12 digits.
 *
 * Formula (ISO/IEC 15420):
 *   sum = Σ digit[2i] × 1 + Σ digit[2i+1] × 3   (i = 0..5)
 *   check = (10 − sum mod 10) mod 10
 *
 * For UPC-A (12 digits including check), prepend "0" to recover the EAN-13
 * representation before calling this on the first 12 chars.
 */
export function computeEan13CheckDigit(twelve: string): number {
  if (!/^\d{12}$/.test(twelve)) {
    throw new Error(
      `ean: computeEan13CheckDigit expects 12 digits, got ${JSON.stringify(twelve)}`,
    );
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(twelve[i]);
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Verify the check digit of a 13-digit EAN-13 string. Throws on mismatch.
 */
export function verifyEan13CheckDigit(thirteen: string): void {
  if (!/^\d{13}$/.test(thirteen)) {
    throw new Error(
      `ean: verifyEan13CheckDigit expects 13 digits, got ${JSON.stringify(thirteen)}`,
    );
  }
  const expected = computeEan13CheckDigit(thirteen.slice(0, 12));
  const actual = Number(thirteen[12]);
  if (actual !== expected) {
    throw new Error(
      `ean: check digit mismatch — got ${actual}, expected ${expected} for ${thirteen.slice(0, 12)}`,
    );
  }
}
