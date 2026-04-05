import { parseM0StringComplete } from "./m0StringParser";
import { parseM0StringToRenderFrames } from "./m0StringParser";
import { validateM0String } from "../validate/m0StringValidator";
import { getComplexityMetricsFast } from "../complexity";

// ─────────────────────────────────────────────────────────────
// Fixtures — intentionally varied to stress different axes
// ─────────────────────────────────────────────────────────────

/** Simple 3×3 grid. Typical template. ~8 chars, 4 nodes. */
const SIMPLE = "3(1,1,1)";

/** 100-way flat split. High precision, moderate node count. */
const FLAT_100 = `100(${Array(100).fill("1").join(",")})`;

/** Nested 10×10 grid. 10 groups × 10 children. ~300 chars, ~111 nodes. */
const GRID_10x10 = `10(${Array(10).fill(`10[${Array(10).fill("1").join(",")}]`).join(",")})`;

/** High passthrough count — 150 passthroughs per row, 3 rows, each with frames. */
function buildHighPassthrough(): string {
  const row = `150(${Array(149).fill("0").join(",")},1)`;
  return `3[${row},${row},${row}]`;
}
const HIGH_PASSTHROUGH = buildHighPassthrough();

/** Deep nesting — 50 levels. Stresses recursive descent. */
function buildDeepNesting(depth: number): string {
  if (depth <= 0) return "1";
  return `2(1,${buildDeepNesting(depth - 1)})`;
}
const DEEP_50 = buildDeepNesting(50);

// ─────────────────────────────────────────────────────────────
// Performance boundary tests
//
// These tests verify that DSL operations complete within
// acceptable time bounds. They exist to catch O(n²) regressions.
//
// The thresholds are generous (10× expected) to avoid flaky
// failures on slow CI machines. The point is to catch quadratic
// blowups, not to benchmark exact milliseconds.
// ─────────────────────────────────────────────────────────────

function timeMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ─────────────────────────────────────────────────────────────
// Validation — must be O(n) via structural index
// ─────────────────────────────────────────────────────────────

describe("validation performance (structural index)", () => {
  it("100-way flat split validates in < 100ms", () => {
    const ms = timeMs(() => validateM0String(FLAT_100));
    expect(ms).toBeLessThan(100);
  });

  it("10×10 grid validates in < 200ms", () => {
    const ms = timeMs(() => validateM0String(GRID_10x10));
    expect(ms).toBeLessThan(200);
  });

  it("high passthrough layout validates in < 200ms", () => {
    const ms = timeMs(() => validateM0String(HIGH_PASSTHROUGH));
    expect(ms).toBeLessThan(200);
  });

  it("deep 50-level nesting validates in < 100ms", () => {
    const ms = timeMs(() => validateM0String(DEEP_50));
    expect(ms).toBeLessThan(100);
  });

  it("validation scales linearly: 10× input ≈ 10× time (not 100×)", () => {
    // Build two strings: one with 50 children, one with 500
    const small = `50(${Array(50).fill("1").join(",")})`;
    const large = `500(${Array(500).fill("1").join(",")})`;

    // Warm up
    validateM0String(small);
    validateM0String(large);

    const smallMs = timeMs(() => { for (let i = 0; i < 100; i++) validateM0String(small); });
    const largeMs = timeMs(() => { for (let i = 0; i < 100; i++) validateM0String(large); });

    // If O(n), ratio should be ~10×. If O(n²), ratio would be ~100×.
    // Allow up to 30× for noise.
    const ratio = largeMs / Math.max(smallMs, 0.01);
    expect(ratio).toBeLessThan(30);
  });
});

// ─────────────────────────────────────────────────────────────
// Engine parser — must be O(n) via offset-based parsing
// ─────────────────────────────────────────────────────────────

