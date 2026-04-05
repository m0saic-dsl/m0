/**
 * BREAK TEST: Deep overlay nesting — ceiling finder
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT THIS IS TRYING TO BREAK:
 *
 * Deep overlay nesting stresses a DIFFERENT code path than deep
 * container chains (tested separately in deep-chain.break.test).
 *
 * Container nesting (2(1,2[1,...])) creates structural depth:
 *   - halves canvas space per level
 *   - exercises the container branch in parseInternal
 *   - each level creates a GROUP node
 *
 * Overlay nesting (1{1{1{...}}}) creates overlay depth:
 *   - does NOT subdivide canvas (every frame gets full rect)
 *   - exercises the overlay branch in parseInternal
 *     (parseOverlayIfPresent → recursive parseInternal with
 *      overlayDepth + 1)
 *   - each level creates a FRAME node with increasing overlayDepth
 *   - stableKeys use /ov{depth}c{k} segments (different namespace)
 *   - overlay frames are tracked in overlayFrameIds Set
 *   - paint order / stack order is more complex (overlay deferral)
 *
 * Specific code paths stressed by deep overlays:
 *   1. parseInternal overlay recursion (via parseOverlayIfPresent)
 *   2. overlayFrameIds tracking (Set growing with every frame)
 *   3. overlayRenderedByOwner tracking (Map of overlay owners)
 *   4. visitOverlay in buildIdentityMap (recursive with /ov keys)
 *   5. walkNode → checkOverlay in computeNodeSpansByPath
 *   6. emitNode overlay root traversal in assignStackOrder
 *   7. stableKey growth: /ov1c0/ov2c0/ov3c0/... (O(depth) per key)
 *
 * All of these have been converted to iterative stacks, but deep
 * overlays specifically exercise the overlay-specific branches
 * that deep container chains do not touch.
 * ═══════════════════════════════════════════════════════════════
 *
 * GENERATED SHAPE:
 *   1{1{1{1{...{1}...}}}}
 *   A single base frame with D levels of nested overlays.
 *   Each overlay contains exactly one rendered frame.
 *
 * EXPECTED COUNTS at depth D:
 *   - Frames (rendered): D + 1  (base + one per overlay level)
 *   - Groups: 0                 (no splits)
 *   - Total nodes: D + 1
 *   - Editor frames: D + 1
 *   - Render frames: D + 1
 *
 * DSL LENGTH at depth D:
 *   "1" + D × "{1" + D × "}" = 1 + 3D chars
 *
 * CANVAS SIZING:
 *   Overlays do NOT subdivide the canvas. Every frame at every
 *   depth gets the full canvas rect. A fixed 1920×1080 works
 *   at any depth.
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
 * Build a deeply nested overlay chain.
 *
 *   depth=0 → "1"
 *   depth=1 → "1{1}"
 *   depth=2 → "1{1{1}}"
 *   depth=3 → "1{1{1{1}}}"
 *
 * Built via array join to avoid O(d²) string concatenation.
 */
function buildDeepOverlay(depth: number): string {
  // "1" + "{1" repeated D times + "}" repeated D times
  const parts: string[] = ["1"];
  for (let d = 0; d < depth; d++) parts.push("{1");
  for (let d = 0; d < depth; d++) parts.push("}");
  return parts.join("");
}

// ─────────────────────────────────────────────────────────────
// Depth probes
// ─────────────────────────────────────────────────────────────

const DEPTHS = [10, 100, 500, 1000, 2000, 3000, 5000, 7500, 10000];

// Overlays don't subdivide — fixed canvas works at any depth.
const W = 1920;
const H = 1080;

// ─────────────────────────────────────────────────────────────
// Result tracking (same pattern as deep-chain break test)
// ─────────────────────────────────────────────────────────────

