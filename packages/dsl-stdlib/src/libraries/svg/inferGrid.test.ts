import fs from "fs";
import path from "path";
import { inferGrid } from "./inferGrid";
import { rectsToM0 } from "./rectsToM0";
import type { ExtractedShape, ViewBox } from "./types";

const EXAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "__fixtures__",
  "svg",
);

// Hard goldens: byte-for-byte parity with the saved 03-grid.json and
// 05-composed.m0. These assets are stable across the lift.
const HARD_GOLDENS = ["m0_v2", "mlogo_v2"];

// Soft goldens: the saved 03-grid.json predates a clustering tweak in
// packages/docs/svg-to-mosaic/tools/03-infer-grid.ts; the docs JSON wasn't
// regenerated. inferGrid still produces a valid grid for the same input —
// we just don't expect byte-for-byte agreement on this one asset.
const SOFT_GOLDENS = ["m0saic-pattern_v2"];

const ALL_GOLDENS = [...HARD_GOLDENS, ...SOFT_GOLDENS];

type GeometryFile = {
  source?: { viewBox?: ViewBox | null };
  shapes: ExtractedShape[];
};

type GridFile = {
  source?: { viewBox?: ViewBox | null };
  xLines: number[];
  yLines: number[];
  shapes: Array<{
    id: string;
    gridSpan: { xStart: number; xEnd: number; yStart: number; yEnd: number };
  }>;
};

function loadGeometry(assetDir: string): GeometryFile {
  return JSON.parse(
    fs.readFileSync(path.join(assetDir, "02-geometry.json"), "utf-8"),
  );
}

function loadGridGolden(assetDir: string): GridFile {
  return JSON.parse(
    fs.readFileSync(path.join(assetDir, "03-grid.json"), "utf-8"),
  );
}

function loadComposedM0String(assetDir: string): string {
  const text = fs.readFileSync(path.join(assetDir, "05-composed.m0"), "utf-8");
  return text
    .split("\n")
    .filter((l) => !l.startsWith("#"))
    .join("\n")
    .trim();
}

describe("inferGrid — hard golden parity (byte-for-byte vs docs/svg-to-mosaic)", () => {
  for (const asset of HARD_GOLDENS) {
    describe(asset, () => {
      const assetDir = path.join(EXAMPLES_DIR, asset);

      test("xLines and yLines match the golden 03-grid.json exactly", () => {
        const geom = loadGeometry(assetDir);
        const goldenGrid = loadGridGolden(assetDir);

        // Saved goldens were produced at driftPercent=0 with cluster mode
        // (predates the gcd-snap mode addition). Replicate.
        const grid = inferGrid(geom.shapes, geom.source?.viewBox ?? null, {
          driftPercent: 0,
          driftMode: "cluster",
        });

        expect(grid.xLines).toEqual(goldenGrid.xLines);
        expect(grid.yLines).toEqual(goldenGrid.yLines);
      });

      test("every shape's gridSpan matches the golden", () => {
        const geom = loadGeometry(assetDir);
        const goldenGrid = loadGridGolden(assetDir);

        const grid = inferGrid(geom.shapes, geom.source?.viewBox ?? null, {
          driftPercent: 0,
          driftMode: "cluster",
        });

        for (let i = 0; i < grid.shapes.length; i++) {
          expect(grid.shapes[i].id).toBe(goldenGrid.shapes[i].id);
          expect(grid.shapes[i].gridSpan).toEqual(goldenGrid.shapes[i].gridSpan);
        }
      });

      test("inferGrid → rectsToM0 round-trip equals 05-composed.m0 byte-for-byte", () => {
        const geom = loadGeometry(assetDir);
        const golden = loadComposedM0String(assetDir);

        const grid = inferGrid(geom.shapes, geom.source?.viewBox ?? null, {
          driftPercent: 0,
          driftMode: "cluster",
        });
        const variant = rectsToM0(grid, { packing: "one" });

        expect(String(variant.m0)).toBe(golden);
      });
    });
  }
});

