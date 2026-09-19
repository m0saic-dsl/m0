/**
 * QR Code masking: 8 mask patterns + ISO 18004 penalty rules.
 *
 * The mask is XOR'd onto the data area only (function patterns and
 * reserved cells are untouched). The "best" mask is the one whose post-
 * mask matrix has the lowest total penalty score from rules N1–N4.
 *
 * Pure, deterministic, no I/O.
 */

import type { QrMatrixWork } from "./matrix";

/** Mask formula for mask `m` at cell (r, c). */
export function maskFormula(m: number, r: number, c: number): boolean {
  switch (m) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default:
      throw new Error(`qr/mask: invalid mask number ${m}`);
  }
}

/** XOR `mask` into every non-reserved cell of `work`. Modifies in place. */
export function applyMask(work: QrMatrixWork, mask: number): void {
  for (let r = 0; r < work.size; r++) {
    for (let c = 0; c < work.size; c++) {
      if (work.reserved[r][c]) continue;
      if (maskFormula(mask, r, c)) {
        work.modules[r][c] = !work.modules[r][c];
      }
    }
  }
}

// ── Penalty rules N1–N4 (ISO 18004 §8.8.2) ──────────────────────────

/** N1: 3 + (run_length - 5) penalty for each run of 5+ same-color modules in a row or column. */
function penaltyN1(modules: boolean[][], size: number): number {
  let penalty = 0;
  // Rows.
  for (let r = 0; r < size; r++) {
    let runColor = modules[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  // Columns.
  for (let c = 0; c < size; c++) {
    let runColor = modules[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r][c] === runColor) {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = modules[r][c];
        runLen = 1;
      }
    }
  }
  return penalty;
}

/** N2: +3 for every 2×2 block of identical-color modules. */
function penaltyN2(modules: boolean[][], size: number): number {
  let penalty = 0;
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r][c];
      if (modules[r][c + 1] === v && modules[r + 1][c] === v && modules[r + 1][c + 1] === v) {
        penalty += 3;
      }
    }
  }
  return penalty;
}

/** N3: +40 for each finder-like 1:1:3:1:1 pattern with 4-cell light buffer. */
function penaltyN3(modules: boolean[][], size: number): number {
  // Pattern bits: 1011101 (the finder's row/column profile, dark=true=1).
  const pattern = [true, false, true, true, true, false, true];
  let penalty = 0;
  const check = (r: number, c: number, dr: number, dc: number): boolean => {
    // Check the 7-cell core matches the pattern.
    for (let i = 0; i < 7; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size) return false;
      if (modules[rr][cc] !== pattern[i]) return false;
    }
    // Check the 4-cell light buffer on at least one side.
    let lightAfter = true;
    for (let i = 1; i <= 4; i++) {
      const rr = r + dr * (7 + i - 1);
      const cc = c + dc * (7 + i - 1);
      if (rr < 0 || rr >= size || cc < 0 || cc >= size || modules[rr][cc]) {
        lightAfter = false;
        break;
      }
    }
    let lightBefore = true;
    for (let i = 1; i <= 4; i++) {
      const rr = r - dr * i;
      const cc = c - dc * i;
      if (rr < 0 || rr >= size || cc < 0 || cc >= size || modules[rr][cc]) {
        lightBefore = false;
        break;
      }
    }
    return lightAfter || lightBefore;
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (check(r, c, 0, 1)) penalty += 40;
      if (check(r, c, 1, 0)) penalty += 40;
    }
  }
  return penalty;
}

/**
 * N4: 10 × steps-of-5%-from-50% dark/light balance.
 *
 * Uses the `qrcode` npm package's ceil-based formula (the de facto standard
 * implementation): `|ceil(darkPct / 5) - 10| × 10`. A strict ISO 18004
 * reading uses `floor(|pct - 50| / 5) × 10` which only differs in the
 * sub-step region just above 50% (e.g. 50.1% → 0 by floor, 10 by ceil).
 * Matching qrcode gives byte-for-byte oracle parity on mask selection.
 */
function penaltyN4(modules: boolean[][], size: number): number {
  let dark = 0;
  const total = size * size;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) dark++;
    }
  }
  const k = Math.abs(Math.ceil(((dark * 100) / total) / 5) - 10);
  return k * 10;
}

/** Total penalty score for a finalised matrix. */
export function maskPenalty(modules: boolean[][], size: number): number {
  return penaltyN1(modules, size) + penaltyN2(modules, size) + penaltyN3(modules, size) + penaltyN4(modules, size);
}

/**
 * Try all 8 masks against a copy of `work` (with format info filled in
 * for each candidate); return the mask with the lowest penalty.
 *
 * The caller provides `stampFormat`, which writes the format info bits
 * for a given mask onto the working matrix. The function-pattern and
 * data cells of `work` must already be in place; this routine never
 * mutates `work` itself.
 */
export function chooseBestMask(
  work: QrMatrixWork,
  stampFormat: (modules: boolean[][], mask: number) => void,
): { mask: number; modules: boolean[][] } {
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules: boolean[][] | null = null;
  for (let m = 0; m < 8; m++) {
    const trial = work.modules.map((row) => row.slice());
    // Apply mask (only to non-reserved cells).
    for (let r = 0; r < work.size; r++) {
      for (let c = 0; c < work.size; c++) {
        if (!work.reserved[r][c] && maskFormula(m, r, c)) {
          trial[r][c] = !trial[r][c];
        }
      }
    }
    // Stamp the matching format info.
    stampFormat(trial, m);
    const p = maskPenalty(trial, work.size);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = m;
      bestModules = trial;
    }
  }
  return { mask: bestMask, modules: bestModules! };
}
