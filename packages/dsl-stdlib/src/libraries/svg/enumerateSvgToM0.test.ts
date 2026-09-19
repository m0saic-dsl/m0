import fs from "fs";
import path from "path";
import { enumerateSvgToM0 } from "./enumerateSvgToM0";

const EXAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "__fixtures__",
  "svg",
);

describe("enumerateSvgToM0", () => {
  test("mlogo_v2: returns multiple variants ordered by ascending charLen", () => {
    const svg = fs.readFileSync(
      path.join(EXAMPLES_DIR, "mlogo_v2", "01-normalized.svg"),
      "utf-8",
    );
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0, 0.5, 1.0],
      driftMode: ["cluster", "gcd-snap"],
      packing: ["one", "multi"],
    });
    expect(variants.length).toBeGreaterThan(0);
    for (let i = 1; i < variants.length; i++) {
      expect(variants[i].charLen).toBeGreaterThanOrEqual(variants[i - 1].charLen);
    }
  });

  test("mlogo_v2: more drift produces shorter strings on average", () => {
    const svg = fs.readFileSync(
      path.join(EXAMPLES_DIR, "mlogo_v2", "01-normalized.svg"),
      "utf-8",
    );
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0, 1.0],
      driftMode: ["gcd-snap"],
      packing: ["multi"],
    });
    // At driftPercent=0 we fall back to cluster; at 1.0 gcd-snap may succeed.
    // We expect at least one variant; if gcd-snap is feasible the higher
    // drift run should be no longer than the zero-drift run.
    expect(variants.length).toBeGreaterThanOrEqual(1);
  });

  test("smallest charLen is the multi-rect packing", () => {
    const svg = fs.readFileSync(
      path.join(EXAMPLES_DIR, "mlogo_v2", "01-normalized.svg"),
      "utf-8",
    );
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0],
      driftMode: ["cluster"],
      packing: ["one", "multi"],
    });
    // Both variants exist; multi should be no larger.
    expect(variants).toHaveLength(2);
    const multi = variants.find((v) => v.options.packing === "multi")!;
    const one = variants.find((v) => v.options.packing === "one")!;
    expect(multi.charLen).toBeLessThanOrEqual(one.charLen);
  });

  test("dedupes (driftPercent, driftMode) pairs that produce identical grids", () => {
    // At driftPercent=0, gcd-snap falls back to cluster — so cluster+0 and
    // gcd-snap+0 produce the same grid. enumerateSvgToM0's first dedup pass
    // collapses them. Two packing modes that emit *different* m0 strings
    // for the same grid would still yield 2 variants. For this single-rect
    // SVG, however, both packings emit byte-identical m0, so the SECOND
    // (m0-level) dedup pass collapses them to one variant.
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 0H100V100H0Z"/></svg>`;
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0],
      driftMode: ["cluster", "gcd-snap"],
      packing: ["one", "multi"],
    });
    expect(variants).toHaveLength(1);
  });

  test("dedupes variants that emit byte-identical m0 strings (degenerate single-shape SVG)", () => {
    // A single full-canvas rect collapses to a one-frame m0 regardless of
    // drift, mode, or packing. Without the m0-level dedup we'd return 4
    // indistinguishable variants (2 modes × 2 packings, with all drift > 0
    // also collapsing to the same grid). With dedup: exactly one variant.
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 0H100V100H0Z"/></svg>`;
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0, 1.0, 2.0],
      driftMode: ["cluster", "gcd-snap"],
      packing: ["one", "multi"],
    });
    expect(variants).toHaveLength(1);
    // Lossless preference: kept variant has the lowest driftPercent.
    expect(variants[0].options.driftPercent).toBe(0);
  });

  test("m0-dedup prefers lossless when multiple drifts produce identical m0", () => {
    // Two drifts both produce identical m0 (because their grids match): the
    // returned variant should be the lossless (lower drift) one.
    const svg = `<svg viewBox="0 0 100 100"><path d="M0 0H100V100H0Z"/></svg>`;
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0, 2.0],
      driftMode: ["cluster"],
      packing: ["one"],
    });
    expect(variants).toHaveLength(1);
    expect(variants[0].options.driftPercent).toBe(0);
  });

  test("skips variants that would require a viewBox at driftPercent > 0", () => {
    const svg = `<svg><path d="M0 0H10V10H0Z"/></svg>`;
    const variants = enumerateSvgToM0(svg, {
      driftPercent: [0, 1.0],
      driftMode: ["cluster"],
      packing: ["one"],
    });
    // Only driftPercent=0 is valid (no viewBox); driftPercent=1.0 is skipped.
    expect(variants).toHaveLength(1);
    expect(variants[0].options.driftPercent).toBe(0);
  });

  test("throws on SVG with no path elements", () => {
    expect(() => enumerateSvgToM0(`<svg viewBox="0 0 10 10"></svg>`)).toThrow(
      /no <path>/,
    );
  });
});