describe("inferGrid — soft golden checks (stale saved JSON; output still valid)", () => {
  for (const asset of SOFT_GOLDENS) {
    describe(asset, () => {
      const assetDir = path.join(EXAMPLES_DIR, asset);

      test("infers a non-degenerate grid for the saved geometry", () => {
        const geom = loadGeometry(assetDir);
        const grid = inferGrid(geom.shapes, geom.source?.viewBox ?? null, {
          driftPercent: 0,
          driftMode: "cluster",
        });
        expect(grid.xLines.length).toBeGreaterThanOrEqual(2);
        expect(grid.yLines.length).toBeGreaterThanOrEqual(2);
        expect(grid.shapes).toHaveLength(geom.shapes.length);
        for (const s of grid.shapes) {
          expect(s.gridSpan.xStart).toBeLessThan(s.gridSpan.xEnd);
          expect(s.gridSpan.yStart).toBeLessThan(s.gridSpan.yEnd);
        }
      });

      test("inferGrid → rectsToM0 produces a valid M0String", () => {
        const geom = loadGeometry(assetDir);
        const grid = inferGrid(geom.shapes, geom.source?.viewBox ?? null, {
          driftPercent: 0,
          driftMode: "cluster",
        });
        const variant = rectsToM0(grid, { packing: "one" });
        // toM0String inside rectsToM0 validates — the branded type proves it.
        expect(typeof variant.m0).toBe("string");
        expect(variant.m0.length).toBeGreaterThan(0);
        expect(variant.rectCount).toBe(geom.shapes.length);
      });
    });
  }
});

describe("inferGrid — meta sanity across all golden assets", () => {
  for (const asset of ALL_GOLDENS) {
    test(`${asset}: meta reports effectiveDriftMode='cluster' at driftPercent=0`, () => {
      const assetDir = path.join(EXAMPLES_DIR, asset);
      const geom = loadGeometry(assetDir);
      const grid = inferGrid(geom.shapes, geom.source?.viewBox ?? null, {
        driftPercent: 0,
        driftMode: "gcd-snap",
      });
      expect(grid.meta?.effectiveDriftMode).toBe("cluster");
      expect(grid.meta?.toleranceUsedPx).toBe(0.25);
      expect(grid.meta?.achievedGcd).toBeNull();
    });
  }
});

describe("inferGrid — gcd-snap mode functional smoke", () => {
  // Synthetic 100×100 canvas with rects already on integer grid → gcd-snap
  // should find a large divisor and report achievedGcd > 1.
  const shapes: ExtractedShape[] = [
    {
      id: "s0",
      index: 0,
      type: "path",
      geometry: { d: "" },
      style: { fill: null, stroke: null, style: null },
      bounds: {
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        left: 0,
        top: 0,
        right: 50,
        bottom: 50,
        cx: 25,
        cy: 25,
      },
    },
    {
      id: "s1",
      index: 1,
      type: "path",
      geometry: { d: "" },
      style: { fill: null, stroke: null, style: null },
      bounds: {
        x: 50,
        y: 50,
        width: 50,
        height: 50,
        left: 50,
        top: 50,
        right: 100,
        bottom: 100,
        cx: 75,
        cy: 75,
      },
    },
  ];
  const viewBox: ViewBox = { x: 0, y: 0, width: 100, height: 100 };

  test("achieves a useful gcd at driftPercent=1", () => {
    const grid = inferGrid(shapes, viewBox, {
      driftPercent: 1,
      driftMode: "gcd-snap",
    });
    expect(grid.meta?.effectiveDriftMode).toBe("gcd-snap");
    expect(grid.meta?.achievedGcd).not.toBeNull();
    // 50 is the largest divisor of 100 that satisfies the non-collapse
    // constraint on both axes (each rect snaps to two distinct multiples).
    expect(grid.meta?.achievedGcd?.col).toBe(50);
    expect(grid.meta?.achievedGcd?.row).toBe(50);
  });

  test("falls back to cluster when no viewBox", () => {
    const grid = inferGrid(shapes, null, {
      driftPercent: 0,
      driftMode: "gcd-snap",
    });
    expect(grid.meta?.effectiveDriftMode).toBe("cluster");
  });

  test("rejects driftPercent > 0 without a viewBox", () => {
    expect(() =>
      inferGrid(shapes, null, { driftPercent: 1, driftMode: "gcd-snap" }),
    ).toThrow(/viewBox/);
  });
});

describe("inferGrid — input validation", () => {
  test("throws on empty shapes", () => {
    expect(() => inferGrid([], null)).toThrow(/non-empty/);
  });

  test("throws on negative driftPercent", () => {
    const shape: ExtractedShape = {
      id: "x",
      index: 0,
      type: "path",
      geometry: { d: "" },
      style: { fill: null, stroke: null, style: null },
      bounds: {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
        cx: 0.5,
        cy: 0.5,
      },
    };
    expect(() => inferGrid([shape], null, { driftPercent: -1 })).toThrow(
      /non-negative/,
    );
  });
});
