import fs from "fs";
import path from "path";
import { svgToM0 } from "./svgToM0";

const EXAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "__fixtures__",
  "svg",
);

function loadComposedM0String(assetDir: string): string {
  const text = fs.readFileSync(path.join(assetDir, "05-composed.m0"), "utf-8");
  return text
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
}

describe("svgToM0 — end-to-end golden", () => {
  test("mlogo_v2: matches 05-composed.m0 byte-for-byte at default opts that mirror the docs run", () => {
    const assetDir = path.join(EXAMPLES_DIR, "mlogo_v2");
    const svg = fs.readFileSync(path.join(assetDir, "01-normalized.svg"), "utf-8");
    // The docs goldens were generated at cluster + pack=one + driftPercent=0.
    const m0 = svgToM0(svg, {
      driftPercent: 0,
      driftMode: "cluster",
      packing: "one",
    });
    expect(String(m0)).toBe(loadComposedM0String(assetDir));
  });

  test("synthetic 100x100 single rect produces a valid M0String", () => {
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 0H100V100H0Z"/></svg>`;
    const m0 = svgToM0(svg);
    expect(typeof m0).toBe("string");
    expect(m0.length).toBeGreaterThan(0);
  });

  test("throws on SVG with no path elements", () => {
    expect(() => svgToM0(`<svg viewBox="0 0 10 10"></svg>`)).toThrow(/no <path>/);
  });
});
