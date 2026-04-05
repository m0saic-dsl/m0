/**
 * BREAK TEST: Giant rendered frame output — frame count ceiling finder
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT THIS IS TRYING TO BREAK:
 *
 * This test targets OUTPUT SIZE — the number of final rendered
 * frames flowing through the pipeline — not structural depth
 * or nesting breadth.
 *
 * Previous break tests stressed:
 *   - deep-chain: recursion depth (container nesting)
 *   - deep-overlay: recursion depth (overlay nesting)
 *   - wide-flat: sibling count in one split
 *   - giant-export: serialization of large parse results
 *
 * This test asks: what happens when the parser produces tens of
 * thousands of rendered frames and every downstream consumer
 * must handle them?
 *
 * Specific code paths stressed:
 *   1. renderFrames array — sort, copy, map at scale
 *   2. paintSorted / logicalSorted — two full sorts of N frames
 *   3. logicalIndexByFrameId Map — N entries
 *   4. stableKey generation for N rendered leaves
 *   5. EditorFrame construction — N+groups objects
 *   6. assignStackOrder — DFS + sort over all frames
 *   7. Identity map — N leaf identities + group identities
 *   8. Traversal events — ~3N events for N-frame trees
 *   9. splitEven — called at each grid level
 *
 * GENERATED SHAPE:
 *   NxN uniform grid: N[N(1,1,...,1), N(1,1,...,1), ...]
 *   This produces N*N rendered frames with simple structure:
 *   1 root group + N row groups + N*N frame leaves = N*N + N + 1 nodes.
 *
 *   N=10   →     100 frames,    111 nodes
 *   N=50   →   2,500 frames,  2,551 nodes
 *   N=100  →  10,000 frames, 10,101 nodes
 *   N=200  →  40,000 frames, 40,201 nodes
 *   N=316  → ~99,856 frames (≈100K)
 *   N=500  → 250,000 frames
 *
 * CANVAS SIZING:
 *   Each cell gets canvas/N pixels per axis. Use max(1920, N)
 *   so every cell gets >= 1px.
 * ═══════════════════════════════════════════════════════════════
 */

import { validateM0String } from "../validate/m0StringValidator";
import {
  parseM0StringToRenderFrames,
  parseM0StringComplete,
} from "../parse/m0StringParser";
import { getComplexityMetricsFast } from "../complexity";

// ─────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────

/**
 * Build an NxN uniform grid of rendered frames.
 *
 *   N=2 → "2[2(1,1),2(1,1)]"
 *   N=3 → "3[3(1,1,1),3(1,1,1),3(1,1,1)]"
 *
 * Produces N*N rendered frames, N+1 groups, N*N+N+1 total nodes.
 * DSL length ≈ N * (2N + digits(N) + 2) + digits(N) + 2
 *            ≈ 2N² for large N.
 */
function buildGrid(n: number): string {
  if (n <= 1) return "1";
  const row = `${n}(${Array(n).fill("1").join(",")})`;
  return `${n}[${Array(n).fill(row).join(",")}]`;
}

// ─────────────────────────────────────────────────────────────
// Grid sizes to probe — targeting frame count milestones
// ─────────────────────────────────────────────────────────────

const GRIDS = [
  { n: 10,  expectedFrames: 100 },
  { n: 50,  expectedFrames: 2500 },
  { n: 100, expectedFrames: 10000 },
  { n: 200, expectedFrames: 40000 },
  { n: 316, expectedFrames: 99856 },  // ≈100K
];

// ─────────────────────────────────────────────────────────────
// Result tracking
// ─────────────────────────────────────────────────────────────

type FrameRow = {
  n: number;
  frames: number;
  dslChars: number;
  nodes: number;
  validateMs: number;
  renderMs: number;
  completeMs: number;
};

const rows: FrameRow[] = [];

