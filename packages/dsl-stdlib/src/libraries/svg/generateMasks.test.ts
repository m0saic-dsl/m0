import fs from "fs";
import path from "path";
import type { MosaicMaskEntry, MosaicMaskSetFile } from "../../mirroredTypes";
import { extractGeometry } from "./extractGeometry";
import {
  clipLocalPathToBounds,
  generateMasks,
  isMaskedPath,
  toLocalPath,
} from "./generateMasks";
import { inferGrid } from "./inferGrid";
import { parseSvg } from "./parseSvg";
import { rectsToM0 } from "./rectsToM0";

const FIXTURES = path.resolve(__dirname, "..", "..", "..", "__fixtures__", "svg");

const ASSETS: Array<{ name: string; svgFile: string }> = [
  { name: "mlogo_v2", svgFile: "01-normalized.svg" },
  { name: "m0_v2", svgFile: "0_DSL_192x256.svg" },
  { name: "m0saic-pattern_v2", svgFile: "00-original.svg" },
];

// ── Step-06 fixture shape (richer than the dictionary's MosaicMaskSetFile). ──
type DocsMaskEntry = {
  shapeId: string;
  canonicalIndex: number;
  kind: "rect" | "masked";
  bounds: { x: number; y: number; width: number; height: number };
  localPath?: string;
};
type DocsMaskFile = { masks: DocsMaskEntry[] };

/**
 * Convert the docs/step-06 `06-masks.json` into the dictionary's
 * `MosaicMaskSetFile` shape. Rect-only entries become `null`; masked entries
 * carry just `{ localPath, bounds }`.
 */
function projectDocsToDictionary(docs: DocsMaskFile): MosaicMaskSetFile {
  const length = docs.masks.length;
  const out: (MosaicMaskEntry | null)[] = new Array(length).fill(null);
  for (const entry of docs.masks) {
    if (entry.kind === "rect") {
      out[entry.canonicalIndex] = null;
    } else {
      if (!entry.localPath) {
        throw new Error(`docs fixture: masked entry missing localPath: ${entry.shapeId}`);
      }
      out[entry.canonicalIndex] = { localPath: entry.localPath, bounds: entry.bounds };
    }
  }
  return { masks: out };
}

describe("generateMasks — dictionary parity vs docs step-06 goldens", () => {
  for (const { name, svgFile } of ASSETS) {
    test(`${name}: matches projected 06-masks.json byte-for-byte`, () => {
      const svgText = fs.readFileSync(path.join(FIXTURES, name, svgFile), "utf-8");
      const parsed = parseSvg(svgText);
      const shapes = extractGeometry(parsed.paths);
      const grid = inferGrid(shapes, parsed.viewBox, {
        driftPercent: 0,
        driftMode: "cluster",
      });
      const variant = rectsToM0(grid, { packing: "one" });

      const generated = generateMasks(grid, variant.m0);

      const docsJson = JSON.parse(
        fs.readFileSync(path.join(FIXTURES, name, "06-masks.json"), "utf-8"),
      ) as DocsMaskFile;
      const golden = projectDocsToDictionary(docsJson);

      expect(generated.masks).toHaveLength(golden.masks.length);
      for (let i = 0; i < golden.masks.length; i++) {
        expect(generated.masks[i]).toEqual(golden.masks[i]);
      }
    });
  }
});

describe("isMaskedPath", () => {
  test("simple axis-aligned rect → false", () => {
    expect(isMaskedPath("M19.7296 0.010376H0.0599976V48.117H19.7296V0.010376Z")).toBe(false);
  });

  test("path with L commands → true", () => {
    expect(isMaskedPath("M48.248 48.067H61.799V33.52L37.582 -0.0396H-0.325V48.067Z")).toBe(true);
  });

  test("path with curves → true", () => {
    expect(isMaskedPath("M0 0C5 5 10 10 15 15Z")).toBe(true);
  });

  test("empty path → true (not rect-like)", () => {
    expect(isMaskedPath("")).toBe(true);
  });
});

