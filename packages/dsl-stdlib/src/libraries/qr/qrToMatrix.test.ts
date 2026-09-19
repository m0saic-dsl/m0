import * as fs from "fs";
import * as path from "path";
import { qrToMatrix } from "./qrToMatrix";
import type { QrErrorCorrection } from "./types";

/**
 * Oracle parity is checked against a static JSON fixture of QR matrices that
 * was generated ONCE using the `qrcode` npm package (~1.5.4). The fixture
 * lives at `__fixtures__/qr/oracle-matrices.json` and ships with the
 * package — dsl-stdlib has no runtime / test-time dependency on `qrcode`.
 *
 * To regenerate the fixture (e.g. after intentional encoder changes), run
 * the snapshot script noted at the top of that JSON file.
 *
 * If a test ever diverges, the failure prints the (row, col) of the first
 * mismatch — almost always one of:
 *   - a bad table value (alignment positions, EC blocks)
 *   - a different mask choice (penalty math drift)
 *   - data-placement zigzag skipping the wrong cell
 */

type OracleFixture = {
  url: string;
  ecc: QrErrorCorrection;
  version: number;
  size: number;
  /** Flat "0"/"1" string of length size×size, row-major. */
  modules: string;
};

const ORACLE_FIXTURES: readonly OracleFixture[] = (() => {
  const fixturePath = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "__fixtures__",
    "qr",
    "oracle-matrices.json",
  );
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as {
    fixtures: OracleFixture[];
  };
  return raw.fixtures;
})();

function getOracle(url: string, ecc: QrErrorCorrection): OracleFixture {
  const found = ORACLE_FIXTURES.find((f) => f.url === url && f.ecc === ecc);
  if (!found) {
    throw new Error(`no oracle fixture for "${url}" / ${ecc}`);
  }
  return found;
}

function assertMatrixMatchesOracle(url: string, ecc: QrErrorCorrection): void {
  const oracle = getOracle(url, ecc);
  const mine = qrToMatrix(url, { errorCorrectionLevel: ecc, quietZoneModules: 0 });

  if (mine.size !== oracle.size) {
    throw new Error(
      `size mismatch for "${url}" / ${ecc}: mine=${mine.size}, oracle=${oracle.size}`,
    );
  }
  if (mine.version !== oracle.version) {
    throw new Error(
      `version mismatch for "${url}" / ${ecc}: mine=${mine.version}, oracle=${oracle.version}`,
    );
  }

  const size = mine.size;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const oracleBit = oracle.modules[r * size + c] === "1";
      const mineBit = mine.modules[r][c];
      if (oracleBit !== mineBit) {
        throw new Error(
          `module mismatch at (${r}, ${c}) for "${url}" / ${ecc}: mine=${mineBit}, oracle=${oracleBit}`,
        );
      }
    }
  }
}

const ECC_LEVELS: readonly QrErrorCorrection[] = ["L", "M", "Q", "H"];

describe("qrToMatrix — oracle parity vs snapshotted `qrcode` matrices", () => {
  const TEST_URLS: readonly string[] = [
    // Production-shape URLs.
    "https://m0saic.io",
    "https://www.m0saic.io",
    // Short text (alphanumeric mode).
    "HELLO WORLD",
    // Numeric mode (matches the ISO 18004 spec example we already tested).
    "01234567",
    // Numeric, longer.
    "1234567890",
    // Byte mode with unicode (UTF-8 multi-byte).
    "résumé",
    // Mixed case + punctuation forces byte mode.
    "Hello, World!",
  ];

  for (const url of TEST_URLS) {
    for (const ecc of ECC_LEVELS) {
      test(`matches oracle: "${url}" / ${ecc}`, () => {
        assertMatrixMatchesOracle(url, ecc);
      });
    }
  }
});

describe("qrToMatrix — version-specific stress", () => {
  // Force higher versions to exercise multi-block interleaving + version-info
  // placement (v7+). Pad URLs to push capacity.
  test("V7 multi-block round-trip via long numeric data", () => {
    // V7-H holds ~74 numeric chars. 60 chars should land us in V7-H range.
    const url = "0".repeat(60);
    assertMatrixMatchesOracle(url, "H");
  });

  test("V10 byte mode (size-band transition)", () => {
    // V10-M holds 213 bytes. 150 chars puts us comfortably in V10.
    const url = "a".repeat(150);
    assertMatrixMatchesOracle(url, "M");
  });

  test("V20 long URL", () => {
    const url = "https://m0saic.io/" + "x".repeat(400);
    assertMatrixMatchesOracle(url, "L");
  });
});

describe("qrToMatrix — quiet zone", () => {
  test("default quiet zone is 4 cells per side", () => {
    const result = qrToMatrix("https://m0saic.io");
    expect(result.quietZone).toBe(4);
    // V6 → matrix 41, with 4-cell quiet zone → final size 49.
    // Actual version depends on URL length; just assert the quiet-zone math.
    const innerSize = result.size - 2 * result.quietZone;
    expect(innerSize).toBe(4 * result.version + 17);
  });

  test("explicit 0 quiet zone gives the raw matrix", () => {
    const result = qrToMatrix("https://m0saic.io", { quietZoneModules: 0 });
    expect(result.quietZone).toBe(0);
    expect(result.size).toBe(4 * result.version + 17);
  });

  test("quiet zone cells are all light", () => {
    const result = qrToMatrix("https://m0saic.io", { quietZoneModules: 4 });
    const q = result.quietZone;
    // Top band.
    for (let c = 0; c < result.size; c++) expect(result.modules[0][c]).toBe(false);
    // Bottom band.
    for (let c = 0; c < result.size; c++) expect(result.modules[result.size - 1][c]).toBe(false);
    // Left & right bands.
    for (let r = 0; r < result.size; r++) {
      expect(result.modules[r][0]).toBe(false);
      expect(result.modules[r][result.size - 1]).toBe(false);
    }
    // First inner row should contain the top edge of the top-left finder.
    expect(result.modules[q][q]).toBe(true); // finder top-left corner
  });

  test("rejects negative or non-integer quiet zone", () => {
    expect(() => qrToMatrix("hi", { quietZoneModules: -1 })).toThrow(/non-negative integer/);
    expect(() => qrToMatrix("hi", { quietZoneModules: 1.5 })).toThrow(/non-negative integer/);
  });
});

describe("qrToMatrix — determinism", () => {
  test("same input twice → byte-identical matrix", () => {
    const a = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "H" });
    const b = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "H" });
    expect(a.size).toBe(b.size);
    expect(a.version).toBe(b.version);
    for (let r = 0; r < a.size; r++) {
      for (let c = 0; c < a.size; c++) {
        expect(a.modules[r][c]).toBe(b.modules[r][c]);
      }
    }
  });
});

describe("qrToMatrix — forced version", () => {
  test("respects version override when it fits", () => {
    const result = qrToMatrix("hi", { errorCorrectionLevel: "L", version: 10 });
    expect(result.version).toBe(10);
    // V10 → 4·10+17 = 57. With default quiet zone 4 → 65.
    expect(result.size).toBe(57 + 2 * 4);
  });
});
