import fs from "fs";
import path from "path";
import { extractGeometry } from "./extractGeometry";
import { parseSvg } from "./parseSvg";
import type { ExtractedShape } from "./types";

const EXAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "__fixtures__",
  "svg",
);

// Per-asset SVG source (the normalize-step filename drifted across docs runs;
// pick the right input for each).
const GOLDENS: Array<{ asset: string; svg: string }> = [
  { asset: "mlogo_v2", svg: "01-normalized.svg" },
  { asset: "m0_v2", svg: "0_DSL_192x256.svg" },
  { asset: "m0saic-pattern_v2", svg: "00-original.svg" },
];

describe("extractGeometry — bounds match docs 02-geometry.json", () => {
  for (const { asset, svg: svgFile } of GOLDENS) {
    test(`${asset}: every shape's bounds match the golden`, () => {
      const svg = fs.readFileSync(
        path.join(EXAMPLES_DIR, asset, svgFile),
        "utf-8",
      );
      const golden = JSON.parse(
        fs.readFileSync(path.join(EXAMPLES_DIR, asset, "02-geometry.json"), "utf-8"),
      ) as { shapes: ExtractedShape[] };

      const parsed = parseSvg(svg);
      const shapes = extractGeometry(parsed.paths);

      expect(shapes).toHaveLength(golden.shapes.length);
      for (let i = 0; i < shapes.length; i++) {
        expect(shapes[i].id).toBe(golden.shapes[i].id);
        expect(shapes[i].geometry.d).toBe(golden.shapes[i].geometry.d);
        // svg-path-bounds is deterministic — bounds should agree exactly.
        expect(shapes[i].bounds).toEqual(golden.shapes[i].bounds);
      }
    });
  }
});

describe("extractGeometry — basic shape", () => {
  test("ids are zero-padded shape-NNNN", () => {
    const parsed = parseSvg(
      `<svg><path d="M0 0L1 1"/><path d="M0 0L2 2"/></svg>`,
    );
    const shapes = extractGeometry(parsed.paths);
    expect(shapes[0].id).toBe("shape-0000");
    expect(shapes[1].id).toBe("shape-0001");
  });

  test("preserves source order", () => {
    const parsed = parseSvg(
      `<svg><path d="M5 5L6 6"/><path d="M0 0L1 1"/></svg>`,
    );
    const shapes = extractGeometry(parsed.paths);
    expect(shapes[0].index).toBe(0);
    expect(shapes[0].bounds.left).toBeCloseTo(5);
    expect(shapes[1].index).toBe(1);
    expect(shapes[1].bounds.left).toBeCloseTo(0);
  });

  test("computes cx/cy as the midpoint", () => {
    const parsed = parseSvg(`<svg><path d="M0 0L10 20"/></svg>`);
    const [shape] = extractGeometry(parsed.paths);
    expect(shape.bounds.cx).toBeCloseTo(5);
    expect(shape.bounds.cy).toBeCloseTo(10);
  });

  test("empty path list returns empty result", () => {
    expect(extractGeometry([])).toEqual([]);
  });
});
