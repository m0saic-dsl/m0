import {
  parseM0StringComplete,
  parseM0StringToFullGraph,
} from "./m0StringParser";
import type { EditorFrame } from "../types";

/** Local helper: reproduces old leaf-only filter for test compat. */
function parseLeafFrames(s: string, w: number, h: number): EditorFrame[] {
  return parseM0StringToFullGraph(s, w, h).filter(
    (f) => f.kind !== "group" && !(f.kind === "root" && f.nullFrame)
  );
}

// ─────────────────────────────────────────────────────────────
// B) StableKey invariance under overlays
// ─────────────────────────────────────────────────────────────

describe("stableKey overlay invariance", () => {
  it("base structural stableKeys are identical with and without overlays", () => {
    const base = parseM0StringComplete("2(1,1)", 1000, 500);
    const withOverlay = parseM0StringComplete("2(1{1},1)", 1000, 500);
    expect(base.ok).toBe(true);
    expect(withOverlay.ok).toBe(true);
    if (!base.ok || !withOverlay.ok) return;

    // Both parses produce the same base structural tiles
    const baseKeys = base.ir.renderFrames.map((f) => f.meta.stableKey);
    expect(baseKeys).toEqual(["r/fc0", "r/fc1"]);

    // The overlay parse has 3 logical tiles total (2 base + 1 overlay)
    expect(withOverlay.ir.renderFrames).toHaveLength(3);

    // Structural tiles keep the same keys
    const structKeys = withOverlay.ir.renderFrames
      .filter((f) => !f.meta.stableKey.includes("/ov"))
      .map((f) => f.meta.stableKey);
    expect(structKeys).toEqual(baseKeys);
  });

  it("overlay frames get /ov namespace keys that do not collide with structural keys", () => {
    const r = parseM0StringComplete("2(1{1},1)", 1000, 500, { trace: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const overlayKeys = r.ir.renderFrames
      .filter((f) => f.meta.stableKey.includes("/ov"))
      .map((f) => f.meta.stableKey);

    // Exactly one overlay tile
    expect(overlayKeys).toHaveLength(1);
    // Overlay key is under the structural owner's namespace
    expect(overlayKeys[0]).toMatch(/^r\/fc0\/ov\d+c\d+$/);

    // No collision between structural and overlay keys
    const allKeys = r.ir.renderFrames.map((f) => f.meta.stableKey);
    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);
  });

  it("overlay frames have correct parentStableKey pointing to overlay namespace", () => {
    const r = parseM0StringComplete("2(1{1},1)", 1000, 500, { trace: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const overlayFrame = (r.ir.editorFrames ?? []).find((f) =>
      f.meta.stableKey.includes("/ov"),
    );
    expect(overlayFrame).toBeDefined();
    // The overlay tile's parentStableKey should be the structural owner
    expect(overlayFrame!.meta.parentStableKey).toBe("r/fc0");
  });

  it("meta.structuralDepth remains structural depth for overlay frames", () => {
    const r = parseM0StringComplete("2(1{1},1)", 1000, 500, { trace: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // The overlay tile is at structDepth=1 (same as the base tiles under root)
    const overlayFrame = (r.ir.editorFrames ?? []).find((f) =>
      f.meta.stableKey.includes("/ov"),
    );
    expect(overlayFrame).toBeDefined();
    // structDepth should reflect structural nesting, not overlay depth
    expect(overlayFrame!.meta.structuralDepth).toBe(1);
    // overlay depth is tracked on EditorFrame.overlayDepth
    expect(overlayFrame!.overlayDepth).toBe(1);
  });

  it("stableKeys remain stable for 3-way split with and without group overlay", () => {
    const base = parseM0StringComplete("3(1,1,1)", 900, 300);
    const withOverlay = parseM0StringComplete("3(1,1,1){1}", 900, 300);
    expect(base.ok).toBe(true);
    expect(withOverlay.ok).toBe(true);
    if (!base.ok || !withOverlay.ok) return;

    const baseKeys = base.ir.renderFrames.map((f) => f.meta.stableKey);
    expect(baseKeys).toEqual(["r/fc0", "r/fc1", "r/fc2"]);

    const structKeys = withOverlay.ir.renderFrames
      .filter((f) => !f.meta.stableKey.includes("/ov"))
      .map((f) => f.meta.stableKey);
    expect(structKeys).toEqual(baseKeys);
  });

  it("zero-frame overlay keys use /ov namespace under passthrough", () => {
    const r = parseM0StringComplete("3(0{1},1,1)", 900, 300, { trace: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const overlayFrames = (r.ir.editorFrames ?? []).filter((f) =>
      f.meta.stableKey.includes("/ov"),
    );
    expect(overlayFrames).toHaveLength(1);
    // Under the passthrough node r/pc0
    expect(overlayFrames[0].meta.stableKey).toMatch(/^r\/pc0\/ov\d+c\d+$/);
  });
});

// ─────────────────────────────────────────────────────────────
// C) logicalIndex correctness
// ─────────────────────────────────────────────────────────────

describe("RenderFrame.logicalIndex", () => {
  it("logicalIndex matches paintOrder for simple splits (no overlay reordering)", () => {
    const r = parseM0StringComplete("2(1,1)", 1000, 500);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.ir.renderFrames).toHaveLength(2);
    // For simple splits, logical order == paint order, so logicalIndex == paintOrder
    expect(r.ir.renderFrames[0].paintOrder).toBe(0);
    expect(r.ir.renderFrames[0].logicalIndex).toBe(0);
    expect(r.ir.renderFrames[1].paintOrder).toBe(1);
    expect(r.ir.renderFrames[1].logicalIndex).toBe(1);
  });

  it("logicalIndex differs from paintOrder when overlay reorders paint", () => {
    // 3(0{1},1,1): overlay tile on zero defers after claimant
    // logical order: overlay_tile=0, claimant=1, tile3=2
    // paint order: claimant=0, overlay=1, tile3=2
    const r = parseM0StringComplete("3(0{1},1,1)", 900, 300);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.ir.renderFrames).toHaveLength(3);

    // Paint order 0 → claimant tile (logical index 1)
    expect(r.ir.renderFrames[0].paintOrder).toBe(0);
    expect(r.ir.renderFrames[0].logicalIndex).toBe(1);

    // Paint order 1 → overlay tile (logical index 0)
    expect(r.ir.renderFrames[1].paintOrder).toBe(1);
    expect(r.ir.renderFrames[1].logicalIndex).toBe(0);

    // Paint order 2 → third tile (logical index 2)
    expect(r.ir.renderFrames[2].paintOrder).toBe(2);
    expect(r.ir.renderFrames[2].logicalIndex).toBe(2);
  });

  it("logicalIndex maps correctly to frames[].index", () => {
    const r = parseM0StringComplete("3(0{1},1,1)", 900, 300);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const frames = r.ir.renderFrames
      .slice()
      .sort((a, b) => a.logicalIndex - b.logicalIndex);

    // Each renderFrame.logicalIndex should be a valid index into frames[]
    for (const rf of r.ir.renderFrames) {
      const logicalFrame = frames[rf.logicalIndex];
      expect(logicalFrame).toBeDefined();
      // The logical frame at that index should have the same geometry
      expect(logicalFrame.x).toBe(rf.x);
      expect(logicalFrame.y).toBe(rf.y);
      expect(logicalFrame.width).toBe(rf.width);
      expect(logicalFrame.height).toBe(rf.height);
    }
  });

  it("tile overlay: 1{1} logicalIndex maps to correct logical tiles", () => {
    const r = parseM0StringComplete("1{1}", 100, 100);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const frames = r.ir.renderFrames
      .slice()
      .sort((a, b) => a.logicalIndex - b.logicalIndex);

    expect(frames).toHaveLength(2);
    expect(r.ir.renderFrames).toHaveLength(2);

    // base tile: logical index 0, overlay tile: logical index 1
    // paint order: base first (paint 0), overlay second (paint 1)
    for (const rf of r.ir.renderFrames) {
      const logicalFrame = frames[rf.logicalIndex];
      expect(rf.meta).toBeDefined();
      expect(logicalFrame.meta.stableKey).toBe(rf.meta.stableKey);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// D) parseM0StringToFullGraph
// ─────────────────────────────────────────────────────────────

describe("parseM0StringToFullGraph", () => {
  it("returns the complete structural tree including groups and root", () => {
    // Use a nested split so we get actual group nodes (not just root)
    const full = parseM0StringToFullGraph("2(2(1,1),1)", 1000, 500);
    const filtered = parseLeafFrames("2(2(1,1),1)", 1000, 500);

    // Full includes root + inner group + 3 tiles = more than filtered
    expect(full.length).toBeGreaterThan(filtered.length);

    // Full has group-kind frames from the inner 2(1,1)
    const groupFrames = full.filter((f) => f.kind === "group");
    expect(groupFrames.length).toBeGreaterThan(0);

    // Filtered excludes groups
    const filteredGroups = filtered.filter((f) => f.kind === "group");
    expect(filteredGroups).toEqual([]);
  });

  it("returns empty for invalid input", () => {
    const full = parseM0StringToFullGraph("bad!", 100, 100);
    expect(full).toEqual([]);
  });

  it("returns all nodes for bare tile (1)", () => {
    const full = parseM0StringToFullGraph("1", 100, 100);
    // Bare tile: just the root (which is also the rendered tile)
    expect(full).toHaveLength(1);
    expect(full[0].kind).toBe("root");
  });
});
