/**
 * BREAK TEST: Wide flat splits — massive sibling count ceiling finder
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT THIS IS TRYING TO BREAK:
 *
 * This test stresses BREADTH rather than depth. The deep-chain
 * and deep-overlay break tests found recursion ceilings; this
 * test hunts for a different class of ceiling:
 *
 *   - Large child count per split (N-way flat split)
 *   - O(n²) in the validator's iterativeCheck (substring loop)
 *   - Array allocation pressure (splitEven producing huge arrays)
 *   - Sort/filter/map on massive frame arrays (15+ sorts in parser)
 *   - Map/Set construction with hundreds of thousands of entries
 *   - Identity map building with huge sibling lists
 *   - Structural index construction (childCommas map entries)
 *   - stableKey construction for wide sibling sets (fc0..fc99999)
 *
 * The generated shape is a single N-way horizontal split where
 * every child is a rendered frame. This maximizes the rendered
 * frame count relative to DSL length and puts maximum pressure
 * on every per-frame operation in the pipeline.
 *
 * Specific code paths stressed:
 *   1. iterativeCheck() — O(n²) substring loop on every validate
 *   2. buildStructuralIndex() — childCommas map for the root split
 *   3. splitEven() — allocating N-element size array
 *   4. assignStackOrder() — sort + map building on N frames
 *   5. buildIdentityMap() — N sibling identity assignments
 *   6. computeNodeSpansByPath() — N span map entries
 *   7. Multiple sort() calls on N-element rendered arrays
 *   8. EditorFrame construction for N+1 frames
 * ═══════════════════════════════════════════════════════════════
 *
 * GENERATED SHAPE:
 *   N(1,1,1,...,1)    — N rendered frames in a single horizontal split
 *
 * EXPECTED COUNTS at width N:
 *   - Groups: 1           (the root N-split)
 *   - Frames: N           (one per child)
 *   - Total nodes: N + 1  (group + N frames)
 *   - Render frames: N
 *   - Editor frames: N + 1
 *
 * DSL LENGTH at width N:
 *   len("N") + 1 + N*1 + (N-1)*1 + 1 = digits(N) + 2N
 *   ≈ 2N chars for large N
 *
 * CANVAS SIZING:
 *   Each child gets canvas_width / N pixels wide. At width 100K
 *   with a 100K-pixel canvas, each child gets 1px. We use
 *   max(1920, N) to keep every frame >= 1px.
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
 * Build a flat N-way horizontal split with all rendered frames.
 *
 *   width=1  → "1"          (bare frame, no split — 1-splits are illegal)
 *   width=2  → "2(1,1)"
 *   width=5  → "5(1,1,1,1,1)"
 *   width=N  → "N(1,1,...,1)"
 *
 * Built via array join to avoid O(n²) concatenation.
 */
function buildWideFlat(width: number): string {
  if (width <= 1) return "1";
  return `${width}(${Array(width).fill("1").join(",")})`;
}

// ─────────────────────────────────────────────────────────────
// Width probes — ramp up to expose quadratic or allocation limits
// ─────────────────────────────────────────────────────────────

const WIDTHS = [10, 100, 1000, 5000, 10000, 50000, 100000];

// ─────────────────────────────────────────────────────────────
// Result tracking (same pattern as other break tests)
// ─────────────────────────────────────────────────────────────

type ProbeResult = {
  width: number;
  tier: string;
  outcome: "pass" | "stack_overflow" | "timeout";
  ms: number;
};

const results: ProbeResult[] = [];

/** Generous ceiling — if any single operation takes > 60s, flag it. */
const TIMEOUT_MS = 60_000;

