/**
 * BREAK / CEILING TEST: very large DSL strings (up to ~10M chars)
 *
 * ═══════════════════════════════════════════════════════════════
 * WHY THIS EXISTS:
 *
 * Hand-tracing ~200 rectangles (each placed via placeRect + stacked as an
 * overlay layer, every layer carrying its own null bars) produced a real
 * ~1.3M-char DSL string. As authoring scales, the string ceiling climbs. This
 * test proves the DSL pipeline keeps working far past that, up to ~10M chars,
 * and documents WHERE each tier tops out.
 *
 * EMPIRICAL LADDER (M2, node 20, single run — indicative, not asserted):
 *
 *   chars    nodes     isValid      renderFrames(geom)     full materialize
 *   0.30M    150K      57 ms        ~0.3 s                 ~0.6 s
 *   1.20M    600K      110 ms       ~1.3 s                 ~2.3 s
 *   3.60M    1.8M      420 ms       ~5.6 s                 ~9.7 s
 *   10.2M    5.1M      702 ms       ~6.3 s / 1.4 GB        OOM @ 4 GB heap
 *
 * TAKEAWAYS (the reason renderOnly / geometry paths matter):
 *   - Validation is ~linear and cheap — the grammar handles 10M+ comfortably.
 *   - Geometry parse (parseM0StringToRenderFrames) returns rects for 10M chars
 *     within a default heap.
 *   - FULL editor materialization (all-node EditorFrame map + identity spans +
 *     passthrough-owner DFS) is the memory ceiling: it OOMs around ~5M nodes
 *     at a 4 GB heap. That is exactly the cost `materialize: "renderOnly"` and
 *     `parseM0StringToRenderFrames` skip.
 *
 * The assertions below stay well under the full-materialization ceiling so the
 * suite never OOMs CI, while still exercising 10M chars through the cheap tiers.
 * Runs under `npm run test:dsl:slow`, which pins a 4 GB heap explicitly
 * (`node --max-old-space-size=4096 … --runInBand`) — node's DEFAULT old-space
 * scales with machine RAM (~2 GB on an 8 GB Mac), and the cumulative GC
 * pressure of these cases in one process needs the 4 GB this ladder was
 * calibrated against. Do not run this suite through bare `jest`.
 * ═══════════════════════════════════════════════════════════════
 *
 * GENERATED SHAPE:
 *   N(0,1,-,0,1,-,...)  — one N-way split of well-formed "0,1,-" groups
 *   (every passthrough has a following claimant; ~1/3 render). Canvas width is
 *   sized so each base slot is >= 8px, keeping every size feasible.
 */

import { parseM0StringToRenderFrames, parseM0StringComplete } from "../parse/m0StringParser";
import { isValidM0String } from "../validate/m0StringValidator";

// ─────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────

/** Returns { m0, w, h, groups }. groups*3 tokens, ~6 chars/group. */
function buildDense(groups: number) {
  const t = new Array<string>(groups * 3);
  for (let i = 0; i < groups; i++) {
    t[i * 3] = "0";
    t[i * 3 + 1] = "1";
    t[i * 3 + 2] = "-";
  }
  const m0 = `${t.length}(${t.join(",")})`;
  return { m0, w: groups * 3 * 8, h: 1080, groups };
}

const SECONDS = 1000;
const TEST_TIMEOUT = 180 * SECONDS;

// groups → approx chars: ~1.3M, ~3M, ~10M
const VALIDATE_LADDER = [217_000, 500_000, 1_700_000];

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("BREAK: very large DSL strings", () => {
  it("validates DSL up to ~10M chars (linear, cheap)", () => {
    for (const groups of VALIDATE_LADDER) {
      const { m0 } = buildDense(groups);
      const start = performance.now();
      const ok = isValidM0String(m0);
      const ms = performance.now() - start;
      expect(ok).toBe(true);
      // generous ceiling — validation is linear; flag only a real blowup
      expect(ms).toBeLessThan(30 * SECONDS);
      // eslint-disable-next-line no-console
      console.log(`  validate ${(m0.length / 1e6).toFixed(2)}M chars: ${ms.toFixed(0)}ms`);
    }
  }, TEST_TIMEOUT);

  it("geometry-parses a ~10M-char string to the correct rect count", () => {
    const { m0, w, h, groups } = buildDense(1_700_000); // ~10.2M chars
    const start = performance.now();
    const frames = parseM0StringToRenderFrames(m0, w, h);
    const ms = performance.now() - start;
    // one rendered "1" per group
    expect(frames.length).toBe(groups);
    expect(ms).toBeLessThan(60 * SECONDS);
    // eslint-disable-next-line no-console
    console.log(`  renderFrames ${(m0.length / 1e6).toFixed(2)}M chars → ${frames.length} rects in ${ms.toFixed(0)}ms`);
  }, TEST_TIMEOUT);

  it("renderOnly complete-parse handles a large graph with real keys, cheaply", () => {
    // 500K groups ≈ 3M chars / 1.5M nodes — well within heap because renderOnly
    // materializes only the ~500K rendered frames, not all 1.5M nodes.
    const { m0, w, h, groups } = buildDense(500_000);
    const ro = parseM0StringComplete(m0, w, h, { materialize: "renderOnly" });
    expect(ro.ok).toBe(true);
    if (!ro.ok) return;
    expect(ro.ir.renderFrames.length).toBe(groups);
    expect(ro.ir.editorFrames.length).toBe(groups); // only rendered frames materialized
    // real keys, unique
    const keys = new Set(ro.ir.editorFrames.map((f) => f.meta.stableKey));
    expect(keys.size).toBe(groups);
  }, TEST_TIMEOUT);

  it("full materialization is correct at a safe size below the OOM ceiling", () => {
    // 200K groups ≈ 1.2M chars / 600K nodes — full path ~2.3s, comfortably
    // under the ~5M-node OOM ceiling. Above this, prefer renderOnly/geometry.
    const { m0, w, h, groups } = buildDense(200_000);
    const full = parseM0StringComplete(m0, w, h);
    expect(full.ok).toBe(true);
    if (!full.ok) return;
    expect(full.ir.renderFrames.length).toBe(groups);
    // full graph: groups*3 tokens + root
    expect(full.ir.editorFrames.length).toBe(groups * 3 + 1);
  }, TEST_TIMEOUT);
});
