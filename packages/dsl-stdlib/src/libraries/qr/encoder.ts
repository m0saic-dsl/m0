/**
 * QR Code data-stream encoder per ISO 18004.
 *
 * Three modes supported (the only ones a URL ever uses):
 *   - "numeric"      digits 0-9, packed 10 bits per 3-digit group
 *   - "alphanumeric" `0-9 A-Z $%*+-./:`, packed 11 bits per pair
 *   - "byte"         arbitrary UTF-8 bytes, 8 bits each
 *
 * Kanji mode is intentionally out of scope.
 *
 * The encoder produces the full pre-RS bit stream, byte-aligned and padded
 * to the version's data capacity:
 *   [mode 4b] [count Nb] [data] [terminator ≤4b] [pad to byte] [0xEC/0x11 pad bytes]
 *
 * Pure, deterministic, no I/O.
 */

import type { QrErrorCorrection, QrSegmentMode } from "./types";
import { selectVersion, totalDataCodewords } from "./version";

// ── Mode detection ──────────────────────────────────────────────────

const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const ALPHANUMERIC_INDEX: ReadonlyMap<string, number> = new Map(
  Array.from(ALPHANUMERIC_CHARSET).map((c, i) => [c, i]),
);

/** Detect the most-compact mode that can encode every character of `text`. */
export function detectMode(text: string): QrSegmentMode {
  if (text.length === 0) return "byte";
  let allNumeric = true;
  let allAlphaNum = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch < "0" || ch > "9") allNumeric = false;
    if (!ALPHANUMERIC_INDEX.has(ch)) allAlphaNum = false;
    if (!allNumeric && !allAlphaNum) break;
  }
  if (allNumeric) return "numeric";
  if (allAlphaNum) return "alphanumeric";
  return "byte";
}

// ── Bit buffer ──────────────────────────────────────────────────────

class BitBuffer {
  private readonly bits: number[] = [];

  get length(): number {
    return this.bits.length;
  }

  appendBits(value: number, length: number): void {
    if (!Number.isInteger(length) || length < 0 || length > 31) {
      throw new Error(`appendBits: invalid length ${length}`);
    }
    if (!Number.isInteger(value) || value < 0 || value >= 1 << length) {
      // length=31 would overflow, but we don't use that in QR.
      throw new Error(`appendBits: value ${value} out of range for length ${length}`);
    }
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }

  /** Append `n` zero bits. */
  appendZeros(n: number): void {
    for (let i = 0; i < n; i++) this.bits.push(0);
  }

  /** Pack the buffer into bytes (big-endian within each byte). Pads with zeros if needed. */
  toBytes(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | (this.bits[i + j] ?? 0);
      }
      out.push(b);
    }
    return out;
  }
}

// ── Per-mode bit counts ────────────────────────────────────────────

/** Character-count indicator bit width per (mode, version). ISO 18004 Table 3. */
function charCountBitsFor(mode: QrSegmentMode, version: number): number {
  // Version ranges:
  //   1-9    → "small"
  //   10-26  → "medium"
  //   27-40  → "large"
  const sizeBand = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  switch (mode) {
    case "numeric":
      return [10, 12, 14][sizeBand];
    case "alphanumeric":
      return [9, 11, 13][sizeBand];
    case "byte":
      return [8, 16, 16][sizeBand];
  }
}

/** Mode indicator (4-bit code) per ISO 18004 Table 2. */
function modeIndicator(mode: QrSegmentMode): number {
  switch (mode) {
    case "numeric": return 0b0001;
    case "alphanumeric": return 0b0010;
    case "byte": return 0b0100;
  }
}

/** UTF-8 encode a string into bytes (Node's TextEncoder is universal). */
function utf8Bytes(text: string): number[] {
  const enc = new TextEncoder();
  return Array.from(enc.encode(text));
}

/** Count of data bits (post-mode-and-count headers) for a segment in the given mode. */
function dataBitsFor(mode: QrSegmentMode, text: string): number {
  switch (mode) {
    case "numeric": {
      const groups = Math.floor(text.length / 3);
      const remainder = text.length % 3;
      // 10 bits per 3-digit group; 7 bits for a 2-digit tail; 4 bits for a 1-digit tail.
      return groups * 10 + (remainder === 0 ? 0 : remainder === 1 ? 4 : 7);
    }
    case "alphanumeric": {
      const pairs = Math.floor(text.length / 2);
      return pairs * 11 + (text.length % 2) * 6;
    }
    case "byte":
      return utf8Bytes(text).length * 8;
  }
}

/** Full encoded bit count (mode indicator + count indicator + data bits). */
export function fullBitCount(mode: QrSegmentMode, text: string, version: number): number {
  // `byte` mode counts via UTF-8 byte length, not character length.
  const charCount = mode === "byte" ? utf8Bytes(text).length : text.length;
  // Validate char count fits in the indicator width.
  const countBits = charCountBitsFor(mode, version);
  if (charCount >= 1 << countBits) {
    throw new Error(
      `qr/encoder: ${charCount} chars exceeds the ${countBits}-bit count indicator for mode "${mode}" at version ${version}`,
    );
  }
  return 4 + countBits + dataBitsFor(mode, text);
}