function probe(
  width: number,
  tier: string,
  fn: () => void,
): ProbeResult {
  const start = performance.now();
  try {
    fn();
    const ms = performance.now() - start;
    if (ms > TIMEOUT_MS) {
      return { width, tier, outcome: "timeout", ms };
    }
    return { width, tier, outcome: "pass", ms };
  } catch (e: any) {
    const ms = performance.now() - start;
    if (/call stack/i.test(e.message)) {
      return { width, tier, outcome: "stack_overflow", ms };
    }
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("BREAK: wide flat splits", () => {
  it("generator produces correct DSL at small widths", () => {
    expect(buildWideFlat(1)).toBe("1");
    expect(buildWideFlat(2)).toBe("2(1,1)");
    expect(buildWideFlat(3)).toBe("3(1,1,1)");
    expect(buildWideFlat(5)).toBe("5(1,1,1,1,1)");
  });

  it("generator length ≈ 2*width", () => {
    const s = buildWideFlat(1000);
    // "1000(" + "1,"*999 + "1" + ")" = 5 + 1998 + 1 + 1 = 2005
    expect(s.length).toBeGreaterThan(1990);
    expect(s.length).toBeLessThan(2010);
  });

  // ─────────────────────────────────────────────────────────────
  // Correctness at small width
  // ─────────────────────────────────────────────────────────────

  describe("correctness at small width", () => {
    it("width=100: complexity metrics", () => {
      const m = getComplexityMetricsFast(buildWideFlat(100));
      expect(m.frameCount).toBe(100);
      expect(m.groupCount).toBe(1);
      expect(m.nodeCount).toBe(101);
    });

    it("width=100: render frames", () => {
      const frames = parseM0StringToRenderFrames(buildWideFlat(100), 1920, 1080);
      expect(frames.length).toBe(100);
    });

    it("width=100: complete parse", () => {
      const result = parseM0StringComplete(buildWideFlat(100), 1920, 1080);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.renderFrames.length).toBe(100);
      expect(result.ir.editorFrames?.length).toBe(101);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: complexity (iterative scanner)
  // ─────────────────────────────────────────────────────────────

  describe("complexity (iterative scanner)", () => {
    for (const width of WIDTHS) {
      it(`width=${width}`, () => {
        const dsl = buildWideFlat(width);
        const r = probe(width, "complexity", () => {
          const m = getComplexityMetricsFast(dsl);
          expect(m.frameCount).toBe(width);
          expect(m.groupCount).toBe(1);
          expect(m.nodeCount).toBe(width + 1);
        });
        results.push(r);
        if (r.outcome !== "pass") {
          console.log(`  CEILING: complexity ${r.outcome} at width=${width} (${r.ms.toFixed(0)}ms)`);
        }
        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: validate
  //
  // iterativeCheck() has an O(n²) substring loop that runs on
  // every validation. For 100K children ≈ 200K chars, this may
  // become very slow.
  // ─────────────────────────────────────────────────────────────

  describe("validate (includes iterativeCheck O(n²) path)", () => {
    for (const width of WIDTHS) {
      it(`width=${width}`, () => {
        const dsl = buildWideFlat(width);
        const canvasW = Math.max(1920, width);
        const r = probe(width, "validate", () => {
          const res = validateM0String(dsl);
          if (!res.ok) throw new Error(`validation failed: ${(res as { error: { code: string } }).error.code}`);
        });
        results.push(r);
        if (r.outcome !== "pass") {
          console.log(`  CEILING: validate ${r.outcome} at width=${width} (${r.ms.toFixed(0)}ms)`);
        }
        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: renderFrames
  //
  // Exercises: parseInternal (N iterations), assignStackOrder
  // (sort N frames), identity placeholders.
  // ─────────────────────────────────────────────────────────────

  describe("renderFrames (N-frame output, sorts, maps)", () => {
    for (const width of WIDTHS) {
      it(`width=${width}`, () => {
        const dsl = buildWideFlat(width);
        const canvasW = Math.max(1920, width);
        const r = probe(width, "renderFrames", () => {
          const frames = parseM0StringToRenderFrames(dsl, canvasW, 1080);
          expect(frames.length).toBe(width);
        });
        results.push(r);
        if (r.outcome !== "pass") {
          console.log(`  CEILING: renderFrames ${r.outcome} at width=${width} (${r.ms.toFixed(0)}ms)`);
        }
        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Ceiling finder: complete parse
  //
  // Exercises full graph: identity map for N+1 nodes, span map,
  // EditorFrame construction, traversal events.
  // ─────────────────────────────────────────────────────────────

  describe("complete parse (full graph — N+1 nodes)", () => {
    for (const width of WIDTHS) {
      it(`width=${width}`, () => {
        const dsl = buildWideFlat(width);
        const canvasW = Math.max(1920, width);
        const r = probe(width, "complete", () => {
          const result = parseM0StringComplete(dsl, canvasW, 1080);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(result.ir.renderFrames.length).toBe(width);
          expect(result.ir.editorFrames?.length).toBe(width + 1);
        });
        results.push(r);
        if (r.outcome !== "pass") {
          console.log(`  CEILING: complete ${r.outcome} at width=${width} (${r.ms.toFixed(0)}ms)`);
        }
        expect(r.outcome).toBe("pass");
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────

  afterAll(() => {
    console.log("\n  WIDE-FLAT BREAK TEST RESULTS");
    console.log("  " + "─".repeat(56));

    const tiers = [...new Set(results.map((r) => r.tier))];
    for (const tier of tiers) {
      const tierResults = results.filter((r) => r.tier === tier);
      const maxPass = Math.max(
        ...tierResults.filter((r) => r.outcome === "pass").map((r) => r.width),
        0,
      );
      const minFail = Math.min(
        ...tierResults.filter((r) => r.outcome !== "pass").map((r) => r.width),
        Infinity,
      );
      const status =
        minFail === Infinity
          ? `all widths pass (max tested: ${WIDTHS[WIDTHS.length - 1]})`
          : `ceiling between ${maxPass} and ${minFail}`;
      console.log(`  ${tier.padEnd(16)} ${status}`);

      // Also show timing for each width
      for (const r of tierResults) {
        const flag = r.outcome !== "pass" ? ` ← ${r.outcome.toUpperCase()}` : "";
        console.log(`    width=${String(r.width).padStart(6)}  ${r.ms.toFixed(0).padStart(6)}ms${flag}`);
      }
    }
    console.log("");
  });
});
