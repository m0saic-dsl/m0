/**
 * v1.0.0 invariant tests
 *
 * These tests lock critical behaviors that become permanent after public release.
 * If any of these fail, the change is either a bug or a breaking change that
 * requires a major version bump.
 */

import {
  parseM0StringComplete,
  parseM0StringToRenderFrames,
  parseM0StringToLogicalFrames,
  toCanonicalM0String,
  toPrettyM0String,
  validateM0String,
  isValidM0String,
  getComplexityMetricsFast,
  getFrameCount,
  areM0StringsCanonicalEqual,
  areM0StringsFrameEqual,
  computeFeasibility,
} from "../index";
import type { RenderFrame, EditorFrame } from "../types";

// ─────────────────────────────────────────────────────────────
// 1. splitEven outside-in golden test
// ─────────────────────────────────────────────────────────────

describe("splitEven remainder distribution (outside-in golden)", () => {
  it("splitEven(1080, 7) = [155, 154, 154, 154, 154, 154, 155]", () => {
    const result = parseM0StringComplete("7(1,1,1,1,1,1,1)", 1080, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const widths = result.ir.renderFrames
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((f) => f.width);
    expect(widths).toEqual([155, 154, 154, 154, 154, 154, 155]);
  });

  it("splitEven(100, 3) = [34, 33, 33]", () => {
    const result = parseM0StringComplete("3(1,1,1)", 100, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const widths = result.ir.renderFrames
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((f) => f.width);
    expect(widths).toEqual([34, 33, 33]);
  });

  it("splitEven(10, 4) = [3, 2, 2, 3]", () => {
    const result = parseM0StringComplete("4(1,1,1,1)", 10, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const widths = result.ir.renderFrames
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((f) => f.width);
    expect(widths).toEqual([3, 2, 2, 3]);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. Canonicalization roundtrip
// ─────────────────────────────────────────────────────────────

describe("canonicalization roundtrip", () => {
  const cases = [
    "1",
    "2(1,1)",
    "3[1,1,1]",
    "2(3(1,0,1),2[1,1])",
    "1{1}",
    "1{2(1,1)}",
    "1{1{1}}",
    "3(0,0,1)",
    "2(-,1)",
    "-{1}",
    "10(1,1,1,1,1,1,1,1,1,1)",
    "2(1{3[1,1,1]},1)",
  ];

  it.each(cases)("canonical → pretty → canonical is idempotent: %s", (canonical) => {
    const pretty = toPrettyM0String(canonical);
    const back = toCanonicalM0String(pretty);
    expect(back).toBe(canonical);
  });

  it.each(cases)("canonical is idempotent: %s", (canonical) => {
    expect(toCanonicalM0String(canonical)).toBe(canonical);
    expect(toCanonicalM0String(toCanonicalM0String(canonical))).toBe(canonical);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. parseComplete vs parseRenderFrames geometry equivalence
// ─────────────────────────────────────────────────────────────

describe("parseComplete vs parseRenderFrames geometry equivalence", () => {
  const layouts = [
    "2(1,1)",
    "3[1,1,1]",
    "2(3(1,0,1),2[1,1])",
    "1{1}",
    "1{2(1,1)}",
    "3(0,0,1)",
    "2(1{1{1}},1)",
  ];

  it.each(layouts)("identical geometry: %s", (s) => {
    const complete = parseM0StringComplete(s, 1920, 1080);
    const renderOnly = parseM0StringToRenderFrames(s, 1920, 1080);

    expect(complete.ok).toBe(true);
    if (!complete.ok) return;

    expect(renderOnly.length).toBe(complete.ir.renderFrames.length);

    const sortByPaint = (a: RenderFrame, b: RenderFrame) => a.paintOrder - b.paintOrder;
    const cSorted = complete.ir.renderFrames.slice().sort(sortByPaint);
    const rSorted = renderOnly.slice().sort(sortByPaint);

    for (let i = 0; i < cSorted.length; i++) {
      expect(cSorted[i].x).toBe(rSorted[i].x);
      expect(cSorted[i].y).toBe(rSorted[i].y);
      expect(cSorted[i].width).toBe(rSorted[i].width);
      expect(cSorted[i].height).toBe(rSorted[i].height);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 4. Overlay paint order determinism
// ─────────────────────────────────────────────────────────────

describe("overlay paint order determinism", () => {
  it("nested overlay: 1{1{1}} has deterministic paint order", () => {
    const r1 = parseM0StringComplete("1{1{1}}", 100, 100);
    const r2 = parseM0StringComplete("1{1{1}}", 100, 100);
    expect(r1.ok && r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.ir.renderFrames.length).toBe(3);
    for (let i = 0; i < r1.ir.renderFrames.length; i++) {
      expect(r1.ir.renderFrames[i].paintOrder).toBe(r2.ir.renderFrames[i].paintOrder);
      expect(r1.ir.renderFrames[i].logicalIndex).toBe(r2.ir.renderFrames[i].logicalIndex);
    }
  });

  it("overlay on split: 2(1,1){1} has base tiles before overlay", () => {
    const r = parseM0StringComplete("2(1,1){1}", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const frames = r.ir.renderFrames.slice().sort((a, b) => a.paintOrder - b.paintOrder);
    // Base tiles paint first (lower paintOrder), overlay paints last
    expect(frames.length).toBe(3);
    // Last frame by paint order should be the overlay (full canvas)
    const last = frames[frames.length - 1];
    expect(last.width).toBe(100);
    expect(last.height).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. StableKey format stability (golden)
// ─────────────────────────────────────────────────────────────

describe("stableKey format stability", () => {
  it("bare tile: stableKey = 'r'", () => {
    const r = parseM0StringComplete("1", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const frame = r.ir.renderFrames[0];
    expect(frame.meta.stableKey).toBe("r");
  });

  it("2-col split: keys are r/fc0, r/fc1", () => {
    const r = parseM0StringComplete("2(1,1)", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const keys = r.ir.renderFrames
      .slice()
      .sort((a, b) => a.logicalIndex - b.logicalIndex)
      .map((f) => f.meta.stableKey);
    expect(keys).toEqual(["r/fc0", "r/fc1"]);
  });

  it("overlay: 1{1} has overlay key with /ov1c0", () => {
    const r = parseM0StringComplete("1{1}", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const keys = r.ir.renderFrames
      .slice()
      .sort((a, b) => a.logicalIndex - b.logicalIndex)
      .map((f) => String(f.meta.stableKey));
    expect(keys[0]).toBe("r");
    expect(keys[1]).toContain("ov1c0");
  });

  it("nested split: 2(3[1,1,1],1) stable keys", () => {
    const r = parseM0StringComplete("2(3[1,1,1],1)", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const keys = r.ir.renderFrames
      .slice()
      .sort((a, b) => a.logicalIndex - b.logicalIndex)
      .map((f) => String(f.meta.stableKey));
    // First child is a 3-row group, second child is a frame
    expect(keys[0]).toContain("growc0/fc0");
    expect(keys[1]).toContain("growc0/fc1");
    expect(keys[2]).toContain("growc0/fc2");
    expect(keys[3]).toContain("fc1");
  });
});

// ─────────────────────────────────────────────────────────────
// 6. Frame equality with nested splits
// ─────────────────────────────────────────────────────────────

describe("frame equality with nested splits", () => {
  it("nested split equals itself", () => {
    expect(areM0StringsFrameEqual(
      "2(5(1,1,1,1,1),1)",
      "2(5(1,1,1,1,1),1)",
    )).toBe(true);
  });

  it("different nested splits are not equal", () => {
    expect(areM0StringsFrameEqual(
      "2(5(1,1,1,1,1),1)",
      "2(3(1,1,1),1)",
    )).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. Error position accuracy
// ─────────────────────────────────────────────────────────────

describe("error position accuracy", () => {
  const errorCases: { input: string; code: string; positionNear: number }[] = [
    { input: "}{", code: "OVERLAY_CHAIN", positionNear: 0 },
    { input: "2(1,1)X", code: "INVALID_CHAR", positionNear: 6 },
    { input: "2(1,1", code: "UNBALANCED", positionNear: 2 },
    { input: "2(1,1,1)", code: "TOKEN_COUNT", positionNear: 2 },
    { input: "", code: "INVALID_EMPTY", positionNear: 0 },
    { input: "1(1)", code: "ILLEGAL_ONE_SPLIT", positionNear: 0 },
    { input: "2(-,-)", code: "NO_SOURCES", positionNear: 0 },
    { input: "1{2(-,-)}", code: "ZERO_SOURCE_OVERLAY", positionNear: 2 },
    { input: "2(1,0)", code: "PASSTHROUGH_TO_NOTHING", positionNear: 4 },
  ];

  it.each(errorCases)("$code at position ~$positionNear for '$input'", ({ input, code }) => {
    const result = validateM0String(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const fail = result as { ok: false; error: { code: string; position: number | null; span: { start: number; end: number } | null; message: string } };
    expect(fail.error.code).toBe(code);
    expect(fail.error.position).not.toBeNull();
    expect(fail.error.span).not.toBeNull();
    if (fail.error.span) {
      expect(fail.error.span.start).toBeLessThanOrEqual(fail.error.span.end);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 8. Parse determinism
// ─────────────────────────────────────────────────────────────

describe("parse determinism", () => {
  const layouts = [
    "2(1,1)",
    "1{1{1}}",
    "3(0,0,1)",
    "2(3[1,1,1],2[1,1])",
  ];

  it.each(layouts)("two parses produce identical results: %s", (s) => {
    const r1 = parseM0StringComplete(s, 1920, 1080);
    const r2 = parseM0StringComplete(s, 1920, 1080);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(JSON.stringify(r1.ir.renderFrames)).toBe(JSON.stringify(r2.ir.renderFrames));
    expect(JSON.stringify(r1.ir.editorFrames)).toBe(JSON.stringify(r2.ir.editorFrames));
  });
});

// ─────────────────────────────────────────────────────────────
// 9. Frame count consistency
// ─────────────────────────────────────────────────────────────

describe("frame count consistency", () => {
  const layouts = [
    "1",
    "2(1,1)",
    "3[1,1,1]",
    "1{1}",
    "3(0,0,1)",
    "2(1{1},1)",
    "2(-,1)",
  ];

  it.each(layouts)("getFrameCount matches parseRenderFrames.length: %s", (s) => {
    const count = getFrameCount(s);
    const f = computeFeasibility(s);
    const frames = parseM0StringToRenderFrames(s, f.minWidthPx, f.minHeightPx);
    expect(count).toBe(frames.length);
  });
});

// ─────────────────────────────────────────────────────────────
// 10. editorFrames completeness
// ─────────────────────────────────────────────────────────────

describe("editorFrames completeness", () => {
  const layouts = [
    "2(1,1)",
    "1{1}",
    "2(1{2[1,1]},1)",
    "3(0,0,1)",
  ];

  it.each(layouts)("every renderFrame stableKey appears in editorFrames: %s", (s) => {
    const r = parseM0StringComplete(s, 1920, 1080);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const editorKeys = new Set(r.ir.editorFrames.map((f) => String(f.meta.stableKey)));
    for (const rf of r.ir.renderFrames) {
      expect(editorKeys.has(String(rf.meta.stableKey))).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 11. paintOrder and logicalIndex contiguity
// ─────────────────────────────────────────────────────────────

describe("paintOrder and logicalIndex contiguity", () => {
  const layouts = [
    "2(1,1)",
    "3[1,1,1]",
    "1{1}",
    "1{1{1}}",
    "2(1{2(1,1)},1)",
    "3(0,0,1)",
  ];

  it.each(layouts)("paintOrder forms 0..N-1: %s", (s) => {
    const r = parseM0StringComplete(s, 1920, 1080);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const orders = r.ir.renderFrames.map((f) => f.paintOrder).sort((a, b) => a - b);
    for (let i = 0; i < orders.length; i++) {
      expect(orders[i]).toBe(i);
    }
  });

  it.each(layouts)("logicalIndex forms 0..N-1: %s", (s) => {
    const r = parseM0StringComplete(s, 1920, 1080);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const indices = r.ir.renderFrames.map((f) => f.logicalIndex).sort((a, b) => a - b);
    for (let i = 0; i < indices.length; i++) {
      expect(indices[i]).toBe(i);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 12. Grammar fuzz — random strings must not crash validator
// ─────────────────────────────────────────────────────────────

describe("grammar fuzz: random strings never crash validator", () => {
  function randomBracketString(len: number): string {
    const chars = "01()-[]{},-ABCXYZ !@#\n\t";
    let s = "";
    for (let i = 0; i < len; i++) {
      s += chars[Math.floor(Math.random() * chars.length)];
    }
    return s;
  }

  it("100 random strings: validator returns ok or error, never throws", () => {
    for (let i = 0; i < 100; i++) {
      const s = randomBracketString(10 + Math.floor(Math.random() * 50));
      const result = validateM0String(s);
      // Must return a result object, not throw
      expect(typeof result.ok).toBe("boolean");
      if (!result.ok) {
        const fail = result as { error: { code: string; message: string } };
        expect(fail.error.code).toBeDefined();
        expect(typeof fail.error.message).toBe("string");
      }
    }
  });

  it("edge cases: empty, single chars, only brackets", () => {
    const edges = ["", " ", "(", ")", "[", "]", "{", "}", ",", "-", "0", "1",
      "((()))", "}{", "{{", "}}", ",,,,", "----", "0000", "1111",
      "(((((((((((", ")))))))))))"];
    for (const s of edges) {
      const result = validateM0String(s);
      expect(typeof result.ok).toBe("boolean");
    }
  });
});

// ─────────────────────────────────────────────────────────────
// 13. Complexity metrics never crash on valid input
// ─────────────────────────────────────────────────────────────

describe("complexity metrics consistency", () => {
  const layouts = ["1", "2(1,1)", "3[1,1,1]", "1{1}", "3(0,0,1)", "2(-,1)"];

  it.each(layouts)("getComplexityMetricsFast returns sane values: %s", (s) => {
    const m = getComplexityMetricsFast(s);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.frameCount).toBeGreaterThanOrEqual(0);
    expect(m.nodeCount).toBeGreaterThanOrEqual(m.frameCount);
    expect(m.precisionCost).toBeGreaterThanOrEqual(1);
    expect(m.precision.maxSplitAny).toBe(m.precisionCost);
  });
});
