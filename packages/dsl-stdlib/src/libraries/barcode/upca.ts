/**
 * UPC-A (Universal Product Code, 12 digits) encoder per ISO/IEC 15420:2009.
 *
 * UPC-A is structurally EAN-13 with an implicit leading "0" — the bar
 * pattern of `upcaEncode(upca12)` is byte-identical to
 * `ean13Encode("0" + upca12)`. The only differences from EAN-13:
 *   - Canonical payload form is 12 digits (no leading zero).
 *   - HRI grouping is 1-5-5-1 instead of 1-6-6 (handled by the
 *     `barcodeToBars` dispatch, not here).
 *
 * Input is accepted in either of two forms:
 *   - 11 digits: this function computes the check digit and appends it.
 *   - 12 digits: this function verifies the check digit and throws on mismatch.
 *
 * Pure, deterministic, no I/O.
 */

import { ean13Encode } from "./ean13";
import { computeEan13CheckDigit } from "./eanShared";

export type UpcaEncoded = {
  /** 12-digit canonical payload (UPC-A form). */
  payload: string;
  /** All 12 digit values 0–9 in display order. */
  symbols: number[];
  /**
   * Bar widths in left-to-right order. Alternates dark/light starting with
   * dark. Always sums to 95 (identical to EAN-13 layout).
   */
  widths: number[];
  /** Sum of widths — always 95. */
  modulesWide: number;
};

export function upcaEncode(text: string): UpcaEncoded {
  if (!/^\d{11,12}$/.test(text)) {
    throw new Error(
      `upca: expected 11 or 12 digits, got ${JSON.stringify(text)}`,
    );
  }

  let upcaPayload: string;
  if (text.length === 11) {
    // Compute check digit using the EAN-13 form (prepend "0" → 12 digits
    // → compute as the 13th digit of "0" + text + check).
    const check = computeEan13CheckDigit("0" + text);
    upcaPayload = text + check;
  } else {
    // text.length === 12 — verify the check digit. The 12-digit UPC-A
    // payload's last digit must match `computeEan13CheckDigit("0" + first11)`.
    const expected = computeEan13CheckDigit("0" + text.slice(0, 11));
    const actual = Number(text[11]);
    if (actual !== expected) {
      throw new Error(
        `upca: check digit mismatch — got ${actual}, expected ${expected} for ${text.slice(0, 11)}`,
      );
    }
    upcaPayload = text;
  }

  // Delegate to EAN-13 with the prepended "0" to produce bar widths.
  const eanResult = ean13Encode("0" + upcaPayload);

  return {
    payload: upcaPayload,
    symbols: upcaPayload.split("").map(Number),
    widths: eanResult.widths,
    modulesWide: eanResult.modulesWide,
  };
}
