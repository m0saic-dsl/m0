/**
 * HERO fuzz / adversarial E2E tests for m0saic DSL 1.0 lock.
 *
 * Every test asserts EXACT rects, overlayDepth, logical ordering,
 * paint-order inequalities, and span positions where applicable.
 *
 * Categories:
 *   1. Overlay stress
 *   2. Zero-pass stress
 *   3. Deep nesting stress
 *   4. Large / multi-digit counts
 *   5. Mixed null + zero + overlay
 *   6. Span torture (off-by-one)
 *   7. Remainder split stress (prime dimensions)
 *   8. Invalid-string rejection (adversarial near-valid)
 */

import { parseM0StringComplete } from "./m0StringParser";
import { parseM0StringTestRunner } from "./m0StringParser";
import { isValidM0String, validateM0String } from "../validate/m0StringValidator";
import { toCanonicalM0String } from "../format/m0StringFormat";
import type { ParseM0Result } from "../types";
import type { M0ValidationResult } from "../errors";

// ─── Harness ─────────────────────────────────────────────────

// ts-jest doesn't narrow discriminated unions after `if (!r.ok)`, so we
// use Extract + assertion helpers to keep the test code readable.
type ParseOk = Extract<ParseM0Result, { ok: true }>;
type ParseFail = Extract<ParseM0Result, { ok: false }>;
type ValidationFail = Extract<M0ValidationResult, { ok: false }>;

type Rect = { x: number; y: number; width: number; height: number };

function outsideInSizes(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rem = total - base * n;
  const sizes = new Array(n).fill(base);
  const order: number[] = [];
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    order.push(i);
    if (n - 1 - i !== i) order.push(n - 1 - i);
  }
  for (let k = 0; k < rem; k++) sizes[order[k]] += 1;
  return sizes;
}

function prefixStarts(sizes: number[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const s of sizes) { out.push(acc); acc += s; }
  return out;
}

/** Parse and return renderFrames sorted by logicalIndex. */
function logicalFrames(s: string, w: number, h: number) {
  const r = parseM0StringComplete(s, w, h, { trace: true });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error((r as ParseFail).error.message);
  return r.ir.renderFrames.slice().sort((a, b) => a.logicalIndex - b.logicalIndex);
}

/** Parse and return renderFrames sorted by paintOrder. */
function paintFrames(s: string, w: number, h: number) {
  const r = parseM0StringComplete(s, w, h, { trace: true });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error((r as ParseFail).error.message);
  return r.ir.renderFrames.slice().sort((a, b) => a.paintOrder - b.paintOrder);
}

function fullResult(s: string, w: number, h: number) {
  const r = parseM0StringComplete(s, w, h, { trace: true });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error((r as ParseFail).error.message);
  return r;
}

function rect(f: { x: number; y: number; width: number; height: number }): Rect {
  return { x: f.x, y: f.y, width: f.width, height: f.height };
}

/** Assert contiguous 0..N-1 for an array of numbers. */
function expectContiguous(nums: number[], label: string) {
  const sorted = [...nums].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i) throw new Error(`${label}: expected ${i} at position ${i}, got ${sorted[i]}`);
  }
  expect(new Set(nums).size).toBe(nums.length);
}

/** Structural invariant: overlayDepth never jumps > 1 parent→child. */
function checkOverlayDepthInvariant(editorFrames: any[]) {
  const byKey = new Map<string, any>();
  for (const f of editorFrames) byKey.set(f.meta.stableKey, f);
  for (const f of editorFrames) {
    if (f.meta.parentStableKey == null) continue;
    const p = byKey.get(f.meta.parentStableKey);
    if (!p) continue;
    const pd = p.overlayDepth ?? 0;
    const cd = f.overlayDepth ?? 0;
    expect(cd === pd || cd === pd + 1).toBe(true);
  }
}

