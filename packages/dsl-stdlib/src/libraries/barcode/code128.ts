/**
 * Code 128 symbology encoder per ISO/IEC 15417:2007.
 *
 * Code 128 is a variable-length, high-density 1D barcode that encodes the
 * full 128-character ASCII range across three code sets (A / B / C):
 *
 *   - Code Set A: ASCII 0–95 (control codes + uppercase + digits + symbols)
 *   - Code Set B: ASCII 32–127 (printable ASCII including lowercase)
 *   - Code Set C: digit pairs `00`–`99` (packs two digits per symbol → 2× density)
 *
 * Each symbol is exactly 11 modules wide (3 bars + 3 spaces) with bar widths
 * ∈ {1, 2, 3, 4} modules. The stop symbol is 13 modules wide (extra trailing
 * bar). A complete barcode is:
 *
 *   [Start code] [data symbols ...] [checksum] [Stop]
 *
 * The checksum is `(startValue + Σ dataValue[i] × (i + 1)) mod 103`, with
 * `i` 1-indexed over the data symbols. The Start code's positional weight
 * is 1 (it counts as the first term but is not multiplied by its own index).
 *
 * Phase 1 implements a two-mode auto-pick:
 *   - All-ASCII-digits AND even length → Code Set C (most compact).
 *   - Otherwise → Code Set B (printable ASCII 32–127).
 *
 * Mid-string code-set switching (the JsBarcode-style optimization for
 * mixed digit/letter inputs) is intentionally deferred. The current scheme
 * is correct and produces valid scannable Code 128 for any printable-ASCII
 * input; it just isn't always the densest possible encoding.
 *
 * Algorithmic reference: ISO/IEC 15417:2007. Pattern table cross-verified
 * against JsBarcode (Johan Lindell, MIT, github.com/lindell/JsBarcode) and
 * the public Code 128 spec.
 *
 * Pure, deterministic, no I/O.
 */

// ── Pattern table ───────────────────────────────────────────────────

/**
 * Code 128 symbol patterns by value (0–106).
 *
 * Each entry is the bar/space width sequence starting with a dark bar:
 * `[bar, space, bar, space, bar, space]` (6 widths = 11 modules total).
 * Value 106 (Stop) is special: 7 widths (`[bar, space, bar, space, bar, space, bar]`
 * = 13 modules, ending in a dark bar).
 *
 * Widths are integers in {1, 2, 3, 4}.
 */
