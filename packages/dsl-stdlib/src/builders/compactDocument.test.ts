import { compactDocument } from "./compactDocument";
import { placeRect } from "./placeRect";
import { placeRects } from "./placeRects";
import { addOverlayLayer } from "../transforms/primitives/overlay/addOverlayLayer";
import { queryFrames } from "../queries/queryFrames";
import { getLayerCount } from "../queries/getLayerCount";
import { isValidM0String } from "@m0saic/dsl";

const W = 1000;
const H = 800;

/** Geometry multiset (depth-agnostic) of every rendered leaf. */
function renderedGeometry(m0: string): string[] {
  return queryFrames(m0, { width: W, height: H })
    .render()
    .map((f) => `${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.width)},${Math.round(f.height)}`)
    .sort();
}

/** Compose one placed rect per layer — the realistic editor doc shape. */
function layerPerRect(rects: Array<{ x: number; y: number; w: number; h: number }>): string {
  let m0 = String(
    placeRect({ rootW: W, rootH: H, rectW: rects[0].w, rectH: rects[0].h, x: rects[0].x, y: rects[0].y }).m0,
  );
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i];
    m0 = addOverlayLayer(m0, String(placeRect({ rootW: W, rootH: H, rectW: r.w, rectH: r.h, x: r.x, y: r.y }).m0));
  }
  return m0;
}

