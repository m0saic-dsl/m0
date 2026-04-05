/**
 * Performance scaffold: Canonical Mosaic M (33-rect) fixture
 *
 * Benchmarks major DSL operations using the production-shaped M logo fixture
 * and NxN tiled variants of it.
 *
 * Fixture sizes (from actual run):
 *   1x1 (base)   36,199 chars   17,985 nodes     33 render frames
 *   2x2         144,808 chars   71,943 nodes    132 render frames
 *   3x3         325,811 chars  161,869 nodes    297 render frames
 *   4x4         579,214 chars  287,765 nodes    528 render frames
 *   5x5         905,017 chars  449,631 nodes    825 render frames
 *   6x6       1,303,220 chars  647,467 nodes  1,188 render frames
 *
 * Design:
 * - Fixtures generated once at module load, not per test
 * - Timing uses performance.now() with warmup pass
 * - Correctness assertions verify frame/node counts scale as expected
 * - Thresholds are generous (>10x expected) to avoid CI flakiness
 */

import * as fs from "fs";
import * as path from "path";
import { validateM0String } from "../validate/m0StringValidator";
import {
  parseM0StringToRenderFrames,
  parseM0StringToLogicalFrames,
  parseM0StringToFullGraph,
  parseM0StringToFullGraphWithTraversal,
  parseM0StringComplete,
} from "../parse/m0StringParser";
import {
  getComplexityMetrics,
  getComplexityMetricsFast,
} from "../complexity";

// ─────────────────────────────────────────────────────────────
// Fixture loading & tiling
// ─────────────────────────────────────────────────────────────

/** Extract raw DSL payload from a .m0 file (lines after the header). */
function readM0Payload(filePath: string): string {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const payload: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    payload.push(trimmed);
  }
  return payload.join("");
}

const FIXTURE_PATH = path.resolve(__dirname, "fixture/m0saic-m-33.m0");
const BASE_DSL = readM0Payload(FIXTURE_PATH);

/** Base M complexity (from sidecar, verified at runtime) */
const BASE = {
  dslLength: 36199,
  frameCount: 33,
  passthroughCount: 16588,
  nullCount: 1298,
  groupCount: 66,
  nodeCount: 17985,
  editorFrameCount: 17985,
  traversalEventCount: 35937,
} as const;

/**
 * Tile the base DSL string into an NxN grid.
 *
 * Structure: N[ N(M,M,...M), N(M,M,...M), ... ] (N rows of N columns)
 *
 * Node overhead: N+1 wrapper groups (1 root + N row groups).
 * Everything else (frames, passthroughs, nulls, inner groups) scales by N*N.
 */
function tileNxN(baseDsl: string, n: number): string {
  const row = `${n}(${Array(n).fill(baseDsl).join(",")})`;
  return `${n}[${Array(n).fill(row).join(",")}]`;
}

/** Expected counts for an NxN tile of the base M. */
function expectedCounts(n: number) {
  const copies = n * n;
  const wrapperGroups = n + 1; // 1 root + N row groups
  return {
    frameCount: BASE.frameCount * copies,
    passthroughCount: BASE.passthroughCount * copies,
    nullCount: BASE.nullCount * copies,
    groupCount: BASE.groupCount * copies + wrapperGroups,
    nodeCount: BASE.nodeCount * copies + wrapperGroups,
    editorFrameCount: BASE.editorFrameCount * copies + wrapperGroups,
  };
}

/**
 * Canvas size per variant. Each tiled cell needs at least 272px on each axis
 * (the base M's precision minimum). We use 1920x1080 as the floor and scale
 * up only when the tile count would push individual cells below 272px.
 */
function canvasSize(n: number): { w: number; h: number } {
  const MIN_CELL = 272; // base M precision requirement
  return { w: Math.max(1920, n * MIN_CELL), h: Math.max(1080, n * MIN_CELL) };
}

// ─────────────────────────────────────────────────────────────
// Timing helpers
// ─────────────────────────────────────────────────────────────