const CODE128_PATTERNS: readonly (readonly number[])[] = [
  [2, 1, 2, 2, 2, 2], //   0
  [2, 2, 2, 1, 2, 2], //   1
  [2, 2, 2, 2, 2, 1], //   2
  [1, 2, 1, 2, 2, 3], //   3
  [1, 2, 1, 3, 2, 2], //   4
  [1, 3, 1, 2, 2, 2], //   5
  [1, 2, 2, 2, 1, 3], //   6
  [1, 2, 2, 3, 1, 2], //   7
  [1, 3, 2, 2, 1, 2], //   8
  [2, 2, 1, 2, 1, 3], //   9
  [2, 2, 1, 3, 1, 2], //  10
  [2, 3, 1, 2, 1, 2], //  11
  [1, 1, 2, 2, 3, 2], //  12
  [1, 2, 2, 1, 3, 2], //  13
  [1, 2, 2, 2, 3, 1], //  14
  [1, 1, 3, 2, 2, 2], //  15
  [1, 2, 3, 1, 2, 2], //  16
  [1, 2, 3, 2, 2, 1], //  17
  [2, 2, 3, 2, 1, 1], //  18
  [2, 2, 1, 1, 3, 2], //  19
  [2, 2, 1, 2, 3, 1], //  20
  [2, 1, 3, 2, 1, 2], //  21
  [2, 2, 3, 1, 1, 2], //  22
  [3, 1, 2, 1, 3, 1], //  23
  [3, 1, 1, 2, 2, 2], //  24
  [3, 2, 1, 1, 2, 2], //  25
  [3, 2, 1, 2, 2, 1], //  26
  [3, 1, 2, 2, 1, 2], //  27
  [3, 2, 2, 1, 1, 2], //  28
  [3, 2, 2, 2, 1, 1], //  29
  [2, 1, 2, 1, 2, 3], //  30
  [2, 1, 2, 3, 2, 1], //  31
  [2, 3, 2, 1, 2, 1], //  32
  [1, 1, 1, 3, 2, 3], //  33
  [1, 3, 1, 1, 2, 3], //  34
  [1, 3, 1, 3, 2, 1], //  35
  [1, 1, 2, 3, 1, 3], //  36
  [1, 3, 2, 1, 1, 3], //  37
  [1, 3, 2, 3, 1, 1], //  38
  [2, 1, 1, 3, 1, 3], //  39
  [2, 3, 1, 1, 1, 3], //  40
  [2, 3, 1, 3, 1, 1], //  41
  [1, 1, 2, 1, 3, 3], //  42
  [1, 1, 2, 3, 3, 1], //  43
  [1, 3, 2, 1, 3, 1], //  44
  [1, 1, 3, 1, 2, 3], //  45
  [1, 1, 3, 3, 2, 1], //  46
  [1, 3, 3, 1, 2, 1], //  47
  [3, 1, 3, 1, 2, 1], //  48
  [2, 1, 1, 3, 3, 1], //  49
  [2, 3, 1, 1, 3, 1], //  50
  [2, 1, 3, 1, 1, 3], //  51
  [2, 1, 3, 3, 1, 1], //  52
  [2, 1, 3, 1, 3, 1], //  53
  [3, 1, 1, 1, 2, 3], //  54
  [3, 1, 1, 3, 2, 1], //  55
  [3, 3, 1, 1, 2, 1], //  56
  [3, 1, 2, 1, 1, 3], //  57
  [3, 1, 2, 3, 1, 1], //  58
  [3, 3, 2, 1, 1, 1], //  59
  [3, 1, 4, 1, 1, 1], //  60
  [2, 2, 1, 4, 1, 1], //  61
  [4, 3, 1, 1, 1, 1], //  62
  [1, 1, 1, 2, 2, 4], //  63
  [1, 1, 1, 4, 2, 2], //  64
  [1, 2, 1, 1, 2, 4], //  65
  [1, 2, 1, 4, 2, 1], //  66
  [1, 4, 1, 1, 2, 2], //  67
  [1, 4, 1, 2, 2, 1], //  68
  [1, 1, 2, 2, 1, 4], //  69
  [1, 1, 2, 4, 1, 2], //  70
  [1, 2, 2, 1, 1, 4], //  71
  [1, 2, 2, 4, 1, 1], //  72
  [1, 4, 2, 1, 1, 2], //  73
  [1, 4, 2, 2, 1, 1], //  74
  [2, 4, 1, 2, 1, 1], //  75
  [2, 2, 1, 1, 1, 4], //  76
  [4, 1, 3, 1, 1, 1], //  77
  [2, 4, 1, 1, 1, 2], //  78
  [1, 3, 4, 1, 1, 1], //  79
  [1, 1, 1, 2, 4, 2], //  80
  [1, 2, 1, 1, 4, 2], //  81
  [1, 2, 1, 2, 4, 1], //  82
  [1, 1, 4, 2, 1, 2], //  83
  [1, 2, 4, 1, 1, 2], //  84
  [1, 2, 4, 2, 1, 1], //  85
  [4, 1, 1, 2, 1, 2], //  86
  [4, 2, 1, 1, 1, 2], //  87
  [4, 2, 1, 2, 1, 1], //  88
  [2, 1, 2, 1, 4, 1], //  89
  [2, 1, 4, 1, 2, 1], //  90
  [4, 1, 2, 1, 2, 1], //  91
  [1, 1, 1, 1, 4, 3], //  92
  [1, 1, 1, 3, 4, 1], //  93
  [1, 3, 1, 1, 4, 1], //  94
  [1, 1, 4, 1, 1, 3], //  95
  [1, 1, 4, 3, 1, 1], //  96  FNC3
  [4, 1, 1, 1, 1, 3], //  97  FNC2
  [4, 1, 1, 3, 1, 1], //  98  SHIFT
  [1, 1, 3, 1, 4, 1], //  99  Code C
  [1, 1, 4, 1, 3, 1], // 100  Code B / FNC4
  [3, 1, 1, 1, 4, 1], // 101  Code A / FNC4
  [4, 1, 1, 1, 3, 1], // 102  FNC1
  [2, 1, 1, 4, 1, 2], // 103  Start A
  [2, 1, 1, 2, 1, 4], // 104  Start B
  [2, 1, 1, 2, 3, 2], // 105  Start C
  [2, 3, 3, 1, 1, 1, 2], // 106  Stop (13 modules)
];

// ── Code-set selection + symbol encoding ────────────────────────────

/** Code-set identifier used to drive symbol encoding. */
export type Code128Set = "A" | "B" | "C";

export const CODE128_START: Readonly<Record<Code128Set, number>> = {
  A: 103,
  B: 104,
  C: 105,
};

