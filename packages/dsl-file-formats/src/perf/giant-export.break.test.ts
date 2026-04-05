/**
 * BREAK TEST: Giant export/serialization — payload size ceiling finder
 *
 * ═══════════════════════════════════════════════════════════════
 * WHAT THIS IS TRYING TO BREAK:
 *
 * This test stresses the EXPORT/SERIALIZATION path, not the
 * parser. The deep-chain, deep-overlay, and wide-flat tests
 * already proved the parser scales. This test asks: what happens
 * when you take a very large valid complete parse result and try
 * to serialize it?
 *
 * Specific code paths stressed:
 *   1. JSON.stringify on ParseM0Result (huge ir object)
 *   2. serializeM0cFile with labels for every rendered frame
 *      — stableKey-keyed label map (keys can be long strings)
 *      — JSON.stringify(file, null, 2) pretty-printing
 *   3. serializeM0File with a very long DSL payload string
 *   4. parseM0cFile roundtrip — JSON.parse on a huge JSON string
 *   5. Memory pressure from holding large serialized strings
 *
 * The fixture uses the canonical Mosaic M .m0 file tiled into
 * NxN grids, which produces production-shaped mixed structure
 * (frames + passthroughs + nulls + groups) at scale.
 *
 * This is a different stress vector than wide-flat (which has
 * many frames but trivial structure) because the tiled M has
 * deep stableKey paths, overlay-free mixed node types, and
 * realistic structural diversity.
 * ═══════════════════════════════════════════════════════════════
 *
 * FIXTURE SIZES (from m0saic-m perf suite):
 *   1x1    36K chars     18K nodes      33 frames
 *   2x2   145K chars     72K nodes     132 frames
 *   3x3   326K chars    162K nodes     297 frames
 *   4x4   579K chars    288K nodes     528 frames
 *
 * EXPORT PAYLOADS scale with node count (editorFrames) and
 * label count (renderFrames). At 4x4 with labels on all 528
 * frames, the .m0c JSON is substantial.
 */

import * as fs from "fs";
import * as path from "path";
import { parseM0File, serializeM0File, serializeM0cFile, parseM0cFile } from "../index";
import { validateM0String, parseM0StringComplete, getComplexityMetricsFast } from "@m0saic/dsl";
import type { M0Label } from "@m0saic/dsl";

// ─────────────────────────────────────────────────────────────
// Fixture loading & tiling (reused from perf suite)
// ─────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.resolve(__dirname, "fixture/m0saic-m-33.m0");
const BASE_DSL = parseM0File(fs.readFileSync(FIXTURE_PATH, "utf8")).m0;

function tileNxN(baseDsl: string, n: number): string {
  const row = `${n}(${Array(n).fill(baseDsl).join(",")})`;
  return `${n}[${Array(n).fill(row).join(",")}]`;
}

function canvasSize(n: number): number {
  return Math.max(1920, n * 272);
}

// ─────────────────────────────────────────────────────────────
// Sizes to probe
// ─────────────────────────────────────────────────────────────

const TILES = [
  { label: "1x1", n: 1 },
  { label: "2x2", n: 2 },
  { label: "3x3", n: 3 },
  { label: "4x4", n: 4 },
];

// ─────────────────────────────────────────────────────────────
// Result tracking
// ─────────────────────────────────────────────────────────────

type ExportRow = {
  label: string;
  dslChars: number;
  nodeCount: number;
  frameCount: number;
  parseMs: number;
  m0SerializeMs: number;
  m0Size: number;
  m0cSerializeMs: number;
  m0cSize: number;
  m0cRoundtripMs: number;
  irStringifyMs: number;
  irStringifySize: number;
};