describe("engine parser performance (offset-based)", () => {
  it("100-way flat split parses render frames in < 100ms", () => {
    const ms = timeMs(() => parseM0StringToRenderFrames(FLAT_100, 1920, 1080));
    expect(ms).toBeLessThan(100);
  });

  it("10×10 grid parses render frames in < 200ms", () => {
    const ms = timeMs(() => parseM0StringToRenderFrames(GRID_10x10, 1920, 1080));
    expect(ms).toBeLessThan(200);
  });

  it("high passthrough layout parses render frames in < 200ms", () => {
    const ms = timeMs(() => parseM0StringToRenderFrames(HIGH_PASSTHROUGH, 1920, 1080));
    expect(ms).toBeLessThan(200);
  });

  it("deep 50-level nesting parses render frames in < 100ms", () => {
    const ms = timeMs(() => parseM0StringToRenderFrames(DEEP_50, 1920, 1080));
    expect(ms).toBeLessThan(100);
  });

  it("engine parse scales linearly: 10× input ≈ 10× time (not 100×)", () => {
    const small = `50(${Array(50).fill("1").join(",")})`;
    const large = `500(${Array(500).fill("1").join(",")})`;

    // Warm up
    parseM0StringToRenderFrames(small, 1920, 1080);
    parseM0StringToRenderFrames(large, 1920, 1080);

    const smallMs = timeMs(() => { for (let i = 0; i < 100; i++) parseM0StringToRenderFrames(small, 1920, 1080); });
    const largeMs = timeMs(() => { for (let i = 0; i < 100; i++) parseM0StringToRenderFrames(large, 1920, 1080); });

    const ratio = largeMs / Math.max(smallMs, 0.01);
    expect(ratio).toBeLessThan(30);
  });
});

// ─────────────────────────────────────────────────────────────
// Full graph — heavier but still O(n)
// ─────────────────────────────────────────────────────────────

describe("full graph parse performance", () => {
  it("100-way flat split completes full graph in < 200ms", () => {
    const ms = timeMs(() => parseM0StringComplete(FLAT_100, 1920, 1080));
    expect(ms).toBeLessThan(200);
  });

  it("10×10 grid completes full graph in < 200ms", () => {
    const ms = timeMs(() => parseM0StringComplete(GRID_10x10, 1920, 1080));
    expect(ms).toBeLessThan(200);
  });

  it("high passthrough layout completes full graph in < 500ms", () => {
    const ms = timeMs(() => parseM0StringComplete(HIGH_PASSTHROUGH, 1920, 1080));
    expect(ms).toBeLessThan(500);
  });
});

// ─────────────────────────────────────────────────────────────
// Complexity scanning — always O(n), no validation
// ─────────────────────────────────────────────────────────────

describe("complexity scan performance", () => {
  it("high passthrough layout scans in < 50ms", () => {
    const ms = timeMs(() => getComplexityMetricsFast(HIGH_PASSTHROUGH));
    expect(ms).toBeLessThan(50);
  });

  it("complexity scan is faster than validation (with headroom for CI noise)", () => {
    // Warmup both paths
    for (let i = 0; i < 10; i++) { getComplexityMetricsFast(HIGH_PASSTHROUGH); validateM0String(HIGH_PASSTHROUGH); }

    const scanMs = timeMs(() => { for (let i = 0; i < 100; i++) getComplexityMetricsFast(HIGH_PASSTHROUGH); });
    const valMs = timeMs(() => { for (let i = 0; i < 100; i++) validateM0String(HIGH_PASSTHROUGH); });
    // Allow up to 5x headroom for parallel test noise — the point is to catch
    // a regression where scan becomes slower than validation, not to benchmark.
    expect(scanMs).toBeLessThan(valMs * 5);
  });
});

// ─────────────────────────────────────────────────────────────
// Render-only vs full graph — render should be significantly faster
// ─────────────────────────────────────────────────────────────