describe("compactDocument — pack", () => {
  test("band-compatible rects pack onto one layer (a genuine shrink)", () => {
    // Full-height non-overlapping rects, one per layer — packing them onto a
    // single layer is a clear win (3 layers → 1, fewer chars), so the growth
    // guard keeps the pack.
    const m0 = layerPerRect([
      { x: 0, y: 0, w: 200, h: H },
      { x: 300, y: 0, w: 200, h: H },
      { x: 600, y: 0, w: 200, h: H },
    ]);
    expect(getLayerCount(m0)).toBe(3);

    const res = compactDocument({ m0, width: W, height: H });
    expect(isValidM0String(String(res.m0))).toBe(true);
    expect(res.meta.layersAfter).toBe(1);
    expect(res.meta.frameCount).toBe(3);
    expect(res.meta.dslLengthAfter).toBeLessThan(res.meta.dslLengthBefore);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
    expect(res.liveKeys).toHaveLength(3);
  });

  test("growth guard: pack that would grow the DSL falls back to the input", () => {
    // A compact hand-authored 2-layer doc. Flat repack re-encodes it LONGER, so
    // compactDocument keeps the input untouched rather than ballooning it.
    const m0 = "2(-,1){5(1,0,0,0,-)}";
    const res = compactDocument({ m0, width: W, height: H }); // pack default on
    expect(String(res.m0)).toBe(m0);
    expect(res.meta.dslLengthAfter).toBeLessThanOrEqual(res.meta.dslLengthBefore);
  });

  test("growth guard keeps the simplify-splits win when pack would balloon", () => {
    // The motivating case: a tight nested reducible split. Packing would flatten
    // it into a longer placeRects encoding; with BOTH pack and reduceSplits on,
    // the guard drops the pack but still applies the lossless split reduction —
    // never "skip both".
    const m0 = "10[0,1,0,0,0,0,0,0,0,1]"; // → 5[1,0,0,0,1] losslessly
    const res = compactDocument({ m0, width: W, height: H, pack: true, reduceSplits: true });
    expect(String(res.m0)).toBe("5[1,0,0,0,1]");
    expect(res.meta.reducedSplits).toBeGreaterThan(0);
    expect(res.meta.dslLengthAfter).toBeLessThan(res.meta.dslLengthBefore);
  });

  test("y-subdividing rects stay on separate layers (no fragmentation)", () => {
    // Disjoint, but the small rect's bottom edge falls strictly inside
    // the tall rect's y-range — packing them together would force the
    // band builder to split the tall rect into multiple frames, and
    // per-frame metadata (masks especially) would no longer describe
    // one rect. Identity wins over layer count.
    const m0 = layerPerRect([
      { x: 0, y: 0, w: 200, h: 700 },
      { x: 500, y: 100, w: 200, h: 200 },
    ]);
    const res = compactDocument({ m0, width: W, height: H });
    expect(res.meta.layersAfter).toBe(2);
    expect(res.meta.frameCount).toBe(2);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });

  test("overlapping rects keep separate layers and preserve paint order", () => {
    const a = { x: 0, y: 0, w: 400, h: 400 };
    const b = { x: 200, y: 200, w: 400, h: 400 }; // paints OVER a
    const m0 = layerPerRect([a, b]);
    const res = compactDocument({ m0, width: W, height: H });
    expect(res.meta.layersAfter).toBe(2);
    const frames = queryFrames(String(res.m0), { width: W, height: H })
      .editor()
      .filter((f) => f.kind === "frame" && !f.nullFrame && !f.passthroughFrame);
    const fa = frames.find((f) => Math.round(f.x) === 0)!;
    const fb = frames.find((f) => Math.round(f.x) === 200)!;
    expect(fb.overlayDepth).toBeGreaterThan(fa.overlayDepth);
  });

  test("preserves a TRANSITIVE overlap chain (A·B·C) — no z-inversion", () => {
    // A overlaps B, B overlaps C, but A and C do NOT touch, painted A→B→C.
    // Plain first-fit would sink C onto A's layer (beneath B), inverting the
    // B/C stack. The minLayer constraint keeps C on top.
    const a = { x: 0, y: 0, w: 600, h: 300 };
    const b = { x: 300, y: 200, w: 300, h: 300 }; // over A
    const c = { x: 200, y: 400, w: 300, h: 300 }; // over B, clear of A
    const m0 = layerPerRect([a, b, c]);
    const res = compactDocument({ m0, width: W, height: H });
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
    const frames = queryFrames(String(res.m0), { width: W, height: H })
      .editor()
      .filter((f) => f.kind === "frame" && !f.nullFrame && !f.passthroughFrame);
    const fa = frames.find((f) => Math.round(f.x) === 0)!;
    const fb = frames.find((f) => Math.round(f.x) === 300)!;
    const fc = frames.find((f) => Math.round(f.x) === 200)!;
    expect(fb.overlayDepth).toBeGreaterThan(fa.overlayDepth);
    expect(fc.overlayDepth).toBeGreaterThan(fb.overlayDepth);
  });

  test("reduceSplits shrinks a reducible nested split losslessly, no flattening", () => {
    // Already-tight nested split (weights [2,8]). placeRects-repack would
    // rebuild it; the lossless split-count reduction just GCD-collapses the
    // count in place — strictly smaller, geometry identical.
    const m0 = "10[0,1,0,0,0,0,0,0,0,1]";
    const res = compactDocument({
      m0,
      width: W,
      height: H,
      pack: false,
      removeNullLayers: false,
      reduceSplits: true,
    });
    expect(String(res.m0)).toBe("5[1,0,0,0,1]");
    expect(String(res.m0).length).toBeLessThan(m0.length);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });

  test("reduceSplits composes after pack as a tidy (geometry preserved)", () => {
    const m0 = layerPerRect([
      { x: 0, y: 0, w: 200, h: H },
      { x: 400, y: 0, w: 200, h: H },
    ]);
    const res = compactDocument({ m0, width: W, height: H, pack: true, reduceSplits: true });
    expect(isValidM0String(String(res.m0))).toBe(true);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });

  test("preserveZOrder:false packs the transitive chain tighter (deliberate reorder)", () => {
    // Same A·B·C chain. Ignoring z-order lets C share A's layer (they don't
    // overlap), dropping 3 layers → 2 — at the cost of inverting the B/C stack.
    const a = { x: 0, y: 0, w: 600, h: 300 };
    const b = { x: 300, y: 200, w: 300, h: 300 };
    const c = { x: 200, y: 400, w: 300, h: 300 };
    const m0 = layerPerRect([a, b, c]);

    const preserved = compactDocument({ m0, width: W, height: H });
    const reordered = compactDocument({ m0, width: W, height: H, preserveZOrder: false });

    expect(preserved.meta.layersAfter).toBe(3);
    expect(reordered.meta.layersAfter).toBe(2);
    // Both keep every rect's geometry — only the stacking differs.
    expect(renderedGeometry(String(reordered.m0))).toEqual(renderedGeometry(m0));
  });

  test("rekey maps every changed key and liveKeys covers all leaves", () => {
    const base = "2(-,1)";
    const l1 = String(placeRect({ rootW: W, rootH: H, rectW: 200, rectH: H, x: 0, y: 0 }).m0);
    const m0 = addOverlayLayer(base, l1);
    const oldKeys = queryFrames(m0, { width: W, height: H })
      .editor()
      .filter((f) => f.kind === "frame" && !f.nullFrame && !f.passthroughFrame)
      .map((f) => String(f.meta.stableKey));

    const res = compactDocument({ m0, width: W, height: H });
    for (const pair of res.rekey) {
      expect(oldKeys).toContain(pair.from);
      expect(res.liveKeys).toContain(pair.to);
    }
    expect(res.liveKeys).toHaveLength(oldKeys.length);
  });

  test("pack drops pure-null layers implicitly", () => {
    const m0 = "2(1,1){2(-,-)}";
    const res = compactDocument({ m0, width: W, height: H });
    expect(res.meta.layersBefore).toBe(2);
    expect(res.meta.layersAfter).toBe(1);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });
});

