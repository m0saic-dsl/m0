/**
 * BREAK TEST: Deep-chain nesting — stack overflow ceiling finder
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT THIS IS TRYING TO BREAK:
 *
 * The DSL parser and post-parse graph construction use unbounded
 * recursion in at least five separate functions:
 *
 *   1. parseInternal()        — recursive descent parser (line ~762)
 *   2. emitNode()             — paint/stack order assignment (line ~364)
 *   3. visitStructural()      — stableKey / identity map (line ~1149)
 *   4. visit()                — traversal event generation (line ~1295)
 *   5. walkNode()             — node span computation (line ~967)
 *
 * None of these have depth guards. A valid DSL string with deep
 * container nesting will recurse N levels in EACH function.
 *
 * V8's default call stack limit is ~10K-15K frames depending on
 * frame size. These functions have moderate-sized frames (10+
 * locals, closures), so the practical ceiling is lower.
 *
 * Additionally, the validator has a recursive tokenCheckIndexed()
 * that also recurses on nesting depth.
 *
 * This test generates deep chains at increasing depths to find
 * the exact ceiling where the implementation crashes.
 * ═══════════════════════════════════════════════════════════════
 *
 * GENERATED SHAPE:
 *   2(1,2[1,2(1,2[1,...,1])])
 *   Alternating row/col splits, each with one leaf (1) and one
 *   nested child. The deepest level is a bare leaf (1).
 *
 * EXPECTED NODE COUNTS at depth D:
 *   - Groups: D (one 2-split per level)
 *   - Frames: D + 1 (one leaf per level + one at the bottom)
 *   - Total nodes: 2D + 1
 *   - Render frames: D + 1 (at sufficient canvas resolution)
 *
 * CANVAS SIZING:
 *   Each nesting level halves the space on one axis. To ensure
 *   every tile gets >= 1px, the canvas must be at least 2^D on
 *   each axis. JavaScript doubles handle this up to 2^53. We
 *   use 2^D so all frames are geometrically valid and we get
 *   exact correctness assertions at every depth.
 *
 * PARSE TIERS EXERCISED:
 *   - validateM0String (has recursive tokenCheckIndexed)
 *   - parseM0StringToRenderFrames (parseInternal + emitNode)
 *   - parseM0StringComplete (all five recursive functions)
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
 * Build a deeply nested DSL chain of alternating row/col splits.
 *
 *   depth=0 → "1"
 *   depth=1 → "2(1,1)"
 *   depth=2 → "2(1,2[1,1])"
 *   depth=3 → "2(1,2[1,2(1,1)])"
 *
 * Built inside-out via array assembly to avoid O(d²) string concat.
 */
function buildDeepChain(depth: number): string {
  if (depth <= 0) return "1";

  const parts: string[] = ["1"];
  for (let d = depth; d >= 1; d--) {
    const open = d % 2 === 1 ? "(" : "[";
    const close = d % 2 === 1 ? ")" : "]";
    parts.push(close);
    parts.unshift(`2${open}1,`);
  }
  return parts.join("");
}

// ─────────────────────────────────────────────────────────────
// Depth probes — designed to bracket the ceiling
// ─────────────────────────────────────────────────────────────

const DEPTHS = [10, 100, 500, 1000, 2000, 3000, 5000, 7500, 10000];

/**
 * Canvas size for a given depth. Each nesting level halves one axis,
 * so we need 2^D pixels to guarantee every tile >= 1px. JS doubles
 * handle 2^53 safely, and the parser uses integer math, so even
 * 2^10000 works as a number (it's just a large double).
 *
 * We cap at 2^50 to stay in safe integer territory. For depths > 50,
 * the innermost tiles may be sub-1px, but parseInternal still runs
 * (it doesn't early-exit on zero-pixel). The zero-pixel filter is
 * only applied to the final output, so parseInternal's recursion
 * still exercises the full depth regardless of canvas size.
 */
function canvas(depth: number): number {
  return 2 ** Math.min(depth, 50);
}

// ─────────────────────────────────────────────────────────────
// Result tracking
// ─────────────────────────────────────────────────────────────

type ProbeResult = {
  depth: number;
  tier: string;
  outcome: "pass" | "stack_overflow" | "geometry_fail";
  ms: number;
};

const results: ProbeResult[] = [];

