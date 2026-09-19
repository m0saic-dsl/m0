import fs from "fs";
import path from "path";
import { rectsToM0 } from "./rectsToM0";
import type { Grid, GridShape } from "./types";

/**
 * Goldens: the v2 (cleanup-encoder) composed outputs in
 * packages/docs/svg-to-mosaic/examples/. Every `05-composed.m0` was generated
 * by 04-generate-rects + 05-compose at pack=one, so we compare against pack=one.
 *
 * If this test fails, the lift from docs/tools into the stdlib has diverged
 * from the production encoder. The fix is to align the stdlib with the docs
 * tools, not the other way around.
 */

const EXAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "__fixtures__",
  "svg",
);

const GOLDEN_PAIRS = [
  "m0_v2",
  "m0saic-pattern_v2",
  "mlogo_v2",
];

function loadGrid(assetDir: string): Grid {
  const raw = JSON.parse(
    fs.readFileSync(path.join(assetDir, "03-grid.json"), "utf-8"),
  );
  const shapes: GridShape[] = raw.shapes.map((s: GridShape) => ({
    id: s.id,
    index: s.index,
    rawBounds: s.rawBounds,
    snappedBounds: s.snappedBounds,
    gridSpan: s.gridSpan,
  }));
  return {
    viewBox: raw.source?.viewBox ?? null,
    xLines: raw.xLines,
    yLines: raw.yLines,
    shapes,
  };
}

function loadComposedM0String(assetDir: string): string {
  const text = fs.readFileSync(path.join(assetDir, "05-composed.m0"), "utf-8");
  const lines = text.split("\n");
  const body = lines.filter((l) => !l.startsWith("#")).join("\n").trim();
  return body;
}

describe("rectsToM0 — golden parity against docs/svg-to-mosaic v2 examples", () => {
  for (const asset of GOLDEN_PAIRS) {
    describe(asset, () => {
      const assetDir = path.join(EXAMPLES_DIR, asset);

      test("asset directory exists", () => {
        expect(fs.existsSync(assetDir)).toBe(true);
      });

      test("rectsToM0(grid, pack=one) matches 05-composed.m0 byte-for-byte", () => {
        const grid = loadGrid(assetDir);
        const golden = loadComposedM0String(assetDir);
        const variant = rectsToM0(grid, { packing: "one" });
        expect(String(variant.m0)).toBe(golden);
      });

      test("the variant reports a valid rectCount and layerCount equal to rectCount for pack=one", () => {
        const grid = loadGrid(assetDir);
        const variant = rectsToM0(grid, { packing: "one" });
        expect(variant.rectCount).toBe(grid.shapes.length);
        expect(variant.layerCount).toBe(grid.shapes.length);
      });

      test("pack=multi produces a strictly-no-larger string than pack=one", () => {
        const grid = loadGrid(assetDir);
        const oneVariant = rectsToM0(grid, { packing: "one" });
        const multiVariant = rectsToM0(grid, { packing: "multi" });
        expect(multiVariant.charLen).toBeLessThanOrEqual(oneVariant.charLen);
        expect(multiVariant.layerCount).toBeLessThanOrEqual(oneVariant.layerCount);
      });
    });
  }
});
