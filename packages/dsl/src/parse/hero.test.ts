// src/format/normalizeOverlayChains.hero.e2e.test.ts
import { parseM0StringComplete, toCanonicalM0String } from "@m0saic/dsl";
import { parseM0StringTestRunner } from "./m0StringParser";

type Span = { start: number; end: number };
type Rect = { x: number; y: number; width: number; height: number };

// ─────────────────────────────────────────────────────────────
// Harness helpers (strict)
// ─────────────────────────────────────────────────────────────

function expectContiguous0toNMinus1(nums: number[], label: string) {
  const sorted = [...nums].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    expect(sorted[i]).toBe(i);
  }
  // additionally ensure no duplicates
  expect(new Set(nums).size).toBe(nums.length);
}

function bySourceIndex(parsed: ReturnType<typeof parseM0StringComplete> & { ok: true }) {
  return parsed.ir.renderFrames.slice().sort((a, b) => a.logicalIndex - b.logicalIndex);
}

function byPaintOrder(parsed: ReturnType<typeof parseM0StringComplete> & { ok: true }) {
  return parsed.ir.renderFrames.slice().sort((a, b) => a.paintOrder - b.paintOrder);
}

function spanAt(
  framesByLogical: Array<{ meta: { span: Span | null } }>,
  i: number,
): Span | null {
  return framesByLogical[i]?.meta.span ?? null;
}

function expectRectExact(actual: Rect, expected: Rect, label: string) {
    try {
      expect(actual).toEqual(expected);
    } catch (e) {
      throw new Error(`${label} mismatch:\nexpected=${JSON.stringify(expected)}\nreceived=${JSON.stringify(actual)}`);
    }
  }

function expectAllRenderFramesHaveNonNullSpan(framesByLogical: Array<{ meta: { span: Span | null } }>) {
  for (let i = 0; i < framesByLogical.length; i++) {
    const sp = framesByLogical[i]?.meta.span ?? null;
    expect(sp).not.toBeNull();
    if (sp) {
      expect(Number.isInteger(sp.start)).toBe(true);
      expect(Number.isInteger(sp.end)).toBe(true);
      expect(sp.start).toBeGreaterThanOrEqual(0);
      expect(sp.end).toBeGreaterThan(sp.start);
    }
  }
}

/**
 * EditorFrames invariants:
 * - Parent/child overlayDepth must be either same depth (structural) OR +1 (overlay root attached to parent).
 * - Never decreases
 * - Never jumps by > 1
 *
 * This will catch “<=” masking bugs immediately.
 */
function expectOverlayDepthAdjacencyInvariant(editorFrames: any[]) {
  const byKey = new Map<string, any>();
  for (const f of editorFrames) byKey.set(f.meta.stableKey, f);

  const childrenByParent = new Map<string, string[]>();
  for (const f of editorFrames) {
    const psk = f.meta.parentStableKey;
    if (psk == null) continue;
    const arr = childrenByParent.get(psk) ?? [];
    arr.push(f.meta.stableKey);
    childrenByParent.set(psk, arr);
  }

  for (const [psk, childKeys] of childrenByParent) {
    const p = byKey.get(psk);
    expect(p).toBeTruthy();
    for (const ck of childKeys) {
      const c = byKey.get(ck);
      expect(c).toBeTruthy();

      const pd = p.overlayDepth ?? p.overlay?.overlayDepth ?? 0;
      const cd = c.overlayDepth ?? c.overlay?.overlayDepth ?? 0;

      // Strict adjacency rule
      const ok = cd === pd || cd === pd + 1;
      if (!ok) {
        throw new Error(
          `overlayDepth invariant violated: parent key=${psk} depth=${pd} -> child key=${ck} depth=${cd} (expected same depth or +1)`,
        );
      }
    }
  }
}

function expectPaintOrderMatchesEngineStackOrder(hero: string, W: number, H: number) {
  // Engine runner PAINT gives stackOrder (1-based in your test runner)
  const paint = parseM0StringTestRunner(hero, W, H, "PAINT");
  const byLogical = new Map(paint.map((fr) => [fr.logicalOrder, fr.stackOrder]));

  // Public parse gives paintOrder (0-based)
  const parsed = parseM0StringComplete(toCanonicalM0String(hero), W, H, );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;

  for (const rf of parsed.ir.renderFrames) {
    const stack = byLogical.get(rf.logicalIndex);
    expect(stack).toBeTruthy();
    // stackOrder is 1..N, paintOrder is 0..N-1
    expect(stack).toBe(rf.paintOrder + 1);
  }
}

// ─────────────────────────────────────────────────────────────
// HERO e2e tests
// ─────────────────────────────────────────────────────────────