type ProbeResult = {
  depth: number;
  tier: string;
  outcome: "pass" | "stack_overflow";
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
    return { depth, tier, outcome: "pass", ms: performance.now() - start };
  } catch (e: any) {
    const ms = performance.now() - start;
    if (/call stack/i.test(e.message)) {
      return { depth, tier, outcome: "stack_overflow", ms };
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("BREAK: deep overlay nesting", () => {
  it("generator produces correct DSL at small depths", () => {
    expect(buildDeepOverlay(0)).toBe("1");
    expect(buildDeepOverlay(1)).toBe("1{1}");
    expect(buildDeepOverlay(2)).toBe("1{1{1}}");
    expect(buildDeepOverlay(3)).toBe("1{1{1{1}}}");
    expect(buildDeepOverlay(4)).toBe("1{1{1{1{1}}}}");
  });

  it("generator length = 1 + 3*depth", () => {
    for (const d of [0, 10, 100, 1000]) {
      expect(buildDeepOverlay(d).length).toBe(1 + 3 * d);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Correctness at shallow depth
  // ─────────────────────────────────────────────────────────────

  describe("correctness at shallow depth", () => {
    it("depth=10: complexity metrics", () => {
      const m = getComplexityMetricsFast(buildDeepOverlay(10));
      expect(m.frameCount).toBe(11);
      expect(m.groupCount).toBe(0);
      expect(m.nodeCount).toBe(11);
    });

    it("depth=10: render frames", () => {
      const frames = parseM0StringToRenderFrames(buildDeepOverlay(10), W, H);
      expect(frames.length).toBe(11);
    });

    it("depth=10: complete parse", () => {
      const result = parseM0StringComplete(buildDeepOverlay(10), W, H);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.renderFrames.length).toBe(11);
      expect(result.ir.editorFrames?.length).toBe(11);
    });

    it("depth=10: all render frames have full canvas rect", () => {
      const frames = parseM0StringToRenderFrames(buildDeepOverlay(10), W, H);
      for (const f of frames) {
        expect(f.width).toBe(W);
        expect(f.height).toBe(H);
        expect(f.x).toBe(0);
        expect(f.y).toBe(0);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: complexity (iterative scanner)
  // ─────────────────────────────────────────────────────────────

  describe("complexity (iterative scanner)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const m = getComplexityMetricsFast(buildDeepOverlay(depth));
        expect(m.frameCount).toBe(depth + 1);
        expect(m.groupCount).toBe(0);
        expect(m.nodeCount).toBe(depth + 1);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: validate
  // ─────────────────────────────────────────────────────────────

  describe("validate", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepOverlay(depth);
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
  // Ceiling finder: renderFrames
  //
  // Exercises overlay-specific paths: parseOverlayIfPresent,
  // overlayFrameIds tracking, overlay emitNode traversal.
  // ─────────────────────────────────────────────────────────────

  describe("renderFrames (overlay parse + paint order)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepOverlay(depth);
        const r = probe(depth, "renderFrames", () => {
          const frames = parseM0StringToRenderFrames(dsl, W, H);
          // Overlays don't cull — all frames get full rect at any depth
          expect(frames.length).toBe(depth + 1);
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
  // Ceiling finder: complete parse
  //
  // Exercises all overlay-specific graph paths: visitOverlay
  // in buildIdentityMap, overlay stableKey construction
  // (/ov1c0/ov2c0/...), walkNode checkOverlay, traversal.
  // ─────────────────────────────────────────────────────────────

  describe("complete parse (full graph — overlay identity + spans)", () => {
    for (const depth of DEPTHS) {
      it(`depth=${depth}`, () => {
        const dsl = buildDeepOverlay(depth);
        const r = probe(depth, "complete", () => {
          const result = parseM0StringComplete(dsl, W, H);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.ir.renderFrames.length).toBe(depth + 1);
          expect(result.ir.editorFrames?.length).toBe(depth + 1);
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
    console.log("\n  DEEP-OVERLAY BREAK TEST RESULTS");
    console.log("  " + "─".repeat(56));

    const tiers = [...new Set(results.map((r) => r.tier))];
    for (const tier of tiers) {
      const tierResults = results.filter((r) => r.tier === tier);
      const maxPass = Math.max(
        ...tierResults.filter((r) => r.outcome === "pass").map((r) => r.depth),
        0,
      );
      const minFail = Math.min(
        ...tierResults.filter((r) => r.outcome === "stack_overflow").map((r) => r.depth),
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
