/**
 * PERF TEST: materialize "renderOnly" vs "full" — passthrough/null-dense graphs
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT THIS GUARDS:
 *
 * `parseM0StringComplete(..., { materialize: "renderOnly" })` exists so editor
 * surfaces that only care about rendered tiles (the canvas, Compose/Make
 * previews, Layout "Frames Only" mode) don't pay to materialize the full
 * structural graph. On layouts that are *mostly* passthrough (`0`) and null
 * (`-`) — exactly what repeated draw/placeRect edits produce — total node
 * count N greatly exceeds rendered-frame count R, and the "full" path pays:
 *
 *   - computeNodeSpansByPath()  — an extra full string scan
 *   - the all-node editorFrames map (N rich objects)
 *   - computePassthroughOwner() → firstRenderedDescendant() — a DFS PER
 *     passthrough node, the worst offender as passthrough density grows
 *
 * "renderOnly" keeps the unavoidable engine geometry walk + the real-key
 * identity map, but skips the three costs above and materializes only the R
 * rendered frames.
 *
 * This test asserts the DETERMINISTIC win (materialized-node reduction + key
 * identity, which never flake) and adds a GENEROUS timing regression guard
 * (renderOnly must never be meaningfully slower than full — it strictly does
 * less work). It does NOT assert a tight speedup ratio, which would be
 * CI-fragile.
 * ═══════════════════════════════════════════════════════════════
 *
 * GENERATED SHAPE:
 *   N(0,1,-,0,1,-,...)  — one N-way split, repeating groups of
 *   passthrough/rendered/null. Every `0` is immediately followed by a
 *   rendered claimant `1`, and each group ends on a null `-`, so the split is
 *   always well-formed and feasible. ~1/3 of tiles render.
 *   Canvas width = tokens*8px so every base slot stays >= 8px.
 */

import * as fs from "fs";
import * as path from "path";
import { parseM0StringComplete, parseM0StringToRenderFrames } from "../parse/m0StringParser";
import { isValidM0String } from "../validate/m0StringValidator";
import { getComplexityMetricsFast } from "../complexity";

// ─────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────

/** Build a feasible, mostly passthrough/null N-way split from `groups` of "0,1,-". */
function buildDense(groups: number): string {
  const t = new Array<string>(groups * 3);
  for (let i = 0; i < groups; i++) {
    t[i * 3] = "0";
    t[i * 3 + 1] = "1";
    t[i * 3 + 2] = "-";
  }
  return `${t.length}(${t.join(",")})`;
}

const canvasFor = (groups: number) => ({ w: groups * 3 * 8, h: 1080 });

/** Warmup + averaged timing over `iters` runs. */
function timeMs(fn: () => void, iters: number): number {
  for (let i = 0; i < 5; i++) fn(); // warmup
  const start = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - start) / iters;
}

const GROUP_SIZES = [200, 600, 1500];

/** Extract the raw DSL payload from a .m0 file (drops `#` header + blank lines). */
function readM0Payload(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => { const t = l.trim(); return t !== "" && !t.startsWith("#"); })
    .join("");
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("PERF: materialize renderOnly vs full", () => {
  it("generator is feasible and mostly passthrough/null", () => {
    const { w, h } = canvasFor(200);
    const r = parseM0StringComplete(buildDense(200), w, h);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // ~1/3 rendered, so the full editor graph is far larger than the rendered set.
    expect(r.ir.renderFrames.length).toBeLessThan(r.ir.editorFrames.length / 2);
  });

  it("renderOnly materializes only rendered frames (no passthrough/null/group)", () => {
    for (const g of GROUP_SIZES) {
      const { w, h } = canvasFor(g);
      const m0 = buildDense(g);
      const ro = parseM0StringComplete(m0, w, h, { materialize: "renderOnly" });
      const full = parseM0StringComplete(m0, w, h);
      expect(ro.ok && full.ok).toBe(true);
      if (!ro.ok || !full.ok) continue;

      // renderOnly editorFrames == rendered frame count …
      expect(ro.ir.editorFrames.length).toBe(ro.ir.renderFrames.length);
      // … and is strictly smaller than the full graph (the saved materialization).
      expect(ro.ir.editorFrames.length).toBeLessThan(full.ir.editorFrames.length);
      for (const ef of ro.ir.editorFrames) {
        expect(ef.nullFrame).toBe(false);
        expect(ef.passthroughFrame).toBe(false);
      }
    }
  });

  it("rendered-frame stableKeys + geometry are identical to the full path", () => {
    for (const g of GROUP_SIZES) {
      const { w, h } = canvasFor(g);
      const m0 = buildDense(g);
      const full = parseM0StringComplete(m0, w, h);
      const ro = parseM0StringComplete(m0, w, h, { materialize: "renderOnly" });
      expect(full.ok && ro.ok).toBe(true);
      if (!full.ok || !ro.ok) continue;
      const shape = (fr: typeof full.ir.renderFrames[number]) =>
        ({ k: fr.meta.stableKey, x: fr.x, y: fr.y, w: fr.width, h: fr.height, p: fr.paintOrder, l: fr.logicalIndex });
      expect(ro.ir.renderFrames.map(shape)).toEqual(full.ir.renderFrames.map(shape));
    }
  });

  it("renderOnly is not slower than full on dense graphs (regression guard)", () => {
    const g = 1500;
    const { w, h } = canvasFor(g);
    const m0 = buildDense(g);
    const fullMs = timeMs(() => { parseM0StringComplete(m0, w, h); }, 30);
    const roMs = timeMs(() => { parseM0StringComplete(m0, w, h, { materialize: "renderOnly" }); }, 30);
    // renderOnly strictly does less work; allow generous headroom for CI noise.
    expect(roMs).toBeLessThanOrEqual(fullMs * 1.5);
  });
});