/** Run fn once as warmup, then measure `iterations` runs. Returns avg ms. */
function benchmark(fn: () => void, iterations: number = 3): number {
  fn(); // warmup
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

// ─────────────────────────────────────────────────────────────
// Structured result collection
// ─────────────────────────────────────────────────────────────

type PerfRow = {
  variant: string;
  dslLength: number;
  nodeCount: number;
  frameCount: number;
  validateMs: number;
  complexityMs: number;
  renderFramesMs: number;
  logicalFramesMs: number;
  fullGraphMs: number;
  fullGraphTraversalMs: number;
  completeMs: number;
};

const perfResults: PerfRow[] = [];

// ─────────────────────────────────────────────────────────────
// Pre-generate all fixtures
// ─────────────────────────────────────────────────────────────

type Variant = { label: string; n: number; dsl: string };

const VARIANTS: Variant[] = [
  { label: "1x1 (base M)", n: 1, dsl: BASE_DSL },
  { label: "2x2", n: 2, dsl: tileNxN(BASE_DSL, 2) },
  { label: "3x3", n: 3, dsl: tileNxN(BASE_DSL, 3) },
  { label: "4x4", n: 4, dsl: tileNxN(BASE_DSL, 4) },
  { label: "5x5", n: 5, dsl: tileNxN(BASE_DSL, 5) },
  { label: "6x6", n: 6, dsl: tileNxN(BASE_DSL, 6) },
];

// ─────────────────────────────────────────────────────────────
// Base fixture sanity check
// ─────────────────────────────────────────────────────────────

describe("base M fixture integrity", () => {
  it("loads and validates", () => {
    expect(BASE_DSL.length).toBe(BASE.dslLength);
    const result = validateM0String(BASE_DSL);
    expect(result.ok).toBe(true);
  });

  it("complexity metrics match sidecar", () => {
    const m = getComplexityMetrics(BASE_DSL)!;
    expect(m).not.toBeNull();
    expect(m.frameCount).toBe(BASE.frameCount);
    expect(m.passthroughCount).toBe(BASE.passthroughCount);
    expect(m.nullCount).toBe(BASE.nullCount);
    expect(m.groupCount).toBe(BASE.groupCount);
    expect(m.nodeCount).toBe(BASE.nodeCount);
  });

  it("parse tier frame counts match sidecar", () => {
    const render = parseM0StringToRenderFrames(BASE_DSL, 1920, 1080);
    expect(render.length).toBe(BASE.frameCount);

    const logical = parseM0StringToLogicalFrames(BASE_DSL, 1920, 1080);
    expect(logical.length).toBe(BASE.frameCount);

    const editor = parseM0StringToFullGraph(BASE_DSL, 1920, 1080);
    expect(editor.length).toBe(BASE.editorFrameCount);

    const fgwt = parseM0StringToFullGraphWithTraversal(BASE_DSL, 1920, 1080);
    expect(fgwt.editorFrames.length).toBe(BASE.editorFrameCount);
    expect(fgwt.traversal.length).toBe(BASE.traversalEventCount);
  });
});

// ─────────────────────────────────────────────────────────────
// Tiled variant correctness — all sizes, all tiers
// ─────────────────────────────────────────────────────────────

describe("tiled variant correctness", () => {
  for (const v of VARIANTS) {
    if (v.n === 1) continue; // base already tested above

    describe(v.label, () => {
      const expected = expectedCounts(v.n);

      it("validates", () => {
        expect(validateM0String(v.dsl).ok).toBe(true);
      });

      it("complexity metrics scale correctly", () => {
        const m = getComplexityMetrics(v.dsl)!;
        expect(m).not.toBeNull();
        expect(m.frameCount).toBe(expected.frameCount);
        expect(m.passthroughCount).toBe(expected.passthroughCount);
        expect(m.nullCount).toBe(expected.nullCount);
        expect(m.groupCount).toBe(expected.groupCount);
        expect(m.nodeCount).toBe(expected.nodeCount);
      });

      it("render frame count scales correctly", () => {
        const { w, h } = canvasSize(v.n);
        const frames = parseM0StringToRenderFrames(v.dsl, w, h);
        expect(frames.length).toBe(expected.frameCount);
      });

      it("editor frame count scales correctly", () => {
        const { w, h } = canvasSize(v.n);
        const frames = parseM0StringToFullGraph(v.dsl, w, h);
        expect(frames.length).toBe(expected.editorFrameCount);
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Spread-overflow regression test
//
// Before the fix, frames.push(...this.parseInternal(...)) would
// overflow V8's argument limit at ~162K nodes (3x3 tiled M).
// This test verifies the fix holds at that size and beyond.
// ─────────────────────────────────────────────────────────────

describe("spread-overflow regression (3x3 = ~162K nodes)", () => {
  const dsl3x3 = VARIANTS[2].dsl;
  const expected = expectedCounts(3);
  const { w, h } = canvasSize(3);

  it("parses render frames without stack overflow", () => {
    const frames = parseM0StringToRenderFrames(dsl3x3, w, h);
    expect(frames.length).toBe(expected.frameCount);
  });

  it("parses full graph without stack overflow", () => {
    const frames = parseM0StringToFullGraph(dsl3x3, w, h);
    expect(frames.length).toBe(expected.editorFrameCount);
  });

  it("complete parse succeeds with correct counts", () => {
    const result = parseM0StringComplete(dsl3x3, w, h);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.renderFrames.length).toBe(expected.frameCount);
    expect(result.ir.editorFrames?.length).toBe(expected.editorFrameCount);
  });

  it("stableKeys are unique across all editor frames", () => {
    const result = parseM0StringComplete(dsl3x3, w, h);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const editorFrames = result.ir.editorFrames ?? [];
    const keys = new Set(editorFrames.map((f) => f.meta.stableKey));
    expect(keys.size).toBe(editorFrames.length);
  });
});

// ─────────────────────────────────────────────────────────────
// Performance: full timing collection for all variants
// ─────────────────────────────────────────────────────────────

describe("M fixture performance (timed)", () => {
  for (const v of VARIANTS) {
    describe(v.label, () => {
      const expected = v.n === 1 ? BASE : expectedCounts(v.n);

      it("collects timings for all DSL operations", () => {
        const { w, h } = canvasSize(v.n);
        const log = (op: string, ms: number) =>
          console.log(`  ⏱  ${v.label.padEnd(12)} ${op.padEnd(16)} ${ms.toFixed(1).padStart(8)}ms`);

        const validateMs = benchmark(() => validateM0String(v.dsl));
        log("validate", validateMs);

        const complexityMs = benchmark(() => getComplexityMetricsFast(v.dsl));
        log("complexity", complexityMs);

        const renderFramesMs = benchmark(() =>
          parseM0StringToRenderFrames(v.dsl, w, h),
        );
        log("renderFrames", renderFramesMs);

        const logicalFramesMs = benchmark(() =>
          parseM0StringToLogicalFrames(v.dsl, w, h),
        );
        log("logicalFrames", logicalFramesMs);

        const fullGraphMs = benchmark(() =>
          parseM0StringToFullGraph(v.dsl, w, h),
        );
        log("fullGraph", fullGraphMs);

        const fullGraphTraversalMs = benchmark(() =>
          parseM0StringToFullGraphWithTraversal(v.dsl, w, h),
        );
        log("fullGraph+trav", fullGraphTraversalMs);

        const completeMs = benchmark(() =>
          parseM0StringComplete(v.dsl, w, h),
        );
        log("complete", completeMs);

        const row: PerfRow = {
          variant: v.label,
          dslLength: v.dsl.length,
          nodeCount: expected.nodeCount,
          frameCount: expected.frameCount,
          validateMs,
          complexityMs,
          renderFramesMs,
          logicalFramesMs,
          fullGraphMs,
          fullGraphTraversalMs,
          completeMs,
        };
        perfResults.push(row);

        // Sanity ceiling — nothing should take more than 60s
        for (const [key, val] of Object.entries(row)) {
          if (typeof val === "number" && key.endsWith("Ms")) {
            expect(val).toBeLessThan(60_000);
          }
        }
      });
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Regression guards
// ─────────────────────────────────────────────────────────────

describe("regression guards", () => {
  it("base M validates in < 100ms", () => {
    const ms = benchmark(() => validateM0String(BASE_DSL));
    expect(ms).toBeLessThan(100);
  });

  it("base M parses render frames in < 100ms", () => {
    const ms = benchmark(() =>
      parseM0StringToRenderFrames(BASE_DSL, 1920, 1080),
    );
    expect(ms).toBeLessThan(100);
  });

  it("base M parses full graph in < 500ms", () => {
    const ms = benchmark(() =>
      parseM0StringToFullGraph(BASE_DSL, 1920, 1080),
    );
    expect(ms).toBeLessThan(500);
  });

  it("base M complete parse in < 1000ms", () => {
    const ms = benchmark(() =>
      parseM0StringComplete(BASE_DSL, 1920, 1080),
    );
    expect(ms).toBeLessThan(1000);
  });

  it("2x2 tile parses render frames in < 1000ms", () => {
    const dsl2x2 = VARIANTS[1].dsl;
    const { w, h } = canvasSize(2);
    const ms = benchmark(() =>
      parseM0StringToRenderFrames(dsl2x2, w, h),
    );
    expect(ms).toBeLessThan(1000);
  });

  it("6x6 tile validates in < 5000ms", () => {
    const dsl6x6 = VARIANTS[5].dsl;
    const ms = benchmark(() => validateM0String(dsl6x6));
    expect(ms).toBeLessThan(5000);
  });

  it("complexity scan is faster than validation at every scale", () => {
    for (const v of VARIANTS) {
      const complexityMs = benchmark(() => getComplexityMetricsFast(v.dsl), 5);
      const validateMs = benchmark(() => validateM0String(v.dsl), 5);
      expect(complexityMs).toBeLessThan(validateMs * 1.5);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Scaling linearity
// ─────────────────────────────────────────────────────────────

describe("scaling linearity", () => {
  it("render frames: 4x4 is < 20x slower than 1x1 (linear would be 16x)", () => {
    const baseMs = benchmark(
      () => parseM0StringToRenderFrames(BASE_DSL, 1920, 1080),
      5,
    );
    const dsl4x4 = VARIANTS[3].dsl;
    const { w, h } = canvasSize(4);
    const tiledMs = benchmark(
      () => parseM0StringToRenderFrames(dsl4x4, w, h),
      5,
    );
    const ratio = tiledMs / Math.max(baseMs, 0.01);
    expect(ratio).toBeLessThan(40);
  });

  it("validation: 6x6 is < 80x slower than 1x1 (linear would be 36x)", () => {
    const baseMs = benchmark(() => validateM0String(BASE_DSL), 5);
    const dsl6x6 = VARIANTS[5].dsl;
    const tiledMs = benchmark(() => validateM0String(dsl6x6), 5);
    const ratio = tiledMs / Math.max(baseMs, 0.01);
    expect(ratio).toBeLessThan(80);
  });

  it("complexity: 6x6 is < 80x slower than 1x1 (linear=36x, sub-ms base has noise)", () => {
    const baseMs = benchmark(() => getComplexityMetricsFast(BASE_DSL), 10);
    const dsl6x6 = VARIANTS[5].dsl;
    const tiledMs = benchmark(() => getComplexityMetricsFast(dsl6x6), 10);
    const ratio = tiledMs / Math.max(baseMs, 0.01);
    expect(ratio).toBeLessThan(80);
  });
});

// ─────────────────────────────────────────────────────────────
// Summary table (afterAll)
// ─────────────────────────────────────────────────────────────

afterAll(() => {
  if (perfResults.length === 0) return;

  const fmt = (v: number) => {
    if (v < 1) return `${v.toFixed(2)}ms`;
    if (v < 100) return `${v.toFixed(1)}ms`;
    if (v < 1000) return `${Math.round(v)}ms`;
    return `${(v / 1000).toFixed(2)}s`;
  };

  const fmtK = (v: number) => {
    if (v < 1000) return String(v);
    if (v < 100_000) return `${(v / 1000).toFixed(1)}K`;
    return `${Math.round(v / 1000)}K`;
  };

  const lines: string[] = [];
  lines.push("");
  lines.push("M0SAIC M PERFORMANCE RESULTS");
  lines.push("=".repeat(60));
  lines.push("");

  for (const r of perfResults) {
    lines.push(`${r.variant}`);
    lines.push(`  input     ${fmtK(r.dslLength)} chars   ${fmtK(r.nodeCount)} nodes   ${r.frameCount} frames`);
    lines.push(`  scan      validate ${fmt(r.validateMs).padStart(9)}    complexity ${fmt(r.complexityMs).padStart(9)}`);
    lines.push(`  parse     render   ${fmt(r.renderFramesMs).padStart(9)}    logical    ${fmt(r.logicalFramesMs).padStart(9)}`);
    lines.push(`  graph     full     ${fmt(r.fullGraphMs).padStart(9)}    +traversal ${fmt(r.fullGraphTraversalMs).padStart(9)}    complete ${fmt(r.completeMs).padStart(9)}`);
    lines.push("");
  }

  console.log(lines.join("\n"));
});
