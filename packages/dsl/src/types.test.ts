/**
 * Type-level smoke tests — verify all public types are importable
 * and structurally sound. If this file compiles, the types are
 * correctly exported.
 */
import type {
  M0Axis,
  M0NodeKind,
  M0Span,
  M0Rect,
  StableKey,
  LogicalFrame,
  M0Feasibility,
  ComplexityMetrics,
  ParseM0Result,
  M0Label,
} from "./types";

describe("types", () => {
  it("M0Axis has exactly two values", () => {
    const axes: M0Axis[] = ["row", "col"];
    expect(axes).toHaveLength(2);
  });

  it("M0NodeKind has exactly five values", () => {
    const kinds: M0NodeKind[] = ["root", "group", "frame", "passthrough", "null"];
    expect(kinds).toHaveLength(5);
  });

  it("M0Span has start and end", () => {
    const span: M0Span = { start: 0, end: 5 };
    expect(span.end).toBeGreaterThan(span.start);
  });

  it("M0Rect has x, y, width, height", () => {
    const rect: M0Rect = { x: 0, y: 0, width: 100, height: 100 };
    expect(rect.width).toBe(100);
  });

  it("LogicalFrame extends M0RectNode with logicalIndex", () => {
    const frame: LogicalFrame = {
      x: 0, y: 0, width: 100, height: 100,
      meta: {
        stableKey: "r/fc0" as StableKey,
        parentStableKey: null,
        structuralDepth: 0,
        kind: "frame",
        span: { start: 0, end: 1 },
      },
      logicalIndex: 0,
    };
    expect(frame.logicalIndex).toBe(0);
  });

  it("ParseM0Result discriminates on ok", () => {
    const success: ParseM0Result = {
      ok: true,
      ir: { width: 100, height: 100, renderFrames: [], editorFrames: [] },
      precision: { maxSplitX: 1, maxSplitY: 1, maxSplitAny: 1 },
      warnings: [],
    };
    expect(success.ok).toBe(true);
    if (success.ok) {
      expect(success.ir.renderFrames).toEqual([]);
    }
  });

  it("ComplexityMetrics has all required fields", () => {
    const m: ComplexityMetrics = {
      frameCount: 1,
      passthroughCount: 0,
      nullCount: 0,
      groupCount: 0,
      nodeCount: 1,
      precisionCost: 1,
      precision: { maxSplitX: 1, maxSplitY: 1, maxSplitAny: 1 },
    };
    expect(m.nodeCount).toBe(1);
  });

  it("M0Feasibility has minWidthPx and minHeightPx", () => {
    const f: M0Feasibility = { minWidthPx: 1, minHeightPx: 1 };
    expect(f.minWidthPx).toBeGreaterThan(0);
  });

  it("M0Label has text and optional color", () => {
    const plain: M0Label = { text: "hello" };
    const colored: M0Label = { text: "hello", color: "#ff0000" };
    expect(plain.text).toBe("hello");
    expect(colored.color).toBe("#ff0000");
  });
});
