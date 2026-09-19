import { parseM0StringComplete } from "@m0saic/dsl";
import { extractGeometry } from "./extractGeometry";
import { generateMasks } from "./generateMasks";
import { generateMasksByStableKey } from "./generateMasksByStableKey";
import { inferGrid } from "./inferGrid";
import { parseSvg } from "./parseSvg";
import { rectsToM0 } from "./rectsToM0";

/**
 * Tiny synthetic SVG: a true axis-aligned rect (top half — matches
 * `isMaskedPath`'s strict M_H_V_H_V_Z template, so it's NOT masked) and
 * a triangle in the bottom half (masked). inferGrid produces a 2-row stack.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200">
  <path d="M0 0H100V100H0V0Z" fill="black"/>
  <path d="M0 100L100 100L50 200Z" fill="black"/>
</svg>`;

function build() {
  const parsed = parseSvg(SVG);
  const shapes = extractGeometry(parsed.paths);
  const grid = inferGrid(shapes, parsed.viewBox, { driftPercent: 0, driftMode: "cluster" });
  const variant = rectsToM0(grid, { packing: "multi" });
  const maskSet = generateMasks(grid, variant.m0, { canvasW: 100, canvasH: 200 });
  return { grid, m0: String(variant.m0), maskSet };
}

describe("generateMasksByStableKey", () => {
  test("keys non-null masks by the matching leaf frame's real stableKey", () => {
    const { grid, m0, maskSet } = build();
    const result = generateMasksByStableKey(grid, m0, maskSet, 100, 200);

    const maskedCount = maskSet.masks.filter((m) => m !== null).length;
    expect(maskedCount).toBe(1);
    expect(Object.keys(result)).toHaveLength(1);

    // The output key must be a real stableKey from the parsed render graph
    // (not a synthetic `f0`/`f1` placeholder).
    const [stableKey] = Object.keys(result);
    const parse = parseM0StringComplete(m0, 100, 200);
    expect(parse.ok).toBe(true);
    if (!parse.ok) return;
    const realKeys = new Set(parse.ir.renderFrames.map((f) => String(f.meta.stableKey)));
    expect(realKeys.has(stableKey)).toBe(true);
  });

  test("preserves the original mask's localPath + bounds verbatim", () => {
    const { grid, m0, maskSet } = build();
    const result = generateMasksByStableKey(grid, m0, maskSet, 100, 200);
    const [stableKey] = Object.keys(result);
    const original = maskSet.masks.find((m) => m !== null)!;
    expect(result[stableKey]).toEqual({
      localPath: original.localPath,
      bounds: original.bounds,
    });
  });

  test("matches the leaf whose bounds align with the masked shape, not a sibling", () => {
    const { grid, m0, maskSet } = build();
    const result = generateMasksByStableKey(grid, m0, maskSet, 100, 200);
    const [stableKey] = Object.keys(result);
    const parse = parseM0StringComplete(m0, 100, 200);
    if (!parse.ok) throw new Error("parse failed");
    const leaf = parse.ir.renderFrames.find((f) => String(f.meta.stableKey) === stableKey)!;
    expect(Math.round(leaf.y)).toBe(100);
    expect(Math.round(leaf.height)).toBe(100);
  });

  test("empty grid → empty map", () => {
    const { m0, maskSet } = build();
    expect(
      generateMasksByStableKey(
        { viewBox: null, xLines: [], yLines: [], shapes: [] },
        m0,
        maskSet,
        100,
        200,
      ),
    ).toEqual({});
  });

  test("frame-count mismatch (e.g. dedup variant) → empty map", () => {
    const { grid, maskSet } = build();
    // Single-frame m0 vs two-shape grid — meaningless to match.
    expect(generateMasksByStableKey(grid, "F", maskSet, 100, 200)).toEqual({});
  });
});