const rows: ExportRow[] = [];

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function ms(v: number): string {
  if (v < 1) return `${v.toFixed(2)}ms`;
  if (v < 1000) return `${v.toFixed(0)}ms`;
  return `${(v / 1000).toFixed(2)}s`;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe("BREAK: giant export/serialization", () => {
  for (const tile of TILES) {
    describe(tile.label, () => {
      const dsl = tile.n === 1 ? BASE_DSL : tileNxN(BASE_DSL, tile.n);
      const c = canvasSize(tile.n);

      it("complete parse + export pipeline", () => {
        // ── Step 1: validate ──
        const valResult = validateM0String(dsl);
        expect(valResult.ok).toBe(true);

        // ── Step 2: complete parse ──
        const parseStart = performance.now();
        const result = parseM0StringComplete(dsl, c, c);
        const parseMs = performance.now() - parseStart;
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const renderFrames = result.ir.renderFrames;
        const complexity = getComplexityMetricsFast(dsl);

        // ── Step 3: serialize .m0 ──
        const m0Start = performance.now();
        const m0Text = serializeM0File({
          m0: dsl,
          size: { width: c, height: c },
        });
        const m0SerializeMs = performance.now() - m0Start;

        expect(m0Text.length).toBeGreaterThan(0);
        expect(m0Text).toContain("# m0");
        expect(m0Text).toContain("# version: 1");

        // ── Step 4: serialize .m0c with labels for every rendered frame ──
        const labels: Record<string, M0Label> = {};
        for (const frame of renderFrames) {
          labels[frame.meta.stableKey] = {
            text: `Label for ${frame.meta.stableKey}`,
            color: "#ff0000",
          };
        }

        const m0cStart = performance.now();
        const m0cText = serializeM0cFile({
          m0: dsl,
          size: { width: c, height: c },
          labels,
        });
        const m0cSerializeMs = performance.now() - m0cStart;

        expect(m0cText.length).toBeGreaterThan(0);

        // ── Step 5: roundtrip .m0c (parse the serialized JSON back) ──
        const m0cRoundtripStart = performance.now();
        const parsed = parseM0cFile(m0cText);
        const m0cRoundtripMs = performance.now() - m0cRoundtripStart;

        expect(parsed.m0).toBe(dsl);
        expect(parsed.format).toBe("m0c");
        expect(parsed.labels).not.toBeNull();
        if (parsed.labels) {
          expect(Object.keys(parsed.labels).length).toBe(renderFrames.length);
        }

        // ── Step 6: JSON.stringify the full IR ──
        const irStart = performance.now();
        const irJson = JSON.stringify(result.ir);
        const irStringifyMs = performance.now() - irStart;

        expect(irJson.length).toBeGreaterThan(0);

        // ── Record results ──
        const row: ExportRow = {
          label: tile.label,
          dslChars: dsl.length,
          nodeCount: complexity.nodeCount,
          frameCount: renderFrames.length,
          parseMs,
          m0SerializeMs,
          m0Size: m0Text.length,
          m0cSerializeMs,
          m0cSize: m0cText.length,
          m0cRoundtripMs,
          irStringifyMs,
          irStringifySize: irJson.length,
        };
        rows.push(row);

        // Generous ceiling — nothing should take more than 60s
        expect(parseMs).toBeLessThan(60_000);
        expect(m0cSerializeMs).toBeLessThan(60_000);
        expect(m0cRoundtripMs).toBeLessThan(60_000);
        expect(irStringifyMs).toBeLessThan(60_000);
      });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────

  afterAll(() => {
    if (rows.length === 0) return;

    console.log("\n  GIANT EXPORT BREAK TEST RESULTS");
    console.log("  " + "─".repeat(56));

    for (const r of rows) {
      console.log(`\n  ${r.label}`);
      console.log(`    input        ${fmt(r.dslChars)} DSL   ${r.nodeCount} nodes   ${r.frameCount} frames`);
      console.log(`    parse        ${ms(r.parseMs)}`);
      console.log(`    .m0  export  ${ms(r.m0SerializeMs).padStart(8)}   payload ${fmt(r.m0Size)}`);
      console.log(`    .m0c export  ${ms(r.m0cSerializeMs).padStart(8)}   payload ${fmt(r.m0cSize)}`);
      console.log(`    .m0c round   ${ms(r.m0cRoundtripMs).padStart(8)}`);
      console.log(`    IR stringify ${ms(r.irStringifyMs).padStart(8)}   payload ${fmt(r.irStringifySize)}`);
    }
    console.log("");
  });
});