describe("overlay hero e2e", () => {
  test("hero: F{5(F,F,F,F,F){F{F}}} => rects, logical, paint, spans, invariants", () => {
    const W = 1080;
    const H = 720;

    const hero = "F{5(F,F,F,F,F){F{F}}}";

    // ─────────────────────────────────────────────────────────
    // Engine LOGICAL order + rects (strong geometry lock)
    // ─────────────────────────────────────────────────────────
    const logical = parseM0StringTestRunner(hero, W, H, "LOGICAL");
    expect(logical.length).toBe(8);

    // A: root tile (full canvas)
    expect(logical[0]).toMatchObject({
      width: 1080,
      height: 720,
      x: 0,
      y: 0,
      nullRender: false,
      zeroFrame: false,
      logicalOrder: 0,
      overlayDepth: 0,
    });

    // B..F: 5 equal columns inside the root overlay subtree
    const xs = [0, 216, 432, 648, 864]; // 1080/5 = 216
    for (let i = 0; i < 5; i++) {
      const fr = logical[1 + i];
      expect(fr).toMatchObject({
        width: 216,
        height: 720,
        x: xs[i],
        y: 0,
        nullRender: false,
        zeroFrame: false,
        logicalOrder: 1 + i,
        overlayDepth: 1,
      });
    }

    // G: overlay tile attached to the group node inside the root overlay body
    expect(logical[6]).toMatchObject({
      width: 1080,
      height: 720,
      x: 0,
      y: 0,
      nullRender: false,
      zeroFrame: false,
      logicalOrder: 6,
      overlayDepth: 2,
    });

    // H: nested overlay tile on G
    expect(logical[7]).toMatchObject({
      width: 1080,
      height: 720,
      x: 0,
      y: 0,
      nullRender: false,
      zeroFrame: false,
      logicalOrder: 7,
      overlayDepth: 3,
    });

    // ─────────────────────────────────────────────────────────
    // Engine PAINT order (stacking lock)
    // ─────────────────────────────────────────────────────────
    const paint = parseM0StringTestRunner(hero, W, H, "PAINT");
    expect(paint.length).toBe(8);

    // Expect: A, then B..F, then G, then H (top)
    const byL = new Map(paint.map((fr) => [fr.logicalOrder, fr]));
    const A = byL.get(0)!;
    const B = byL.get(1)!;
    const C = byL.get(2)!;
    const D = byL.get(3)!;
    const E = byL.get(4)!;
    const F = byL.get(5)!;
    const G = byL.get(6)!;
    const Hh = byL.get(7)!;

    expect(A.stackOrder).toBeLessThan(B.stackOrder);
    expect(B.stackOrder).toBeLessThan(C.stackOrder);
    expect(C.stackOrder).toBeLessThan(D.stackOrder);
    expect(D.stackOrder).toBeLessThan(E.stackOrder);
    expect(E.stackOrder).toBeLessThan(F.stackOrder);
    expect(F.stackOrder).toBeLessThan(G.stackOrder);
    expect(G.stackOrder).toBeLessThan(Hh.stackOrder);

    // ─────────────────────────────────────────────────────────
    // Public parse: spans + contiguity invariants + editor invariants
    // ─────────────────────────────────────────────────────────
    const canonical = toCanonicalM0String(hero);
    expect(canonical).toBe("1{5(1,1,1,1,1){1{1}}}");

    const parsed = parseM0StringComplete(canonical, W, H, { trace: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    // Contiguous invariants
    expectContiguous0toNMinus1(parsed.ir.renderFrames.map((f) => f.logicalIndex), "logicalIndex");
    expectContiguous0toNMinus1(parsed.ir.renderFrames.map((f) => f.paintOrder), "paintOrder");

    const framesByLogical = bySourceIndex(parsed);
    expect(framesByLogical).toHaveLength(8);

    // Every render frame MUST have a span when spans is on
    expectAllRenderFramesHaveNonNullSpan(framesByLogical);

    // Exact span indices into: "1{5(1,1,1,1,1){1{1}}}"
    // 0:'1'
    // 1:'{'
    // 2:'5'
    // 3:'('
    // 4:'1'
    // 5:','
    // 6:'1'
    // 7:','
    // 8:'1'
    // 9:','
    // 10:'1'
    // 11:','
    // 12:'1'
    // 13:')'
    // 14:'{'
    // 15:'1'
    // 16:'{'
    // 17:'1'
    // 18:'}'
    // 19:'}'
    // 20:'}'
    expect(spanAt(framesByLogical, 0)).toEqual({ start: 0, end: 1 });   // A
    expect(spanAt(framesByLogical, 1)).toEqual({ start: 4, end: 5 });   // B
    expect(spanAt(framesByLogical, 2)).toEqual({ start: 6, end: 7 });   // C
    expect(spanAt(framesByLogical, 3)).toEqual({ start: 8, end: 9 });   // D
    expect(spanAt(framesByLogical, 4)).toEqual({ start: 10, end: 11 }); // E
    expect(spanAt(framesByLogical, 5)).toEqual({ start: 12, end: 13 }); // F
    expect(spanAt(framesByLogical, 6)).toEqual({ start: 15, end: 16 }); // G
    expect(spanAt(framesByLogical, 7)).toEqual({ start: 17, end: 18 }); // H

    // Rect lock from public parse (redundant with engine runner; good as a canary)
    const rfRect = (i: number): Rect => {
      const f = framesByLogical[i];
      return { x: f.x, y: f.y, width: f.width, height: f.height };
    };

    expectRectExact(rfRect(0), { x: 0, y: 0, width: 1080, height: 720 }, "A rect");
    for (let i = 0; i < 5; i++) {
      expectRectExact(
        rfRect(1 + i),
        { x: xs[i], y: 0, width: 216, height: 720 },
        `column rect ${i}`,
      );
    }
    expectRectExact(rfRect(6), { x: 0, y: 0, width: 1080, height: 720 }, "G rect");
    expectRectExact(rfRect(7), { x: 0, y: 0, width: 1080, height: 720 }, "H rect");

    // EditorFrames tree invariants (THIS is where overlayDepth bugs get caught)
    const editorFrames = parsed.ir.editorFrames ?? [];
    expect(editorFrames.length).toBeGreaterThan(0);
    expectOverlayDepthAdjacencyInvariant(editorFrames);

    // Cross-check engine stackOrder ↔ public paintOrder
    expectPaintOrderMatchesEngineStackOrder(hero, W, H);
  });

  test("hero2: 3(0{1},0{1},1) => remainder split, zero-claim, deferred paint, spans", () => {
    const W = 1001; // NOT divisible by 3 => forces remainder policy
    const H = 720;
  
    const hero = "3(0{1},0{1},1)";
  
    // ── LOGICAL order + rects (engine semantics) ───────────────
    const logical = parseM0StringTestRunner(hero, W, H, "LOGICAL");
    expect(logical.length).toBe(3);
  
    // widths = [334,333,334]
    // carry after col0: 334 => first 0 overlay rect = 334x720 at x=0
    // carry after col1: 667 => second 0 overlay rect = 667x720 at x=0
    // claimant col2 absorbs carry + own => full width 1001x720 at x=0
    const O1 = logical[0]; // overlay from first 0{1}
    const O2 = logical[1]; // overlay from second 0{1}
    const A  = logical[2]; // claimant 1
  
    expect(O1).toMatchObject({
      width: 334,
      height: 720,
      x: 0,
      y: 0,
      nullRender: false,
      zeroFrame: false,
      logicalOrder: 0,
      overlayDepth: 1,
    });
  
    expect(O2).toMatchObject({
      width: 667,
      height: 720,
      x: 0,
      y: 0,
      nullRender: false,
      zeroFrame: false,
      logicalOrder: 1,
      overlayDepth: 1,
    });
  
    expect(A).toMatchObject({
      width: 1001,
      height: 720,
      x: 0,
      y: 0,
      nullRender: false,
      zeroFrame: false,
      logicalOrder: 2,
      overlayDepth: 0,
    });
  
    // ── PAINT order (deferred zero overlays) ───────────────────
    const paint = parseM0StringTestRunner(hero, W, H, "PAINT");
    expect(paint.length).toBe(3);
  
    const byL = new Map(paint.map((fr) => [fr.logicalOrder, fr]));
    const O1p = byL.get(0)!;
    const O2p = byL.get(1)!;
    const Ap  = byL.get(2)!;
  
    // Deferred paint: claimant first, then larger merged overlay, then smaller on top.
    // Expected: A < O2 < O1
    expect(Ap.stackOrder).toBeLessThan(O2p.stackOrder);
    expect(O2p.stackOrder).toBeLessThan(O1p.stackOrder);
  
    // ── Spans (public parse, spans) ───────────────────────
    const canonical = toCanonicalM0String(hero);
    expect(canonical).toBe("3(0{1},0{1},1)");
  
    const parsed = parseM0StringComplete(canonical, W, H, );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
  
    const framesByLogical = parsed.ir.renderFrames
      .slice()
      .sort((a, b) => a.logicalIndex - b.logicalIndex);
  
    expect(framesByLogical).toHaveLength(3);
  
    const span = (i: number) => framesByLogical[i].meta.span ?? null;
  
    // indices into: "3(0{1},0{1},1)"
    // 4:'1' (overlay #1), 9:'1' (overlay #2), 12:'1' (claimant)
    expect(span(0)).toEqual({ start: 4, end: 5 });
    expect(span(1)).toEqual({ start: 9, end: 10 });
    expect(span(2)).toEqual({ start: 12, end: 13 });
  });
});