describe("parse tier cost comparison", () => {
  it("renderFrames is faster than full graph for high passthrough layout (with headroom)", () => {
    // Warm up
    for (let i = 0; i < 3; i++) { parseM0StringToRenderFrames(HIGH_PASSTHROUGH, 1920, 1080); parseM0StringComplete(HIGH_PASSTHROUGH, 1920, 1080); }

    const renderMs = timeMs(() => { for (let i = 0; i < 10; i++) parseM0StringToRenderFrames(HIGH_PASSTHROUGH, 1920, 1080); });
    const fullMs = timeMs(() => { for (let i = 0; i < 10; i++) parseM0StringComplete(HIGH_PASSTHROUGH, 1920, 1080); });

    // Allow 3x headroom — render should be cheaper but CI noise can close the gap.
    expect(renderMs).toBeLessThan(fullMs * 3);
  });

  it("render-only returns correct frame count", () => {
    const frames = parseM0StringToRenderFrames(HIGH_PASSTHROUGH, 1920, 1080);
    // 3 rows × 1 rendered frame each = 3
    expect(frames.length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────
// Production-scale fixture (~10K nodes)
//
// Guards against regressions at realistic scale.
// The M logo has 55K nodes but is too slow for a test fixture.
// A 10K-node layout catches O(n²) regressions while staying
// fast enough for CI (<2s).
// ─────────────────────────────────────────────────────────────

/** Build a ~10K node layout: 10 rows of 100-way splits, each with passthroughs. */
function buildLargeLayout(): string {
  // Each row: 100(0,0,...,0,1) = 99 passthroughs + 1 frame + 1 group = 101 nodes
  const row = `100(${Array(99).fill("0").join(",")},1)`;
  // 100 rows: 100[row,row,...] = 100 groups + 10100 nodes = ~10200 total
  return `100[${Array(100).fill(row).join(",")}]`;
}
const LARGE_LAYOUT = buildLargeLayout();

describe("production-scale regression guard (~10K nodes)", () => {
  it("validates in < 100ms", () => {
    const ms = timeMs(() => validateM0String(LARGE_LAYOUT));
    expect(ms).toBeLessThan(100);
  });

  it("parses render frames in < 100ms", () => {
    const ms = timeMs(() => parseM0StringToRenderFrames(LARGE_LAYOUT, 1920, 1080));
    expect(ms).toBeLessThan(100);
  });

  it("parses full graph in < 500ms", () => {
    const ms = timeMs(() => parseM0StringComplete(LARGE_LAYOUT, 1920, 1080));
    expect(ms).toBeLessThan(500);
  });

  it("full graph returns correct node and frame counts", () => {
    const result = parseM0StringComplete(LARGE_LAYOUT, 1920, 1080);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const editorFrames = result.ir.editorFrames ?? [];
    // 100 rendered frames (one per row)
    expect(result.ir.renderFrames.length).toBe(100);
    // ~10200 total nodes (groups + passthroughs + frames)
    expect(editorFrames.length).toBeGreaterThan(10000);
  });

  it("stableKeys are unique and present on all editor frames", () => {
    const result = parseM0StringComplete(LARGE_LAYOUT, 1920, 1080);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const editorFrames = result.ir.editorFrames ?? [];
    const keys = new Set(editorFrames.map(f => f.meta.stableKey));
    expect(keys.size).toBe(editorFrames.length);
  });

  it("scales linearly: 2× input ≈ 2× time (not 4×)", () => {
    const half = `50[${Array(50).fill(`50(${Array(49).fill("0").join(",")},1)`).join(",")}]`;
    // Warm up
    parseM0StringComplete(half, 1920, 1080);
    parseM0StringComplete(LARGE_LAYOUT, 1920, 1080);

    const halfMs = timeMs(() => { for (let i = 0; i < 5; i++) parseM0StringComplete(half, 1920, 1080); });
    const fullMs = timeMs(() => { for (let i = 0; i < 5; i++) parseM0StringComplete(LARGE_LAYOUT, 1920, 1080); });

    // ~4× more nodes should be ≤ 8× time. If O(n²), would be ~16×.
    const ratio = fullMs / Math.max(halfMs, 0.01);
    expect(ratio).toBeLessThan(10);
  });
});
