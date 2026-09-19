/**
 * Engine-captured spans must be byte-identical to the legacy path-scan
 * (`computeNodeSpansByPath`) for EVERY frame, across a broad corpus.
 *
 * Spans drive the editor's splice anchor (drag-to-frame, rect-edit-by-span,
 * the structural tree's `[start..end]` display, and the overlay-removal check
 * `text[span.end] === "{"`). They are now captured for free during the engine
 * parse instead of via a second full string scan — this test is the guard that
 * the free path produces exactly the same spans the proven scan did.
 */
import {
  __identitySpansForTest,
  parseM0StringComplete,
} from "./m0StringParser";

const W = 8192;
const H = 8192;

// ── Curated corpus — every span-bearing shape ───────────────────────────────
const CURATED: string[] = [
  // bare leaves / roots
  "1",
  "F",
  // flat splits, both axes
  "2(1,1)",
  "3(1,1,1)",
  "2[1,1]",
  "4[F,F,F,F]",
  // multi-digit counts (span start must cover all digits)
  "10(1,1,1,1,1,1,1,1,1,1)",
  "12[1,1,1,1,1,1,1,1,1,1,1,1]",
  // passthrough (0) — donates to a following claimant
  "2(0,1)",
  "3(0,1,1)",
  "4(0,1,0,1)",
  "3(0,0,1)",
  // null (-)
  "3(1,-,1)",
  "2(-,1)",
  "4(1,-,-,1)",
  // nested containers
  "2(2(1,1),1)",
  "2[2(1,1),2(1,1)]",
  "2(2[1,1],2[1,1])",
  "3(1,2(1,1),3(1,1,1))",
  // overlays
  "1{1}",
  "1{1{1}}",
  "1{1{1{1}}}",
  "2(1,1){2(0,1)}",
  "2(1,-){2(0,1)}",
  "1{2(1,1)}",
  "3(1,1,1){3(0,0,1)}",
  "2(1,2(1,1){2(1,1)})",
  // mixed dense
  "4(0,1,-,1)",
  "6(0,1,-,0,1,-)",
  "5(1,0,1,-,1)",
  "2(3(0,1,1),3(1,-,1))",
];

// ── Programmatic generators ─────────────────────────────────────────────────
function wideSplit(n: number): string {
  return `${n}(${Array(n).fill("1").join(",")})`;
}
function grid(n: number): string {
  const row = `${n}(${Array(n).fill("1").join(",")})`;
  return `${n}[${Array(n).fill(row).join(",")}]`;
}
function deepNest(depth: number): string {
  let s = "1";
  for (let i = 0; i < depth; i++) s = `2(1,${s})`;
  return s;
}
function denseGroups(groups: number): { m0: string; w: number; h: number } {
  // N(0,1,-,0,1,-,…) — every passthrough has a following claimant
  const t: string[] = [];
  for (let i = 0; i < groups; i++) t.push("0", "1", "-");
  return { m0: `${t.length}(${t.join(",")})`, w: groups * 3 * 8, h: 1080 };
}

function assertSpansMatch(m0: string, w = W, h = H) {
  const fromFrame = __identitySpansForTest(m0, w, h, "frame");
  const fromPath = __identitySpansForTest(m0, w, h, "path");
  // Both must agree on feasibility (null) too.
  expect(fromFrame === null).toBe(fromPath === null);
  if (!fromFrame || !fromPath) return false;
  expect(fromFrame.size).toBe(fromPath.size);
  for (const [id, span] of fromFrame) {
    expect(fromPath.has(id)).toBe(true);
    expect(span).toEqual(fromPath.get(id)!);
  }
  return true;
}

describe("engine-captured spans === path-scan spans (byte-identical)", () => {
  test.each(CURATED)("curated: %s", (m0) => {
    const ran = assertSpansMatch(m0);
    // Curated cases are all feasible at 8192² — guard against silent skips.
    expect(ran).toBe(true);
  });

  test("wide flat splits", () => {
    for (const n of [5, 12, 50, 200]) {
      expect(assertSpansMatch(wideSplit(n), Math.max(W, n), H)).toBe(true);
    }
  });

  test("uniform grids", () => {
    for (const n of [2, 3, 5, 8, 16]) {
      expect(assertSpansMatch(grid(n))).toBe(true);
    }
  });

  test("deep nesting", () => {
    // 2(1,…) halves one axis per level, so depth ≤ log2(8192) = 13 stays feasible.
    for (const d of [5, 10, 13]) {
      expect(assertSpansMatch(deepNest(d))).toBe(true);
    }
  });

  test("passthrough/null-dense generator", () => {
    for (const groups of [10, 100, 1000]) {
      const { m0, w, h } = denseGroups(groups);
      expect(assertSpansMatch(m0, w, h)).toBe(true);
    }
  });

  test("large dense graph (~30K nodes) stays byte-identical", () => {
    const { m0, w, h } = denseGroups(10_000);
    expect(assertSpansMatch(m0, w, h)).toBe(true);
  }, 60_000);
});