describe("compactDocument — null-layer removal only (pack off)", () => {
  test("drops the null layer and reports rekey pairs for shifted keys", () => {
    const m0 = "2(1,1){2(-,-){2[1,1]}}";
    expect(getLayerCount(m0)).toBe(3);

    const res = compactDocument({ m0, width: W, height: H, pack: false });
    expect(getLayerCount(String(res.m0))).toBe(2);
    expect(res.meta.frameCount).toBe(4);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
    expect(res.rekey.length).toBeGreaterThan(0);
  });

  test("no ops selected returns the identity", () => {
    const m0 = "2(1,1){2(-,-)}";
    const res = compactDocument({
      m0,
      width: W,
      height: H,
      pack: false,
      removeNullLayers: false,
    });
    expect(String(res.m0)).toBe(m0);
    expect(res.rekey).toHaveLength(0);
  });
});

describe("compactDocument — full-canvas tiles (bare-1 root layers)", () => {
  it("handles a full-canvas base under overlay rects (the donut-master shape)", () => {
    // 1{ringRect{holeRect}} — concentric placeRect overlays on a bare-1
    // base. The base (and any repacked single full-canvas layer) parses
    // as kind "root", not "frame" — regression for the invariant throw.
    const ring = String(placeRect({ rootW: W, rootH: H, rectW: 600, rectH: 600 }).m0);
    const hole = String(placeRect({ rootW: W, rootH: H, rectW: 300, rectH: 300 }).m0);
    const m0 = addOverlayLayer(addOverlayLayer("1", ring), hole);

    const plain = compactDocument({ m0, width: W, height: H });
    expect(isValidM0String(String(plain.m0))).toBe(true);
    expect(plain.meta.frameCount).toBe(3);
    expect(plain.liveKeys).toHaveLength(3);
    expect(renderedGeometry(String(plain.m0))).toEqual(renderedGeometry(m0));

    const gcd = compactDocument({ m0, width: W, height: H, gcdDriftPercent: 5 });
    expect(isValidM0String(String(gcd.m0))).toBe(true);
    expect(gcd.liveKeys).toHaveLength(3);
  });
});

describe("compactDocument — GCD reduction", () => {
  test("snap aligns jittered edges, which unlocks packing onto one layer", () => {
    // Three near-grid rects, one per layer (the realistic exploration
    // doc). Raw, their jittered y-edges subdivide each other — packing
    // can't merge them. Snapped to the coarse grid the edges coincide,
    // subdivision disappears, and all three pack onto a single layer.
    const m0 = layerPerRect([
      { x: 2, y: 0, w: 199, h: 398 },
      { x: 402, y: 2, w: 200, h: 400 },
      { x: 798, y: 0, w: 200, h: 401 },
    ]);
    expect(getLayerCount(m0)).toBe(3);

    const res = compactDocument({ m0, width: W, height: H, gcdDriftPercent: 1 });
    expect(res.meta.gcd).not.toBeNull();
    expect(res.meta.gcd!.col).toBeGreaterThanOrEqual(100);
    expect(res.meta.maxDriftPx).toBeLessThanOrEqual(8); // 1% of 800
    expect(res.meta.layersAfter).toBe(1);
    expect(res.meta.dslLengthAfter).toBeLessThan(res.meta.dslLengthBefore);
    expect(isValidM0String(String(res.m0))).toBe(true);
    expect(res.liveKeys).toHaveLength(3);
  });

  test("drift 0 changes no geometry", () => {
    const m0 = layerPerRect([{ x: 3, y: 3, w: 101, h: 103 }]);
    const res = compactDocument({ m0, width: W, height: H });
    expect(res.meta.gcd).toBeNull();
    expect(res.meta.maxDriftPx).toBe(0);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });
});