function fmt(v: number): string {
  if (v < 1) return `${v.toFixed(2)}ms`;
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

function fmtK(v: number): string {
  if (v < 1000) return String(v);
  if (v < 100_000) return `${(v / 1000).toFixed(1)}K`;
  return `${Math.round(v / 1000)}K`;
}

type ProbeResult = {
  outcome: "pass" | "stack_overflow";
  ms: number;
};

function probe(fn: () => void): ProbeResult {
  const start = performance.now();
  try {
    fn();
    return { outcome: "pass", ms: performance.now() - start };
  } catch (e: any) {
    const ms = performance.now() - start;
    if (/call stack/i.test(e.message)) {
      return { outcome: "stack_overflow", ms };
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("BREAK: giant rendered frame output", () => {
  it("generator produces correct structure at small N", () => {
    expect(buildGrid(1)).toBe("1");
    expect(buildGrid(2)).toBe("2[2(1,1),2(1,1)]");
    expect(buildGrid(3)).toBe("3[3(1,1,1),3(1,1,1),3(1,1,1)]");
  });

  it("generator frame count = N*N", () => {
    const m = getComplexityMetricsFast(buildGrid(10));
    expect(m.frameCount).toBe(100);
    expect(m.groupCount).toBe(11); // 1 root + 10 rows
    expect(m.nodeCount).toBe(111);
  });

  // ─────────────────────────────────────────────────────────────
  // Correctness at N=10
  // ─────────────────────────────────────────────────────────────

  describe("correctness at N=10", () => {
    it("complete parse matches expected counts", () => {
      const dsl = buildGrid(10);
      const result = parseM0StringComplete(dsl, 1920, 1080);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.renderFrames.length).toBe(100);
      expect(result.ir.editorFrames?.length).toBe(111);
    });

    it("all render frames have unique logicalIndex 0..99", () => {
      const frames = parseM0StringToRenderFrames(buildGrid(10), 1920, 1080);
      expect(frames.length).toBe(100);
      const indices = new Set(frames.map((f) => f.logicalIndex));
      expect(indices.size).toBe(100);
      for (let i = 0; i < 100; i++) expect(indices.has(i)).toBe(true);
    });

    it("all render frames have unique paintOrder 0..99", () => {
      const frames = parseM0StringToRenderFrames(buildGrid(10), 1920, 1080);
      const orders = new Set(frames.map((f) => f.paintOrder));
      expect(orders.size).toBe(100);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: scale up frame count
  // ─────────────────────────────────────────────────────────────

  for (const { n, expectedFrames } of GRIDS) {
    describe(`${n}x${n} grid (${fmtK(expectedFrames)} frames)`, () => {
      const dsl = buildGrid(n);
      const c = Math.max(1920, n);
      const expectedNodes = n * n + n + 1;

      it("complexity matches", () => {
        const m = getComplexityMetricsFast(dsl);
        expect(m.frameCount).toBe(expectedFrames);
        expect(m.nodeCount).toBe(expectedNodes);
      });

      it("validate", () => {
        const r = probe(() => {
          const res = validateM0String(dsl);
          if (!res.ok) throw new Error(`validation failed: ${(res as { error: { code: string } }).error.code}`);
        });
        rows.push({
          n,
          frames: expectedFrames,
          dslChars: dsl.length,
          nodes: expectedNodes,
          validateMs: r.ms,
          renderMs: -1,
          completeMs: -1,
        });
        if (r.outcome !== "pass") {
          console.log(`  CEILING: validate ${r.outcome} at ${n}x${n}`);
        }
        expect(r.outcome).toBe("pass");
      });

      it("renderFrames", () => {
        const r = probe(() => {
          const frames = parseM0StringToRenderFrames(dsl, c, c);
          expect(frames.length).toBe(expectedFrames);
        });
        // Update the last row
        rows[rows.length - 1].renderMs = r.ms;
        if (r.outcome !== "pass") {
          console.log(`  CEILING: renderFrames ${r.outcome} at ${n}x${n}`);
        }
        expect(r.outcome).toBe("pass");
      });

      it("complete parse", () => {
        const r = probe(() => {
          const result = parseM0StringComplete(dsl, c, c);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.ir.renderFrames.length).toBe(expectedFrames);
          expect(result.ir.editorFrames?.length).toBe(expectedNodes);
        });
        rows[rows.length - 1].completeMs = r.ms;
        if (r.outcome !== "pass") {
          console.log(`  CEILING: complete ${r.outcome} at ${n}x${n}`);
        }
        expect(r.outcome).toBe("pass");
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────

  afterAll(() => {
    if (rows.length === 0) return;

    console.log("\n  GIANT RENDERED OUTPUT BREAK TEST RESULTS");
    console.log("  " + "─".repeat(56));

    for (const r of rows) {
      console.log(
        `  ${String(r.n).padStart(3)}x${String(r.n).padEnd(3)}` +
        `  ${fmtK(r.frames).padStart(5)} frames` +
        `  ${fmtK(r.dslChars).padStart(5)} chars` +
        `  validate ${fmt(r.validateMs).padStart(8)}` +
        `  render ${fmt(r.renderMs).padStart(8)}` +
        `  complete ${fmt(r.completeMs).padStart(8)}`,
      );
    }
    console.log("");
  });
});