describe("toLocalPath", () => {
  test("subtracts origin from M / H / V / L commands", () => {
    const d = "M 100 50 H 150 V 80 L 100 80 Z";
    const local = toLocalPath(d, { x: 100, y: 50 });
    expect(local).toBe("M 0 0 H 50 V 30 L 0 30 Z");
  });

  test("preserves A arc radii + flags; translates only the endpoint", () => {
    const d = "M 100 100 A 30 30 0 0 1 130 130 Z";
    const local = toLocalPath(d, { x: 100, y: 100 });
    expect(local).toBe("M 0 0 A 30 30 0 0 1 30 30 Z");
  });

  test("zero translation is a no-op (modulo whitespace normalization)", () => {
    expect(toLocalPath("M 10 20 H 30 Z", { x: 0, y: 0 })).toBe("M 10 20 H 30 Z");
  });

  // Relative commands (lowercase): coords are offsets from the previous point,
  // which gets translated by the same amount as the origin — so relative
  // offsets are unchanged. Only absolute coords need subtraction.
  test("relative h / v / l pass through unchanged under translation", () => {
    const d = "M 100 50 h 50 v 30 l -50 0 Z";
    expect(toLocalPath(d, { x: 100, y: 50 })).toBe("M 0 0 h 50 v 30 l -50 0 Z");
  });

  test("relative c (cubic Bezier) passes through unchanged", () => {
    const d = "M 100 100 c 10 0 20 10 30 30 Z";
    expect(toLocalPath(d, { x: 100, y: 100 })).toBe("M 0 0 c 10 0 20 10 30 30 Z");
  });

  test("relative s / q (smooth-cubic / quadratic Bezier) pass through unchanged", () => {
    const d = "M 100 100 s 5 5 10 10 q 1 2 3 4 Z";
    expect(toLocalPath(d, { x: 100, y: 100 })).toBe("M 0 0 s 5 5 10 10 q 1 2 3 4 Z");
  });

  test("relative a (arc) passes through unchanged", () => {
    const d = "M 100 100 a 10 10 0 0 1 5 5 Z";
    expect(toLocalPath(d, { x: 100, y: 100 })).toBe("M 0 0 a 10 10 0 0 1 5 5 Z");
  });

  test("lowercase m at path start is treated as absolute (translates initial point)", () => {
    // First m positions the initial point absolutely. Subsequent implicit
    // pairs after m are relative l line-tos.
    const d = "m 100 50 30 0 0 30 Z";
    expect(toLocalPath(d, { x: 100, y: 50 })).toBe("m 0 0 30 0 0 30 Z");
  });

  test("lowercase m after the start is relative", () => {
    const d = "M 100 50 L 110 60 m 20 20 Z";
    expect(toLocalPath(d, { x: 100, y: 50 })).toBe("M 0 0 L 10 10 m 20 20 Z");
  });

  test("mixed absolute and relative — Illustrator-style FFmpeg-shaped path", () => {
    // A common shape: starts with absolute M, uses lowercase relative h/c/l/v.
    // Only the absolute M coord translates; relative offsets stay verbatim.
    const d = "M 39.5 42 h -9 c -1 0 -1.9 -0.6 -2.3 -1.5 l 8.3 -8.3 v -3.9 Z";
    expect(toLocalPath(d, { x: 6, y: 6 })).toBe(
      "M 33.5 36 h -9 c -1 0 -1.9 -0.6 -2.3 -1.5 l 8.3 -8.3 v -3.9 Z",
    );
  });
});