describe("compactDocument — sourceOrder + drift", () => {
  test("order-preserving path (pack off) returns the identity permutation, zero drift", () => {
    const res = compactDocument({ m0: "2(1,1)", width: W, height: H, pack: false, reduceSplits: true });
    expect(res.sourceOrder).toEqual([0, 1]);
    expect(res.meta.driftTotalPx).toBe(0);
    expect(res.meta.driftMaxPx).toBe(0);
  });

  test("pack returns a valid GATHER permutation that keeps sources bound", () => {
    // Distinct-width full-height rects, one per layer; packing reorders them
    // onto fewer layers, so the permutation is non-trivial.
    const rects = [
      { x: 0, y: 0, w: 200, h: H },
      { x: 300, y: 0, w: 150, h: H },
      { x: 600, y: 0, w: 100, h: H },
    ];
    const res = compactDocument({ m0: layerPerRect(rects), width: W, height: H, pack: true });
    const n = res.meta.frameCount;
    expect(n).toBe(3);
    // Every old index appears exactly once → total permutation, no leaf dropped.
    expect([...res.sourceOrder].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
    // Old sources are aligned to input (= paint) order; migrate them by
    // sourceOrder and confirm the k-th NEW rendered leaf carries that source.
    const oldWidths = rects.map((r) => r.w);
    const migrated = res.sourceOrder.map((oi) => oldWidths[oi]);
    const renderWidths = queryFrames(String(res.m0), { width: W, height: H })
      .render()
      .map((f) => Math.round(f.width));
    expect(renderWidths).toEqual(migrated);
  });

  test("gcd snap accumulates per-rect drift: total >= max > 0, max bounded by budget", () => {
    const m0 = layerPerRect([
      { x: 2, y: 0, w: 199, h: 398 },
      { x: 402, y: 2, w: 200, h: 400 },
      { x: 798, y: 0, w: 200, h: 401 },
    ]);
    const res = compactDocument({ m0, width: W, height: H, gcdDriftPercent: 1 });
    expect(res.meta.driftMaxPx).toBeGreaterThan(0);
    expect(res.meta.driftTotalPx).toBeGreaterThanOrEqual(res.meta.driftMaxPx);
    // Per-rect max can't exceed the per-edge budget meaningfully (1% of 800 = 8,
    // plus ≤1px rounding).
    expect(res.meta.driftMaxPx).toBeLessThanOrEqual(9);
  });

  test("a pure no-op reports zero drift and the identity permutation", () => {
    const res = compactDocument({ m0: "2(1,1)", width: W, height: H, pack: false, removeNullLayers: false });
    expect(res.sourceOrder).toEqual([0, 1]);
    expect(res.meta.driftTotalPx).toBe(0);
  });
});

describe("compactDocument — validation", () => {
  test("throws on bad dimensions", () => {
    expect(() => compactDocument({ m0: "1", width: 0, height: 10 })).toThrow();
    expect(() => compactDocument({ m0: "1", width: 10, height: 1.5 })).toThrow();
  });

  test("throws on invalid m0", () => {
    expect(() => compactDocument({ m0: "2(1)", width: W, height: H })).toThrow();
  });

  test("throws on negative drift", () => {
    expect(() =>
      compactDocument({ m0: "1", width: W, height: H, gcdDriftPercent: -1 }),
    ).toThrow();
  });

  test("deterministic — same input, same output", () => {
    const m0 = addOverlayLayer("2(-,1)", "2[1,-]");
    const a = compactDocument({ m0, width: W, height: H });
    const b = compactDocument({ m0, width: W, height: H });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.rekey).toEqual(b.rekey);
  });
});