/** Cross-check engine stackOrder (1-based) matches public paintOrder (0-based). */
function checkEngineVsPublicPaintOrder(s: string, w: number, h: number) {
  const paint = parseM0StringTestRunner(s, w, h, "PAINT");
  const byLogical = new Map(paint.map((fr) => [fr.logicalOrder, fr.stackOrder]));
  const parsed = parseM0StringComplete(toCanonicalM0String(s), w, h, );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  for (const rf of parsed.ir.renderFrames) {
    expect(byLogical.get(rf.logicalIndex)).toBe(rf.paintOrder + 1);
  }
}

// ─────────────────────────────────────────────────────────────
// 1. OVERLAY STRESS
// ─────────────────────────────────────────────────────────────

describe("HERO: overlay stress", () => {
  test("H-OV1: triple nested overlay 1{1{1{1}}}", () => {
    const s = "1{1{1{1}}}";
    const W = 800, H = 600;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(4);

    // All 4 frames cover full canvas
    for (let i = 0; i < 4; i++) {
      expect(rect(lf[i])).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    }

    // Paint order: 0 < 1 < 2 < 3
    const pf = paintFrames(s, W, H);
    for (let i = 1; i < 4; i++) {
      expect(pf[i - 1].paintOrder).toBeLessThan(pf[i].paintOrder);
    }

    // Contiguity
    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
    expectContiguous(lf.map(f => f.paintOrder), "paintOrder");

    checkEngineVsPublicPaintOrder(s, W, H);
  });

  test("H-OV2: group overlay with nested overlay 2(1,1){1{1}}", () => {
    const s = "2(1,1){1{1}}";
    const W = 1000, H = 500;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(4);

    // Base tiles: 500x500 columns
    expect(rect(lf[0])).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(rect(lf[1])).toEqual({ x: 500, y: 0, width: 500, height: 500 });
    // Overlay tiles: full canvas
    expect(rect(lf[2])).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
    expect(rect(lf[3])).toEqual({ x: 0, y: 0, width: 1000, height: 500 });

    // Paint: base children, then group overlay, then nested
    const pf = paintFrames(s, W, H);
    const byS = new Map(pf.map(f => [f.logicalIndex, f.paintOrder]));
    expect(byS.get(0)!).toBeLessThan(byS.get(1)!);
    expect(byS.get(1)!).toBeLessThan(byS.get(2)!);
    expect(byS.get(2)!).toBeLessThan(byS.get(3)!);

    checkEngineVsPublicPaintOrder(s, W, H);
  });

  test("H-OV3: overlay on null produces logical owner: -{1}", () => {
    const s = "2(-{1},1)";
    const W = 1000, H = 500;
    const lf = logicalFrames(s, W, H);
    // Only 2 rendered tiles (overlay inside - and the bare 1)
    expect(lf).toHaveLength(2);

    // The overlay tile inherits the null's rect (500x500)
    expect(rect(lf[0])).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(rect(lf[1])).toEqual({ x: 500, y: 0, width: 500, height: 500 });

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
    checkEngineVsPublicPaintOrder(s, W, H);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. ZERO-PASS STRESS
// ─────────────────────────────────────────────────────────────

describe("HERO: zero-pass stress", () => {
  test("H-ZP1: 4(0,0,0,1) — triple zero run, all donate to last", () => {
    const s = "4(0,0,0,1)";
    const W = 1000, H = 500;
    const lf = logicalFrames(s, W, H);
    // Only 1 rendered tile (the claimant absorbs everything)
    expect(lf).toHaveLength(1);
    expect(rect(lf[0])).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });

  test("H-ZP2: 5(0{1},0{1},0{1},0{1},1) — four zero overlays, all defer", () => {
    const s = "5(0{1},0{1},0{1},0{1},1)";
    const W = 1000, H = 500;

    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(5);

    // Claimant is full width
    expect(rect(lf[4])).toEqual({ x: 0, y: 0, width: 1000, height: 500 });

    // Zero overlay rects grow: 200, 400, 600, 800
    const sizes = outsideInSizes(1000, 5);
    let cumW = 0;
    for (let i = 0; i < 4; i++) {
      cumW += sizes[i];
      expect(lf[i].width).toBe(cumW);
      expect(lf[i].x).toBe(0);
    }

    // Paint order: claimant first, then largest→smallest overlays
    const pf = paintFrames(s, W, H);
    const byS = new Map(pf.map(f => [f.logicalIndex, f.paintOrder]));
    // Claimant (logicalIndex 4) paints first
    expect(byS.get(4)!).toBe(0);
    // Then overlay 3 (largest), overlay 2, overlay 1, overlay 0 (smallest, on top)
    expect(byS.get(3)!).toBeLessThan(byS.get(2)!);
    expect(byS.get(2)!).toBeLessThan(byS.get(1)!);
    expect(byS.get(1)!).toBeLessThan(byS.get(0)!);

    checkEngineVsPublicPaintOrder(s, W, H);
  });

  test("H-ZP3: zero donates to GROUP claimant: 2(0{1},2(1,1))", () => {
    const s = "2(0{1},2(1,1))";
    const W = 1000, H = 500;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(3);

    // The zero overlay covers 500px (its own slot)
    expect(lf[0].width).toBe(500);

    // Group claimant absorbs zero space: its children each get half of 1000
    expect(rect(lf[1])).toEqual({ x: 0, y: 0, width: 500, height: 500 });
    expect(rect(lf[2])).toEqual({ x: 500, y: 0, width: 500, height: 500 });

    // Paint: group children first, then deferred zero overlay
    const pf = paintFrames(s, W, H);
    const byS = new Map(pf.map(f => [f.logicalIndex, f.paintOrder]));
    expect(byS.get(1)!).toBeLessThan(byS.get(0)!);
    expect(byS.get(2)!).toBeLessThan(byS.get(0)!);

    checkEngineVsPublicPaintOrder(s, W, H);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. DEEP NESTING STRESS
// ─────────────────────────────────────────────────────────────

describe("HERO: deep nesting stress", () => {
  test("H-DN1: 5 levels deep alternating () and []", () => {
    // 2(2[2(2[1,1],1),1],1)
    const s = "2(2[2(2[1,1],1),1],1)";
    const W = 1000, H = 1000;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(5);

    // Outermost: 2 cols → 500px each
    // Left col: 2 rows → 500px each
    // Top-left of left col: 2 cols → 250px each
    // Left of that: 2 rows → 250px each
    expect(rect(lf[0])).toEqual({ x: 0, y: 0, width: 250, height: 250 });
    expect(rect(lf[1])).toEqual({ x: 0, y: 250, width: 250, height: 250 });
    expect(rect(lf[2])).toEqual({ x: 250, y: 0, width: 250, height: 500 });
    expect(rect(lf[3])).toEqual({ x: 0, y: 500, width: 500, height: 500 });
    expect(rect(lf[4])).toEqual({ x: 500, y: 0, width: 500, height: 1000 });

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
    checkEngineVsPublicPaintOrder(s, W, H);
  });

  test("H-DN2: deeply nested with overlay at every level", () => {
    // 2(2[1{1},1]{1},1{1})
    const s = "2(2[1{1},1]{1},1{1})";
    const W = 1000, H = 1000;
    const lf = logicalFrames(s, W, H);
    // Rendered: 2 base leaves inside [], their 1 overlay, group overlay, right base, right overlay = 6
    expect(lf).toHaveLength(6);

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
    expectContiguous(lf.map(f => f.paintOrder), "paintOrder");
    checkEngineVsPublicPaintOrder(s, W, H);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. LARGE / MULTI-DIGIT COUNTS
// ─────────────────────────────────────────────────────────────

describe("HERO: large counts", () => {
  test("H-LC1: 10-way split at 1000px", () => {
    const children = Array(10).fill("1").join(",");
    const s = `10(${children})`;
    const W = 1000, H = 500;

    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(10);

    // Each tile should be 100px wide (1000/10 = 100, no remainder)
    for (let i = 0; i < 10; i++) {
      expect(lf[i].width).toBe(100);
      expect(lf[i].x).toBe(i * 100);
    }

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
  });

  test("H-LC2: 10-way split at prime width 997px", () => {
    const children = Array(10).fill("1").join(",");
    const s = `10(${children})`;
    const W = 997, H = 500;

    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(10);

    // 997/10 = 99 base, rem 7
    // outside-in: 0,9,1,8,2,7,3 get +1
    const sizes = outsideInSizes(997, 10);
    const xs = prefixStarts(sizes);

    for (let i = 0; i < 10; i++) {
      expect(lf[i].width).toBe(sizes[i]);
      expect(lf[i].x).toBe(xs[i]);
    }

    // Sum must equal W
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(997);
  });

  test("H-LC3: 20-way split with 3 nulls and a zero", () => {
    // 20 children: 0, -, 1*16, -, 1
    const parts = ["0", "-", ...Array(16).fill("1"), "-", "1"];
    const s = `20(${parts.join(",")})`;
    const W = 2000, H = 100;

    expect(isValidM0String(s)).toBe(true);
    const lf = logicalFrames(s, W, H);
    // rendered = 16 + 1 = 17 tiles (0 donates to '-', '-' doesn't render, last '-' doesn't render)
    expect(lf).toHaveLength(17);

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
  });
});

// ─────────────────────────────────────────────────────────────
// 5. MIXED NULL + ZERO + OVERLAY
// ─────────────────────────────────────────────────────────────

describe("HERO: mixed null/zero/overlay", () => {
  test("H-MX1: 3(-{1},0{1},1) at 999px", () => {
    const s = "3(-{1},0{1},1)";
    const W = 999, H = 600;

    const lf = logicalFrames(s, W, H);
    // Rendered: null overlay tile, zero overlay tile, claimant = 3 tiles
    expect(lf).toHaveLength(3);

    // 999/3 = 333 each
    // null '-' gets 333px, its overlay is 333x600
    expect(lf[0].width).toBe(333);
    // zero '0' starts carry=333, overlay rect = carry so far = 333x600
    expect(lf[1].width).toBe(333);
    // claimant absorbs zero carry (333) + own seg (333) = 666.
    // '-' does NOT carry — only '0' does. So claimant starts at x=333.
    expect(rect(lf[2])).toEqual({ x: 333, y: 0, width: 666, height: 600 });

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
    checkEngineVsPublicPaintOrder(s, W, H);
  });

  test("H-MX2: 4(-,-{1},0{1},1) — null, logical owner, zero, tile", () => {
    const s = "4(-,-{1},0{1},1)";
    const W = 1000, H = 400;
    const lf = logicalFrames(s, W, H);
    // Rendered: logical owner overlay, zero overlay, claimant = 3
    expect(lf).toHaveLength(3);

    expectContiguous(lf.map(f => f.logicalIndex), "logicalIndex");
    checkEngineVsPublicPaintOrder(s, W, H);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. SPAN TORTURE
// ─────────────────────────────────────────────────────────────

describe("HERO: span torture", () => {
  test("H-SP1: 2(1,1) — exact span positions", () => {
    // "2(1,1)" indices: 0:'2', 1:'(', 2:'1', 3:',', 4:'1', 5:')'
    const s = "2(1,1)";
    const lf = logicalFrames(s, 100, 100);
    expect(lf[0].meta.span).toEqual({ start: 2, end: 3 });
    expect(lf[1].meta.span).toEqual({ start: 4, end: 5 });
  });

  test("H-SP2: 2(1{1},1) — overlay child span", () => {
    // "2(1{1},1)" indices:
    // 0:'2', 1:'(', 2:'1', 3:'{', 4:'1', 5:'}', 6:',', 7:'1', 8:')'
    const s = "2(1{1},1)";
    const lf = logicalFrames(s, 100, 100);
    expect(lf).toHaveLength(3);
    expect(lf[0].meta.span).toEqual({ start: 2, end: 3 });  // base '1'
    expect(lf[1].meta.span).toEqual({ start: 4, end: 5 });  // overlay '1'
    expect(lf[2].meta.span).toEqual({ start: 7, end: 8 });  // right '1'
  });

  test("H-SP3: multi-digit count span: 12(1,...,1)", () => {
    const children = Array(12).fill("1").join(",");
    const s = `12(${children})`;
    // "12(" = indices 0,1,2 then first '1' at index 3
    const lf = logicalFrames(s, 1200, 100);
    expect(lf).toHaveLength(12);
    expect(lf[0].meta.span).toEqual({ start: 3, end: 4 });
    // second '1' at index 5 (after comma at 4)
    expect(lf[1].meta.span).toEqual({ start: 5, end: 6 });
  });

  test("H-SP4: every render frame span is non-null ", () => {
    const cases = [
      "1", "2(1,1)", "3(0{1},0{1},1)", "2(1{1{1}},1)",
      "2(-{1},1)", "3(1,0,1)", "2(2[1,1],1){1}",
    ];
    for (const s of cases) {
      const r = parseM0StringComplete(s, 500, 500, );
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const f of r.ir.renderFrames) {
        expect(f.meta.span).not.toBeNull();
        expect(f.meta.span!.start).toBeGreaterThanOrEqual(0);
        expect(f.meta.span!.end).toBeGreaterThan(f.meta.span!.start);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 7. REMAINDER SPLIT STRESS (prime dimensions)
// ─────────────────────────────────────────────────────────────

describe("HERO: remainder split stress", () => {
  test("H-RS1: 7-way split at 1001px — outside-in", () => {
    const s = "7(1,1,1,1,1,1,1)";
    const W = 1001, H = 100;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(7);

    // 1001/7 = 143 base, rem 0 — wait, 143*7=1001. No remainder!
    const sizes = outsideInSizes(1001, 7);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(1001);
    const xs = prefixStarts(sizes);

    for (let i = 0; i < 7; i++) {
      expect(lf[i].width).toBe(sizes[i]);
      expect(lf[i].x).toBe(xs[i]);
    }
  });

  test("H-RS2: 7-way split at 719px — outside-in remainder=5", () => {
    const s = "7(1,1,1,1,1,1,1)";
    const W = 719, H = 100;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(7);

    // 719/7 = 102 base, rem 5
    // outside-in order: 0,6,1,5,2 get +1
    // sizes: [103, 103, 103, 102, 102, 103, 103]
    const sizes = outsideInSizes(719, 7);
    expect(sizes).toEqual([103, 103, 103, 102, 102, 103, 103]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(719);

    const xs = prefixStarts(sizes);
    for (let i = 0; i < 7; i++) {
      expect(lf[i].width).toBe(sizes[i]);
      expect(lf[i].x).toBe(xs[i]);
    }
  });

  test("H-RS3: 3-way vertical split at 997px height", () => {
    const s = "3[1,1,1]";
    const W = 100, H = 997;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(3);

    // 997/3 = 332 base, rem 1
    // outside-in: index 0 gets +1
    const sizes = outsideInSizes(997, 3);
    expect(sizes).toEqual([333, 332, 332]);
    const ys = prefixStarts(sizes);

    for (let i = 0; i < 3; i++) {
      expect(lf[i].height).toBe(sizes[i]);
      expect(lf[i].y).toBe(ys[i]);
    }
  });

  test("H-RS4: nested remainder — 3(5[1,1,1,1,1],1,1) at 997x719", () => {
    const s = "3(5[1,1,1,1,1],1,1)";
    const W = 997, H = 719;
    const lf = logicalFrames(s, W, H);
    expect(lf).toHaveLength(7);

    // Outer cols: 997/3 = 332 base, rem 1 → [333, 332, 332]
    const colSizes = outsideInSizes(997, 3);
    const colXs = prefixStarts(colSizes);

    // Inner rows in col0 (width=333): 719/5 = 143 base, rem 4
    // outside-in: 0,4,1,3 get +1 → [144, 144, 143, 144, 144]
    const rowSizes = outsideInSizes(719, 5);
    const rowYs = prefixStarts(rowSizes);

    for (let i = 0; i < 5; i++) {
      expect(lf[i].width).toBe(colSizes[0]);
      expect(lf[i].height).toBe(rowSizes[i]);
      expect(lf[i].x).toBe(colXs[0]);
      expect(lf[i].y).toBe(rowYs[i]);
    }

    // Col 1 and 2
    expect(rect(lf[5])).toEqual({ x: colXs[1], y: 0, width: colSizes[1], height: 719 });
    expect(rect(lf[6])).toEqual({ x: colXs[2], y: 0, width: colSizes[2], height: 719 });
  });
});

// ─────────────────────────────────────────────────────────────
// 8. INVALID STRING REJECTION (adversarial near-valid)
// ─────────────────────────────────────────────────────────────

describe("HERO: invalid string rejection", () => {
  // overlay chaining
  test.each([
    { s: "1{1}{1}", code: "OVERLAY_CHAIN", desc: "overlay chain }{" },
    { s: "2(1{1}{1},1)", code: "OVERLAY_CHAIN", desc: "overlay chain on child" },
  ])("rejects $desc: $s", ({ s, code }) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result as ValidationFail).error.code).toBe(code);
    }
  });

  // 1( and 1[ forbidden
  test.each([
    { s: "1(1)", desc: "1(" },
    { s: "1[1]", desc: "1[" },
    { s: "2(1(1),1)", desc: "nested 1(" },
    { s: "2(1[1],1)", desc: "nested 1[" },
  ])("rejects $desc: $s", ({ s }) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result as ValidationFail).error.code).toBe("ILLEGAL_ONE_SPLIT");
    }
  });

  // count mismatch
  test.each([
    { s: "2(1,1,1)", desc: "too many children" },
    { s: "3(1,1)", desc: "too few children" },
    { s: "2(1)", desc: "single child for 2-split" },
  ])("rejects $desc: $s", ({ s }) => {
    expect(isValidM0String(s)).toBe(false);
  });

  // trailing passthrough
  test.each([
    "2(1,0)", "3(1,1,0)", "2[1,0]", "2(1,0{1})",
  ])("rejects trailing passthrough: %s", (s) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result as ValidationFail).error.code).toBe("PASSTHROUGH_TO_NOTHING");
    }
  });

  // root-level passthrough
  test.each([
    { s: "0{1}", code: "PASSTHROUGH_TO_NOTHING" },
    { s: "0{2(1,1)}", code: "PASSTHROUGH_TO_NOTHING" },
  ])("rejects root passthrough $s as $code", ({ s, code }) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result as ValidationFail).error.code).toBe(code);
  });

  // empty / degenerate
  test.each([
    { s: "", code: "INVALID_EMPTY" },
    { s: "-", code: "INVALID_EMPTY" },
    { s: "0", code: "INVALID_EMPTY" },
  ])("rejects $s as $code", ({ s, code }) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result as ValidationFail).error.code).toBe(code);
  });

  // no sources
  test.each([
    "2(-,-)", "3(-,-,-)",
  ])("rejects all-null layout: %s", (s) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result as ValidationFail).error.code).toBe("NO_SOURCES");
  });

  // zero-source overlay
  test.each([
    "1{2(-,-)}",
  ])("rejects zero-source overlay: %s", (s) => {
    const result = validateM0String(s);
    expect(result.ok).toBe(false);
    if (!result.ok) expect((result as ValidationFail).error.code).toBe("ZERO_SOURCE_OVERLAY");
  });

  // bad chars
  test.each([
    "2(A,1)", "2(1,!)", "abc",
  ])("rejects bad chars: %s", (s) => {
    expect(isValidM0String(s)).toBe(false);
  });

  // 11( is valid (multi-digit) — NOT 1( + 1
  test("11( is valid multi-digit, not illegal 1(", () => {
    const children = Array(11).fill("1").join(",");
    const s = `11(${children})`;
    expect(isValidM0String(s)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 9. DETERMINISM
// ─────────────────────────────────────────────────────────────

describe("HERO: determinism", () => {
  test("H-DET0: cross-string independence (no shared state leaks)", () => {
    const s1 = "2(1,1)";
    const s2 = "3(0{1},2[1{1},1],1){1}";
    const W = 997, H = 719;

    // Parse s1 then s2, then reverse order — results must be identical
    const r1a = parseM0StringComplete(s1, W, H, );
    const r2a = parseM0StringComplete(s2, W, H, );

    const r2b = parseM0StringComplete(s2, W, H, );
    const r1b = parseM0StringComplete(s1, W, H, );

    expect(r1a.ok).toBe(true);
    expect(r1b.ok).toBe(true);
    expect(r2a.ok).toBe(true);
    expect(r2b.ok).toBe(true);
    if (!r1a.ok || !r1b.ok || !r2a.ok || !r2b.ok) return;

    expect(r1a.ir.renderFrames).toEqual(r1b.ir.renderFrames);
    expect(r2a.ir.renderFrames).toEqual(r2b.ir.renderFrames);

    // Frame counts must be correct for each string
    expect(r1a.ir.renderFrames).toHaveLength(2);
    expect(r2a.ir.renderFrames.length).toBeGreaterThan(2);
  });

  test("H-DET1: 100 identical parses produce identical results", () => {
    const s = "3(0{1},2[1{1},1],1){1}";
    const W = 997, H = 719;

    const baseline = parseM0StringComplete(s, W, H, );
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    for (let i = 0; i < 100; i++) {
      const r = parseM0StringComplete(s, W, H, );
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.ir.renderFrames).toEqual(baseline.ir.renderFrames);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 10. STRUCTURAL INVARIANTS (universal)
// ─────────────────────────────────────────────────────────────

describe("HERO: structural invariants (universal)", () => {
  const HERO_STRINGS = [
    "1",
    "2(1,1)",
    "3(1,1,1)",
    "2(1{1},1)",
    "2(0{1},1)",
    "3(0{1},0{1},1)",
    "1{1{1{1}}}",
    "2(1,1){1{1}}",
    "2(-{1},1)",
    "3(-{1},0{1},1)",
    "2(2[1{1},1]{1},1{1})",
    "2(0{1},2(1,1))",
    "3(0{1},0{3(0{1},0{1},1)},1){2(0{1},1)}",
  ];

  test.each(HERO_STRINGS)("contiguous logicalIndex + paintOrder: %s", (s) => {
    const r = parseM0StringComplete(s, 1080, 720, { trace: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expectContiguous(r.ir.renderFrames.map(f => f.logicalIndex), "logicalIndex");
    expectContiguous(r.ir.renderFrames.map(f => f.paintOrder), "paintOrder");
  });

  test.each(HERO_STRINGS)("overlayDepth adjacency invariant: %s", (s) => {
    const r = parseM0StringComplete(s, 1080, 720, { trace: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    if (r.ir.editorFrames) {
      checkOverlayDepthInvariant(r.ir.editorFrames);
    }
  });

  test.each(HERO_STRINGS)("engine stackOrder matches public paintOrder: %s", (s) => {
    checkEngineVsPublicPaintOrder(s, 1080, 720);
  });

  test.each(HERO_STRINGS)("all rects have positive width and height: %s", (s) => {
    const r = parseM0StringComplete(s, 1080, 720);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const f of r.ir.renderFrames) {
      expect(f.width).toBeGreaterThan(0);
      expect(f.height).toBeGreaterThan(0);
    }
  });

  test.each(HERO_STRINGS)("stableKeys are unique across all renderFrames: %s", (s) => {
    const r = parseM0StringComplete(s, 1080, 720);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const keys = r.ir.renderFrames.map(f => f.meta.stableKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