// ─────────────────────────────────────────────────────────────
// Real-world fixture: a hand-built 1080p background pattern.
// ~1.07M chars / ~532K structural nodes, but only 226 rendered tiles —
// the canonical case for renderOnly. (Source: a real sandbox session,
// re-serialized to .m0 via dsl-file-formats; loaded raw here to keep the
// dsl perf suite free of file-format deps.)
// ─────────────────────────────────────────────────────────────

describe("PERF: real-world fixture — 1M-char bg pattern (226 rendered)", () => {
  const REAL = readM0Payload(path.resolve(__dirname, "fixture/bg-pattern-1m.m0"));
  const W = 1920, H = 1080; // from the fixture header (# size: 1920x1080)
  const RENDERED = 226;

  it("is a real, feasible 1080p layout: ~1M chars, mostly passthrough/null", () => {
    expect(REAL.length).toBeGreaterThan(1_000_000);
    expect(isValidM0String(REAL)).toBe(true);
    expect(parseM0StringToRenderFrames(REAL, W, H).length).toBe(RENDERED);
  });

  it("complexity metrics match the sidecar", () => {
    const sidecar = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "fixture/bg-pattern-1m.complexity.json"), "utf8"),
    );
    expect(REAL.length).toBe(sidecar.dslLength);
    const m = getComplexityMetricsFast(REAL);
    expect(m.frameCount).toBe(sidecar.complexity.frameCount);
    expect(m.passthroughCount).toBe(sidecar.complexity.passthroughCount);
    expect(m.nullCount).toBe(sidecar.complexity.nullCount);
    expect(m.groupCount).toBe(sidecar.complexity.groupCount);
    expect(m.nodeCount).toBe(sidecar.complexity.nodeCount);
  });

  it("renderOnly collapses ~532K materialized nodes to the 226 rendered frames, keys identical", () => {
    const full = parseM0StringComplete(REAL, W, H);
    const ro = parseM0StringComplete(REAL, W, H, { materialize: "renderOnly" });
    expect(full.ok && ro.ok).toBe(true);
    if (!full.ok || !ro.ok) return;
    expect(full.ir.editorFrames.length).toBeGreaterThan(500_000);
    expect(ro.ir.editorFrames.length).toBe(RENDERED);
    expect(ro.ir.renderFrames.map((f) => f.meta.stableKey))
      .toEqual(full.ir.renderFrames.map((f) => f.meta.stableKey));
  }, 120_000);

  it("renderOnly is not slower than full on the real fixture", () => {
    // single warmup + single timed run each (full parse is multi-second).
    parseM0StringComplete(REAL, W, H);
    let a = performance.now();
    parseM0StringComplete(REAL, W, H);
    const fullMs = performance.now() - a;
    a = performance.now();
    parseM0StringComplete(REAL, W, H, { materialize: "renderOnly" });
    const roMs = performance.now() - a;
    expect(roMs).toBeLessThanOrEqual(fullMs * 1.5);
  }, 120_000);
});