function probe(
  depth: number,
  tier: string,
  fn: () => void,
): ProbeResult {
  const start = performance.now();
  try {
    fn();
    const ms = performance.now() - start;
    return { depth, tier, outcome: "pass", ms };
  } catch (e: any) {
    const ms = performance.now() - start;
    if (/call stack/i.test(e.message)) {
      return { depth, tier, outcome: "stack_overflow", ms };
    }
    // Re-throw unexpected errors
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("BREAK: deep-chain nesting", () => {
  it("generator produces correct DSL at small depths", () => {
    expect(buildDeepChain(0)).toBe("1");
    expect(buildDeepChain(1)).toBe("2(1,1)");
    expect(buildDeepChain(2)).toBe("2(1,2[1,1])");
    expect(buildDeepChain(3)).toBe("2(1,2[1,2(1,1)])");
    expect(buildDeepChain(4)).toBe("2(1,2[1,2(1,2[1,1])])");
  });

  it("generator length scales linearly (~5 chars per depth)", () => {
    const d100 = buildDeepChain(100);
    const d200 = buildDeepChain(200);
    const delta = d200.length - d100.length;
    expect(delta).toBeGreaterThanOrEqual(490);
    expect(delta).toBeLessThan(510);
  });

  // ─────────────────────────────────────────────────────────────
  // Correctness at shallow depth (geometry feasible)
  // ─────────────────────────────────────────────────────────────

  describe("correctness at shallow depth", () => {
    it("depth=10: complexity metrics are exact", () => {
      const dsl = buildDeepChain(10);
      const m = getComplexityMetricsFast(dsl);
      expect(m.frameCount).toBe(11);
      expect(m.groupCount).toBe(10);
      expect(m.nodeCount).toBe(21);
    });

    it("depth=10: render frames count is exact", () => {
      const c = canvas(10);
      const frames = parseM0StringToRenderFrames(buildDeepChain(10), c, c);
      expect(frames.length).toBe(11);
    });

    it("depth=10: complete parse succeeds with correct counts", () => {
      const c = canvas(10);
      const result = parseM0StringComplete(buildDeepChain(10), c, c);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.renderFrames.length).toBe(11);
      expect(result.ir.editorFrames?.length).toBe(21);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: complexity (iterative scanner — expected safe)
  // ─────────────────────────────────────────────────────────────

  describe("complexity (iterative scanner)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepChain(depth);
        const m = getComplexityMetricsFast(dsl);
        expect(m.frameCount).toBe(depth + 1);
        expect(m.groupCount).toBe(depth);
        expect(m.nodeCount).toBe(2 * depth + 1);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: validate
  //
  // tokenCheckIndexed is recursive on nesting depth — may overflow.
  // ─────────────────────────────────────────────────────────────

  describe("validate (recursive tokenCheckIndexed)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepChain(depth);
        const r = probe(depth, "validate", () => {
          const res = validateM0String(dsl);
          if (!res.ok) throw new Error(`validation failed: ${(res as { error: { code: string } }).error.code}`);
        });
        results.push(r);

        if (r.outcome === "stack_overflow") {
          console.log(`  CEILING: validate overflows at depth=${depth}`);
        }

        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: parseM0StringToRenderFrames
  //
  // Exercises: parseInternal (recursive) + emitNode (recursive)
  // Geometry fails at depth > ~16 (ok:false or empty result),
  // which is expected. We only care about stack overflow.
  // ─────────────────────────────────────────────────────────────

  describe("renderFrames (parseInternal + emitNode recursion)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepChain(depth);
        const c = canvas(depth);
        const r = probe(depth, "renderFrames", () => {
          const frames = parseM0StringToRenderFrames(dsl, c, c);
          // Geometry is feasible up to depth ~50 (canvas = 2^50).
          // Beyond that, inner tiles may be 0px and get culled.
          if (depth <= 50) {
            expect(frames.length).toBe(depth + 1);
          }
        });
        results.push(r);

        if (r.outcome === "stack_overflow") {
          console.log(`  CEILING: renderFrames overflows at depth=${depth}`);
        }

        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: parseM0StringComplete
  //
  // Exercises ALL recursive paths. Most likely to overflow first.
  // ok:false from geometry culling is expected and acceptable.
  // Stack overflow (RangeError) is the failure we're hunting.
  // ─────────────────────────────────────────────────────────────

  describe("complete parse (all recursive paths)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepChain(depth);
        const c = canvas(depth);
        const r = probe(depth, "complete", () => {
          const result = parseM0StringComplete(dsl, c, c);
          if (depth <= 50) {
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            expect(result.ir.renderFrames.length).toBe(depth + 1);
            expect(result.ir.editorFrames?.length).toBe(2 * depth + 1);
          }
        });
        results.push(r);

        if (r.outcome === "stack_overflow") {
          console.log(`  CEILING: complete parse overflows at depth=${depth}`);
        }

        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────

  afterAll(() => {
    console.log("\n  DEEP-CHAIN BREAK TEST RESULTS");
    console.log("  " + "─".repeat(56));

    const tiers = [...new Set(results.map((r) => r.tier))];
    for (const tier of tiers) {
      const tierResults = results.filter((r) => r.tier === tier);
      const maxPass = Math.max(
        ...tierResults.filter((r) => r.outcome === "pass").map((r) => r.depth),
        0,
      );
      const minFail = Math.min(
        ...tierResults
          .filter((r) => r.outcome === "stack_overflow")
          .map((r) => r.depth),
        Infinity,
      );

      const status =
        minFail === Infinity
          ? `all depths pass (max tested: ${DEPTHS[DEPTHS.length - 1]})`
          : `ceiling between ${maxPass} and ${minFail}`;

      console.log(`  ${tier.padEnd(16)} ${status}`);
    }
    console.log("");
  });
});