export const CODE128_STOP = 106;

/**
 * Validate that `text` is encodable in the chosen code set. Throws on bad
 * input — caller is responsible for picking a set the text actually fits.
 */
function validateForSet(text: string, set: Code128Set): void {
  if (set === "C") {
    if (!/^\d*$/.test(text)) {
      throw new Error(
        `code128: Code Set C requires all-digit input, got ${JSON.stringify(text)}`,
      );
    }
    if (text.length % 2 !== 0) {
      throw new Error(
        `code128: Code Set C requires even-length digit input, got length ${text.length}`,
      );
    }
    return;
  }
  // A or B — printable ASCII bounds.
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (set === "B" && (code < 32 || code > 127)) {
      throw new Error(
        `code128: Code Set B character out of range (ASCII 32–127) at index ${i}: 0x${code.toString(16)}`,
      );
    }
    if (set === "A" && (code < 0 || code > 95)) {
      throw new Error(
        `code128: Code Set A character out of range (ASCII 0–95) at index ${i}: 0x${code.toString(16)}`,
      );
    }
  }
}

/** Auto-pick the code set most likely to give a valid + compact encoding. */
export function autoPickCodeSet(text: string): Code128Set {
  if (text.length > 0 && text.length % 2 === 0 && /^\d+$/.test(text)) {
    return "C";
  }
  return "B";
}

/**
 * Convert text into symbol values for the chosen code set. Does NOT include
 * the start code, checksum, or stop — those are added by `code128Encode`.
 */
function textToValues(text: string, set: Code128Set): number[] {
  validateForSet(text, set);
  const values: number[] = [];
  if (set === "C") {
    for (let i = 0; i < text.length; i += 2) {
      values.push(Number(text.slice(i, i + 2)));
    }
    return values;
  }
  if (set === "B") {
    for (let i = 0; i < text.length; i++) {
      values.push(text.charCodeAt(i) - 32);
    }
    return values;
  }
  // set === "A"
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // ASCII 32–95 map to values 0–63; ASCII 0–31 map to values 64–95.
    values.push(code >= 32 ? code - 32 : code + 64);
  }
  return values;
}

// ── Public encoder ───────────────────────────────────────────────────

export type Code128EncodeOptions = {
  /** Force a specific code set. Default: auto-pick (digit-pairs → C, else B). */
  set?: Code128Set;
};

export type Code128Encoded = {
  /** Code set used for encoding. */
  set: Code128Set;
  /** Symbol stream: [start, ...data, checksum, stop]. */
  symbols: number[];
  /** Mod-103 checksum value. */
  checksum: number;
  /**
   * Bar widths in left-to-right order, concatenating each symbol's pattern.
   * Each Code 128 data/start symbol contributes 6 widths (BSBSBS); the stop
   * contributes 7 widths (BSBSBSB). All entries are positive integers ∈
   * {1, 2, 3, 4}. Strictly alternates dark/light starting with dark.
   */
  widths: number[];
  /** Sum of `widths` — total bar-region width in modules (excludes quiet zones). */
  modulesWide: number;
};

/**
 * Encode `text` into a Code 128 symbol stream + bar-width sequence.
 *
 * Throws on:
 *   - Empty input (Code 128 cannot encode zero data symbols and still scan).
 *   - Characters out of range for the picked code set.
 *   - Odd-length input when Code Set C is forced.
 */
export function code128Encode(
  text: string,
  opts: Code128EncodeOptions = {},
): Code128Encoded {
  if (text.length === 0) {
    throw new Error("code128: input text must be non-empty");
  }
  const set: Code128Set = opts.set ?? autoPickCodeSet(text);
  const dataValues = textToValues(text, set);

  const startValue = CODE128_START[set];

  // Mod-103 checksum: start*1 + Σ data[i]*(i+1).
  let sum = startValue;
  for (let i = 0; i < dataValues.length; i++) {
    sum += dataValues[i] * (i + 1);
  }
  const checksum = sum % 103;

  const symbols: number[] = [startValue, ...dataValues, checksum, CODE128_STOP];

  const widths: number[] = [];
  for (const v of symbols) {
    const pattern = CODE128_PATTERNS[v];
    if (!pattern) {
      throw new Error(`code128: missing pattern for symbol value ${v}`);
    }
    for (const w of pattern) widths.push(w);
  }
  let modulesWide = 0;
  for (const w of widths) modulesWide += w;

  return { set, symbols, checksum, widths, modulesWide };
}

// Exported for tests that want to inspect the table directly.
export const _internal = {
  CODE128_PATTERNS,
  validateForSet,
  textToValues,
};
