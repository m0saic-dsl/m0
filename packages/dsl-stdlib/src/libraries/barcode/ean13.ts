/**
 * EAN-13 (European Article Number, 13 digits) encoder per ISO/IEC 15420:2009.
 *
 * Structure:
 *   [Start guard] [6 left digits (L/G-code per parity)] [Center guard]
 *   [6 right digits (R-code)] [End guard]
 *
 * Total inner module width: 95 (3 + 42 + 5 + 42 + 3).
 *
 * The "first digit" of the 13-digit number is NOT encoded by any bar — it
 * is implicitly carried by the parity pattern of the 6 left digits. So a
 * 13-digit EAN encodes 12 visible-bar digits plus 1 implicit digit.
 *
 * Input is accepted in either of two forms:
 *   - 12 digits: this function computes the check digit and appends it.
 *   - 13 digits: this function verifies the check digit and throws on mismatch.
 *
 * Pure, deterministic, no I/O.
 */

import {
  CENTER_GUARD_WIDTHS,
  EAN_INNER_MODULES,
  END_GUARD_WIDTHS,
  G_CODES,
  L_CODES,
  PARITY_PATTERNS,
  R_CODES,
  START_GUARD_WIDTHS,
  computeEan13CheckDigit,
  verifyEan13CheckDigit,
} from "./eanShared";

export type Ean13Encoded = {
  /** 13-digit canonical payload (input + computed check digit OR verified-as-is). */
  payload: string;
  /** All 13 digit values 0–9 in display order. */
  symbols: number[];
  /**
   * Bar widths in left-to-right order. Alternates dark/light starting with
   * dark (the leading bar of the start guard). Always sums to 95.
   */
  widths: number[];
  /** Sum of widths — always 95 for EAN-13. */
  modulesWide: number;
};

export function ean13Encode(text: string): Ean13Encoded {
  if (!/^\d{12,13}$/.test(text)) {
    throw new Error(
      `ean13: expected 12 or 13 digits, got ${JSON.stringify(text)}`,
    );
  }

  let payload: string;
  if (text.length === 12) {
    const check = computeEan13CheckDigit(text);
    payload = text + check;
  } else {
    verifyEan13CheckDigit(text);
    payload = text;
  }

  const firstDigit = Number(payload[0]);
  const leftDigits = payload.slice(1, 7);
  const rightDigits = payload.slice(7, 13);
  const parity = PARITY_PATTERNS[firstDigit];

  const widths: number[] = [];

  // Start guard — bar/space/bar (3 modules).
  for (const w of START_GUARD_WIDTHS) widths.push(w);

  // 6 left digits — L-code or G-code per parity pattern. Each starts with
  // a space, so alternation continues correctly from the start guard's
  // trailing bar.
  for (let i = 0; i < 6; i++) {
    const d = Number(leftDigits[i]);
    const code = parity[i] === "L" ? L_CODES[d] : G_CODES[d];
    for (const w of code) widths.push(w);
  }

  // Center guard — space/bar/space/bar/space (5 modules). Each left digit
  // ends with a bar; the center starts with a space; alternation continues.
  for (const w of CENTER_GUARD_WIDTHS) widths.push(w);

  // 6 right digits — R-code. Each starts with a bar; the center ended with
  // a space; alternation continues.
  for (let i = 0; i < 6; i++) {
    const d = Number(rightDigits[i]);
    for (const w of R_CODES[d]) widths.push(w);
  }

  // End guard — bar/space/bar (3 modules). The last right digit ends with
  // a space; the end guard starts with a bar; alternation continues.
  for (const w of END_GUARD_WIDTHS) widths.push(w);

  let modulesWide = 0;
  for (const w of widths) modulesWide += w;
  if (modulesWide !== EAN_INNER_MODULES) {
    throw new Error(
      `ean13: internal inconsistency — widths sum to ${modulesWide}, expected ${EAN_INNER_MODULES}`,
    );
  }

  return {
    payload,
    symbols: payload.split("").map(Number),
    widths,
    modulesWide,
  };
}
