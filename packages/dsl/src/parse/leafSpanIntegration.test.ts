import { parseM0StringComplete } from "./m0StringParser";

describe("span integration (parseM0StringComplete)", () => {
  function getSpansByKind(s: string) {
    const result = parseM0StringComplete(s, 1080, 1080, { trace: true });
    if (!result.ok) throw new Error("parse failed");
    const editors = result.ir.editorFrames ?? [];
    return editors.map((f) => ({
      kind: f.kind,
      span: f.meta.span,
      stableKey: f.meta.stableKey,
    }));
  }

  it("assigns spans to leaves of 3(1,0,-)", () => {
    const frames = getSpansByKind("3(1,0,-)");
    const leaves = frames.filter(
      (f) => f.kind === "frame" || f.kind === "passthrough" || f.kind === "null",
    );
    const spans = leaves.map((f) => f.span).filter(Boolean).sort((a, b) => a!.start - b!.start);
    expect(spans).toEqual([
      { start: 2, end: 3 },
      { start: 4, end: 5 },
      { start: 6, end: 7 },
    ]);
  });

  it("assigns spans to nested 2[2(1,1),1]", () => {
    const frames = getSpansByKind("2[2(1,1),1]");
    const leaves = frames.filter((f) => f.kind === "frame");
    const spans = leaves.map((f) => f.span).filter(Boolean).sort((a, b) => a!.start - b!.start);
    expect(spans).toEqual([
      { start: 4, end: 5 },
      { start: 6, end: 7 },
      { start: 9, end: 10 },
    ]);
  });

  it("assigns span to bare tile (1)", () => {
    const frames = getSpansByKind("1");
    // Bare tile is a root kind (not group, since it's top level)
    const rootFrames = frames.filter((f) => f.kind === "root");
    expect(rootFrames.length).toBeGreaterThan(0);
    expect(rootFrames[0].span).toEqual({ start: 0, end: 1 });
  });

  it("groups now have spans (container coverage)", () => {
    const result = parseM0StringComplete("2(2(1,1),1)", 1080, 1080, { trace: true });
    if (!result.ok) throw new Error("parse failed");
    const groups = (result.ir.editorFrames ?? []).filter((f) => f.kind === "group");
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      // With computeNodeSpansByPath, groups get spans covering their full expression
      expect(g.meta.span).not.toBeNull();
    }
  });

  it("root container gets a span covering the full expression", () => {
    const result = parseM0StringComplete("3(1,0,-)", 1080, 1080, { trace: true });
    if (!result.ok) throw new Error("parse failed");
    const roots = (result.ir.editorFrames ?? []).filter((f) => f.kind === "root");
    expect(roots.length).toBeGreaterThan(0);
    expect(roots[0].meta.span).toEqual({ start: 0, end: 8 }); // "3(1,0,-)" is 8 chars
  });

  it("human-readable input (F, >) produces correct spans", () => {
    const frames = getSpansByKind("3(F,>,-)");
    const leaves = frames.filter(
      (f) => f.kind === "frame" || f.kind === "passthrough" || f.kind === "null",
    );
    const spans = leaves.map((f) => f.span).filter(Boolean).sort((a, b) => a!.start - b!.start);
    expect(spans).toEqual([
      { start: 2, end: 3 },
      { start: 4, end: 5 },
      { start: 6, end: 7 },
    ]);
  });

  it("without trace, editorFrames are still present (parseM0StringComplete always builds full graph)", () => {
    const result = parseM0StringComplete("2(1,1)", 1080, 1080);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ir.editorFrames).toBeDefined();
      expect(result.ir.editorFrames!.length).toBeGreaterThan(0);
    }
  });
});