// Sutherland-Hodgman preserves polygon orientation but starts at whichever
// edge-vertex the algorithm visits first — that depends on edge ordering.
// Vertex-set comparison handles the rotation equivalence.
function polygonVertices(path: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const tokens = path.match(/[ML]|-?\d+(?:\.\d+)?/g) ?? [];
  let i = 0;
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd !== "M" && cmd !== "L") continue;
    out.push([Number(tokens[i++]), Number(tokens[i++])]);
  }
  return out;
}
function vCompare(a: [number, number], b: [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

describe("clipLocalPathToBounds", () => {
  test("path fully inside bounds → unchanged geometry", () => {
    // Triangle within [0,0,100,100] — clipping should be a no-op.
    const d = "M 10 10 L 90 10 L 90 90 Z";
    const out = clipLocalPathToBounds(d, 100, 100);
    // Re-emitted with explicit final Z; vertex set identical.
    expect(out).toBe("M 10 10 L 90 10 L 90 90 Z");
  });

  test("path that overflows a smaller rect gets clipped to the rect", () => {
    // Right triangle authored at 100×100 but assigned to a 80×80 rect — the
    // hypotenuse should be cut at the right edge.
    const d = "M 0 0 L 100 0 L 100 100 Z";
    const out = clipLocalPathToBounds(d, 80, 80);
    // After Sutherland-Hodgman the bottom-right corner (100, 100) is gone;
    // new vertices land at (80, 0) and (80, 80). The output's M-start
    // vertex depends on edge-traversal order; the polygon is unchanged
    // under rotation so check the vertex set instead.
    expect(polygonVertices(out).sort(vCompare)).toEqual(
      polygonVertices("M 0 0 L 80 0 L 80 80 Z").sort(vCompare),
    );
  });

  test("path that overflows on multiple edges gets clipped on every edge", () => {
    // Big square authored well beyond the assigned rect.
    const d = "M -20 -20 L 120 -20 L 120 120 L -20 120 Z";
    const out = clipLocalPathToBounds(d, 100, 50);
    // Clipped to the rect exactly.
    expect(polygonVertices(out).sort(vCompare)).toEqual(
      polygonVertices("M 0 0 L 100 0 L 100 50 L 0 50 Z").sort(vCompare),
    );
  });

  test("triangle inscribed in three of four bbox corners survives unchanged", () => {
    // Same shape the dictionary's frame-28 fix restored — must round-trip.
    const d = "M 26 36 L 26 0 H 0 L 26 36 Z";
    const out = clipLocalPathToBounds(d, 26, 36);
    // M/L re-emit drops the trailing repeated start vertex, so the output
    // names only the three unique corners.
    expect(out).toBe("M 26 36 L 26 0 L 0 0 Z");
  });

  test("paths containing curves are returned unchanged (clip skips)", () => {
    const d = "M 0 0 C 10 10 20 20 30 30 Z";
    const out = clipLocalPathToBounds(d, 100, 100);
    expect(out).toBe(d);
  });

  test("polygon fully outside the rect returns the original (degenerate guard)", () => {
    const d = "M 200 200 L 300 200 L 300 300 Z";
    const out = clipLocalPathToBounds(d, 100, 100);
    expect(out).toBe(d);
  });
});

describe("generateMasks — output shape invariants", () => {
  test("output array length equals shape count", () => {
    const svgText = fs.readFileSync(path.join(FIXTURES, "mlogo_v2", "01-normalized.svg"), "utf-8");
    const parsed = parseSvg(svgText);
    const shapes = extractGeometry(parsed.paths);
    const grid = inferGrid(shapes, parsed.viewBox, {
      driftPercent: 0,
      driftMode: "cluster",
    });
    const variant = rectsToM0(grid, { packing: "one" });
    const result = generateMasks(grid, variant.m0);
    expect(result.masks).toHaveLength(shapes.length);
  });

  test("deterministic — same input twice produces identical output", () => {
    const svgText = fs.readFileSync(path.join(FIXTURES, "mlogo_v2", "01-normalized.svg"), "utf-8");
    const parsed = parseSvg(svgText);
    const shapes = extractGeometry(parsed.paths);
    const grid = inferGrid(shapes, parsed.viewBox);
    const variant = rectsToM0(grid, { packing: "one" });
    const a = generateMasks(grid, variant.m0);
    const b = generateMasks(grid, variant.m0);
    expect(a).toEqual(b);
  });
});
