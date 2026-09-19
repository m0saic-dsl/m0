/**
 * Reed–Solomon error-correction codeword generation for QR Code per ISO 18004.
 *
 * The QR field is GF(256) with primitive polynomial
 *   p(x) = x^8 + x^4 + x^3 + x^2 + 1   (0x11D)
 * and primitive element α = 2 (i.e. α^1 = 2 in field representation).
 *
 * `computeRsCodewords(data, ecCount)` returns `ecCount` Reed–Solomon
 * codewords (bytes) for the given data block. The QR encoder treats data
 * codewords + RS codewords as a single ECC block; multiple blocks are
 * concatenated and interleaved at the matrix-placement stage.
 *
 * Pure, deterministic, no I/O.
 */

const PRIMITIVE_POLY = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGfTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIMITIVE_POLY;
  }
  // Doubling the EXP table avoids modular arithmetic in gfMul.
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  // GF_LOG[0] is undefined mathematically; leave as 0. Callers must guard.
})();

/** Multiply two GF(256) elements. Either operand may be 0. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

/** Internal: α^i in GF(256). */
function gfAlphaPow(i: number): number {
  // Modulo to keep within table.
  const m = ((i % 255) + 255) % 255;
  return GF_EXP[m];
}

/** Multiply two polynomials over GF(256). */
function gfPolyMul(p: number[], q: number[]): number[] {
  const result = new Array(p.length + q.length - 1).fill(0);
  for (let i = 0; i < p.length; i++) {
    for (let j = 0; j < q.length; j++) {
      result[i + j] ^= gfMul(p[i], q[j]);
    }
  }
  return result;
}

/**
 * Build the Reed–Solomon generator polynomial of the given degree.
 * Generator G(x) = (x - α^0)(x - α^1)(x - α^2)...(x - α^(degree-1))
 *
 * Returned coefficients are MSB-first; coeff[0] is always 1 (monic polynomial).
 */
export function buildGeneratorPoly(degree: number): number[] {
  if (!Number.isInteger(degree) || degree < 1) {
    throw new Error(`buildGeneratorPoly: degree must be a positive integer, got ${degree}`);
  }
  let g: number[] = [1];
  for (let i = 0; i < degree; i++) {
    g = gfPolyMul(g, [1, gfAlphaPow(i)]);
  }
  return g;
}

/**
 * Compute `ecCount` Reed–Solomon codewords for the given data block.
 *
 * Implementation is the textbook polynomial division: pad data with zeros
 * to match the EC count, then divide by the generator polynomial; the
 * remainder is the EC codewords.
 */
export function computeRsCodewords(data: readonly number[], ecCount: number): number[] {
  if (!Number.isInteger(ecCount) || ecCount < 1) {
    throw new Error(`computeRsCodewords: ecCount must be a positive integer, got ${ecCount}`);
  }
  const generator = buildGeneratorPoly(ecCount);

  // Working buffer: data || ecCount zeros.
  const buf = new Array(data.length + ecCount).fill(0);
  for (let i = 0; i < data.length; i++) buf[i] = data[i] & 0xff;

  // Polynomial long division. After the loop, buf[data.length...] holds the remainder.
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i];
    if (coef === 0) continue;
    for (let j = 1; j < generator.length; j++) {
      buf[i + j] ^= gfMul(generator[j], coef);
    }
  }

  return buf.slice(data.length);
}