describe("renderOnly prune === full on rendered frames (keys + spans + geometry)", () => {
  // renderOnly prunes the identity walk to rendered-frame ancestor paths. Its
  // rendered frames must be byte-identical to full's — same keys, spans, rects,
  // order — and it must materialize ONLY rendered frames.
  function assertPruneMatchesFull(m0: string, w = W, h = H): boolean {
    const full = parseM0StringComplete(m0, w, h);
    const ro = parseM0StringComplete(m0, w, h, { materialize: "renderOnly" });
    expect(full.ok).toBe(ro.ok);
    if (!full.ok || !ro.ok) return false;
    const shape = (rf: typeof full.ir.renderFrames[number]) => ({
      stableKey: rf.meta.stableKey, span: rf.meta.span,
      x: rf.x, y: rf.y, width: rf.width, height: rf.height,
      paintOrder: rf.paintOrder, logicalIndex: rf.logicalIndex,
    });
    expect(ro.ir.renderFrames.map(shape)).toEqual(full.ir.renderFrames.map(shape));
    // editor frames: renderOnly materializes ONLY rendered frames
    expect(ro.ir.editorFrames.length).toBe(ro.ir.renderFrames.length);
    const roEditByKey = new Map(ro.ir.editorFrames.map((f) => [String(f.meta.stableKey), f.meta.span]));
    for (const ef of full.ir.editorFrames) {
      if (ef.nullFrame || ef.passthroughFrame || ef.kind === "group") continue;
      expect(roEditByKey.get(String(ef.meta.stableKey))).toEqual(ef.meta.span);
    }
    return true;
  }

  test.each(CURATED)("curated: %s", (m0) => {
    expect(assertPruneMatchesFull(m0)).toBe(true);
  });

  test("grids + wide splits + deep nesting + overlays", () => {
    for (const n of [3, 8, 16]) expect(assertPruneMatchesFull(grid(n))).toBe(true);
    for (const n of [12, 200]) expect(assertPruneMatchesFull(wideSplit(n), Math.max(W, n), H)).toBe(true);
    for (const d of [5, 13]) expect(assertPruneMatchesFull(deepNest(d))).toBe(true);
  });

  test("passthrough/null-dense (the prune's target shape)", () => {
    for (const groups of [10, 100, 1000]) {
      const { m0, w, h } = denseGroups(groups);
      expect(assertPruneMatchesFull(m0, w, h)).toBe(true);
    }
  });
});

describe("production parse carries the captured spans", () => {
  test("full path: every materialized frame has the expected own-expression span", () => {
    // 0 at index 0 (span [2,3]), 1 at index 1 (span [4,5]) inside 2(0,1) → root 2(…)
    const r = parseM0StringComplete("2(0,1)", W, H);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const byKeySpan = new Map(
      r.ir.editorFrames.map((f) => [f.kind + ":" + f.logicalIndex, f.meta.span]),
    );
    // root container 2(0,1): [0,6]
    const root = r.ir.editorFrames.find((f) => f.kind === "root");
    expect(root?.meta.span).toEqual({ start: 0, end: 6 });
    // the rendered "1" tile: single char at index 4
    const tile = r.ir.editorFrames.find((f) => f.kind === "frame");
    expect(tile?.meta.span).toEqual({ start: 4, end: 5 });
    // passthrough "0": single char at index 2
    const pass = r.ir.editorFrames.find((f) => f.kind === "passthrough");
    expect(pass?.meta.span).toEqual({ start: 2, end: 3 });
    expect(byKeySpan.size).toBeGreaterThan(0);
  });

  test("container span excludes a trailing overlay (text[span.end] === '{')", () => {
    const m0 = "2(1,1){2(0,1)}";
    const r = parseM0StringComplete(m0, W, H);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const root = r.ir.editorFrames.find((f) => f.kind === "root");
    // 2(1,1) is chars 0..6; the '{' is at index 6 → overlay-removal check holds
    expect(root?.meta.span).toEqual({ start: 0, end: 6 });
    expect(m0[root!.meta.span!.end]).toBe("{");
  });

  test("explicit null slot carries its own single-char span", () => {
    // 3(1,-,1): the '-' is at index 4 → span [4,5]
    const r = parseM0StringComplete("3(1,-,1)", W, H);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nul = r.ir.editorFrames.find((f) => f.kind === "null");
    expect(nul?.meta.span).toEqual({ start: 4, end: 5 });
  });
});