// ── Mode-specific data encoding ─────────────────────────────────────

function encodeNumericInto(buf: BitBuffer, text: string): void {
  let i = 0;
  while (i + 3 <= text.length) {
    const n = Number(text.substring(i, i + 3));
    buf.appendBits(n, 10);
    i += 3;
  }
  const tail = text.length - i;
  if (tail === 2) buf.appendBits(Number(text.substring(i)), 7);
  else if (tail === 1) buf.appendBits(Number(text.substring(i)), 4);
}

function encodeAlphanumericInto(buf: BitBuffer, text: string): void {
  let i = 0;
  while (i + 2 <= text.length) {
    const a = ALPHANUMERIC_INDEX.get(text[i])!;
    const b = ALPHANUMERIC_INDEX.get(text[i + 1])!;
    buf.appendBits(a * 45 + b, 11);
    i += 2;
  }
  if (i < text.length) {
    const a = ALPHANUMERIC_INDEX.get(text[i])!;
    buf.appendBits(a, 6);
  }
}

function encodeByteInto(buf: BitBuffer, text: string): void {
  for (const b of utf8Bytes(text)) buf.appendBits(b, 8);
}

// ── Public: build the full data stream ──────────────────────────────

export type QrEncoded = {
  /** Bytes ready to feed the RS block layout. Length equals total data codewords for (version, ecc). */
  data: number[];
  version: number;
  mode: QrSegmentMode;
  errorCorrectionLevel: QrErrorCorrection;
};

export function buildBitStream(
  text: string,
  ecc: QrErrorCorrection,
  opts?: { version?: number; mode?: QrSegmentMode },
): QrEncoded {
  const mode: QrSegmentMode = opts?.mode ?? detectMode(text);

  // Mode validation: caller-forced mode must accommodate the text.
  if (mode === "numeric" && !/^\d*$/.test(text)) {
    throw new Error(`qr/encoder: forced numeric mode but text contains non-digits`);
  }
  if (mode === "alphanumeric") {
    for (const ch of text) {
      if (!ALPHANUMERIC_INDEX.has(ch)) {
        throw new Error(`qr/encoder: forced alphanumeric mode but text contains invalid char "${ch}"`);
      }
    }
  }

  // Version selection: walk V=1..40 and pick the smallest version whose
  // capacity (in bits) is ≥ the full encoded bit count at THAT version.
  // We can't use a "compute once at V1, then re-pick" shortcut because:
  //   - count-indicator width grows across V1-9 / V10-26 / V27-40,
  //   - long inputs may overflow the V1-9 8-bit count indicator entirely.
  // Skipping versions where the count indicator can't represent the input.
  let version: number;
  if (opts?.version !== undefined) {
    version = opts.version;
    fullBitCount(mode, text, version); // validates count-bit width fits
  } else {
    let picked: number | null = null;
    for (let v = 1; v <= 40; v++) {
      let bits: number;
      try {
        bits = fullBitCount(mode, text, v);
      } catch {
        continue; // count indicator too narrow at this version
      }
      if (bits <= totalDataCodewords(v, ecc) * 8) {
        picked = v;
        break;
      }
    }
    if (picked === null) {
      throw new Error(
        `qr/encoder: no QR version (1-40) fits ${text.length} chars in mode "${mode}" at ECC ${ecc}`,
      );
    }
    version = picked;
  }

  const buf = new BitBuffer();
  buf.appendBits(modeIndicator(mode), 4);
  const countBits = charCountBitsFor(mode, version);
  const charCount = mode === "byte" ? utf8Bytes(text).length : text.length;
  buf.appendBits(charCount, countBits);
  switch (mode) {
    case "numeric": encodeNumericInto(buf, text); break;
    case "alphanumeric": encodeAlphanumericInto(buf, text); break;
    case "byte": encodeByteInto(buf, text); break;
  }

  // Terminator (up to 4 zero bits, but no more than capacity).
  const capacityBits = totalDataCodewords(version, ecc) * 8;
  if (buf.length > capacityBits) {
    throw new Error(
      `qr/encoder: encoded bits ${buf.length} exceed capacity ${capacityBits} at V${version}-${ecc} — version selection bug?`,
    );
  }
  const termBits = Math.min(4, capacityBits - buf.length);
  buf.appendZeros(termBits);

  // Pad to byte boundary.
  if (buf.length % 8 !== 0) buf.appendZeros(8 - (buf.length % 8));

  // Pack bytes; fill remaining capacity with alternating 0xEC, 0x11.
  const bytes = buf.toBytes();
  const targetBytes = capacityBits / 8;
  let toggle = 0;
  while (bytes.length < targetBytes) {
    bytes.push(toggle === 0 ? 0xec : 0x11);
    toggle ^= 1;
  }

  return { data: bytes, version, mode, errorCorrectionLevel: ecc };
}

// Re-export the mode-classification table positions in case downstream code wants it.
export const _internal = {
  charCountBitsFor,
  modeIndicator,
  utf8Bytes,
  dataBitsFor,
};
