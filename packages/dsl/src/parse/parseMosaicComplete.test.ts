import {
  parseM0StringComplete,
  parseM0StringToLogicalFrames,
} from "./m0StringParser";

// ─────────────────────────────────────────────────────────────
// parseM0StringComplete
// ─────────────────────────────────────────────────────────────

describe("parseM0StringComplete", () => {
  it("returns frames and renderFrames arrays for a simple split", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ir.renderFrames).toHaveLength(2);
  });

  it("returns error for invalid input", () => {
    const result = parseM0StringComplete("bad!", 100, 100);
    expect(result.ok).toBe(false);
    if (!("error" in result)) return;
    expect(result.error.code).toBe("INVALID_CHAR");
  });

  it("returns empty arrays for infeasible splits", () => {
    const result = parseM0StringComplete("3(1,1,1)", 2, 100);
    expect(result.ok).toBe(false);
    if (!("error" in result)) return;
    expect(result.error.code).toBe("SPLIT_EXCEEDS_AXIS");
  });

  it("frames have correct geometry", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ir.renderFrames[0]).toMatchObject({
      logicalIndex: 0,
      width: 500,
      height: 500,
      x: 0,
      y: 0,
    });
    expect(result.ir.renderFrames[1]).toMatchObject({
      logicalIndex: 1,
      width: 500,
      height: 500,
      x: 500,
      y: 0,
    });
  });

  it("renderFrames have paintOrder and logicalIndex", () => {
    const result = parseM0StringComplete("3[1,1,1]", 100, 300);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (let i = 0; i < result.ir.renderFrames.length; i++) {
      expect(result.ir.renderFrames[i].paintOrder).toBe(i);
      expect(result.ir.renderFrames[i].logicalIndex).toBe(i);
    }
  });

  it("frames have meta with M0NodeIdentity fields", () => {
    const result = parseM0StringComplete("1", 1920, 1080);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ir.renderFrames).toHaveLength(1);
    const meta = result.ir.renderFrames[0].meta;

    expect(meta.stableKey).toBe("r");
    expect(typeof meta.stableKey).toBe("string");
    expect(meta.parentStableKey).toBeNull();
    expect(meta.structuralDepth).toBe(0);
    expect(meta.kind).toBe("root");
  });

  it("stableKey is deterministic for the same input", () => {
    const r1 = parseM0StringComplete("2(1,1)", 1000, 500);
    const r2 = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.ir.renderFrames[0].meta.stableKey).toBe(r2.ir.renderFrames[0].meta.stableKey);
    expect(r1.ir.renderFrames[1].meta.stableKey).toBe(r2.ir.renderFrames[1].meta.stableKey);
  });

  it("stableKey differs between different leaf positions", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ir.renderFrames[0].meta.stableKey).not.toBe(
      result.ir.renderFrames[1].meta.stableKey
    );
  });

  it("handles canonicalization (F and > aliases)", () => {
    const r1 = parseM0StringComplete("2(F,F)", 1000, 500);
    const r2 = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;

    expect(r1.ir.renderFrames.length).toBe(r2.ir.renderFrames.length);
    expect(r1.ir.renderFrames[0].width).toBe(r2.ir.renderFrames[0].width);
  });

  it("filters out zero-frames and null-render frames", () => {
    const result = parseM0StringComplete("3(0,-,1)", 900, 600);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Only the single "1" tile should appear
    expect(result.ir.renderFrames).toHaveLength(1);
  });

  it("reports tightest post-resolution dimensions and stable keys", () => {
    const result = parseM0StringComplete("2(2[1,1],1)", 3, 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.resolutionDiagnostics).toBeDefined();
    expect(result.resolutionDiagnostics).toMatchObject({
      tightestWidthPx: 1,
      tightestHeightPx: 1,
      tightestWidthStableKey: "r/fc1",
      tightestHeightStableKey: "r/growc0/fc1",
    });
  });

  it("exposes backend-ready ir with matching render frames and dimensions", () => {
    const width = 1000;
    const height = 500;
    const result = parseM0StringComplete("2(1,1)", width, height);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ir).toBeDefined();
    expect(result.ir.renderFrames.length).toBeGreaterThan(0);
    expect(result.ir.width).toBe(width);
    expect(result.ir.height).toBe(height);
    expect(result.ir.renderFrames.map((f) => f.paintOrder)).toEqual([0, 1]);
  });
});

// ─────────────────────────────────────────────────────────────
// Traversal (trace mode)
// ─────────────────────────────────────────────────────────────

describe("parseM0StringComplete with trace", () => {
  it("returns traversal when opts.trace is true", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500, {
      trace: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.ir.traversal).toBeDefined();
    expect(result.ir.traversal!.length).toBeGreaterThan(0);
  });

  it("traversal is undefined when opts.trace is false", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500, {
      trace: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.traversal).toBeUndefined();
  });

  it("traversal is undefined when opts is omitted", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.traversal).toBeUndefined();
  });

  it("traversal contains emitLeaf events for rendered tiles", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500, {
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leafEvents = result.ir.traversal!.filter((e) => e.type === "emitLeaf");
    expect(leafEvents.length).toBe(2);
  });

  it("traversal emitLeaf events have leafIndex", () => {
    const result = parseM0StringComplete("3[1,1,1]", 100, 300, {
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leafEvents = result.ir.traversal!.filter((e) => e.type === "emitLeaf");
    const indices = leafEvents.map((e) =>
      e.type === "emitLeaf" ? e.leafIndex : -1
    );
    expect(indices).toContain(0);
    expect(indices).toContain(1);
    expect(indices).toContain(2);
  });

  it("traversal contains enter/exit events for containers", () => {
    const result = parseM0StringComplete("2(1,1)", 1000, 500, {
      trace: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const enters = result.ir.traversal!.filter((e) => e.type === "enter");
    const exits = result.ir.traversal!.filter((e) => e.type === "exit");

    expect(enters.length).toBeGreaterThan(0);
    expect(enters.length).toBe(exits.length);
  });

  it("traversal returns empty array for invalid input with trace", () => {
    const result = parseM0StringComplete("bad!", 100, 100, {
      trace: true,
    });

    expect(result.ok).toBe(false);
    if (!("error" in result)) return;
    expect(result.error.code).toBe("INVALID_CHAR");
  });
});

// ─────────────────────────────────────────────────────────────
// parseM0StringToLogicalFrames
// ─────────────────────────────────────────────────────────────

describe("parseM0StringToLogicalFrames", () => {
  it("returns LogicalFrame array with meta", () => {
    const frames = parseM0StringToLogicalFrames("2(1,1)", 1000, 500);

    expect(frames).toHaveLength(2);
    expect(frames[0].meta).toBeDefined();
    // Children of a root group are tiles
    expect(frames[0].meta.kind).toBe("frame");
    expect(frames[0].meta.stableKey).toBe("r/fc0");
    expect(frames[0].meta.parentStableKey).toBe("r");
  });

  it("returns empty array for invalid input", () => {
    const frames = parseM0StringToLogicalFrames("invalid", 100, 100);
    expect(frames).toEqual([]);
  });
});
