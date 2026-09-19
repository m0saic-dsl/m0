import { rebuildRects } from "./rebuildRects";
import { placeRect } from "./placeRect";
import { addOverlayLayer } from "../transforms/primitives/overlay/addOverlayLayer";
import { queryFrames } from "../queries/queryFrames";
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

/** Rendered-leaf stableKeys in paint (render-walk) order — matches the durable
 * key basis rebuildRects addresses overrides/order by. */
function leafKeysByPaintOrder(m0: string): string[] {
  const q = queryFrames(m0, { width: W, height: H });
  const keyByLogical = new Map<number, string>();
  for (const f of q.editor()) {
    if (
      (f.kind === "frame" || f.kind === "root") &&
      !f.nullFrame &&
      !f.passthroughFrame &&
      f.logicalIndex != null
    ) {
      keyByLogical.set(f.logicalIndex, String(f.meta.stableKey));
    }
  }
  return q.render().map((f) => keyByLogical.get(f.logicalIndex) ?? String(f.meta.stableKey));
}

/** Rendered leaves as editor frames (for overlayDepth assertions). */
function renderedEditorFrames(m0: string) {
  return queryFrames(m0, { width: W, height: H })
    .editor()
    .filter((f) => (f.kind === "frame" || f.kind === "root") && !f.nullFrame && !f.passthroughFrame);
}

describe("rebuildRects — no overrides (geometry-identical rebuild)", () => {
  test("simple split round-trips exactly, identity sourceOrder", () => {
    const m0 = "2(1,1)";
    const res = rebuildRects({ m0, width: W, height: H });
    expect(isValidM0String(String(res.m0))).toBe(true);
    expect(res.meta.frameCount).toBe(2);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
    expect(res.sourceOrder).toEqual([0, 1]);
    expect(res.liveKeys).toHaveLength(2);
  });

  test("preserves a TRANSITIVE overlap chain (A·B·C) — no z-inversion", () => {
    const a = { x: 0, y: 0, w: 600, h: 300 };
    const b = { x: 300, y: 200, w: 300, h: 300 }; // over A
    const c = { x: 200, y: 400, w: 300, h: 300 }; // over B, clear of A
    const m0 = layerPerRect([a, b, c]);
    const res = rebuildRects({ m0, width: W, height: H });
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
    const frames = renderedEditorFrames(String(res.m0));
    const fa = frames.find((f) => Math.round(f.x) === 0)!;
    const fb = frames.find((f) => Math.round(f.x) === 300)!;
    const fc = frames.find((f) => Math.round(f.x) === 200)!;
    expect(fb.overlayDepth).toBeGreaterThan(fa.overlayDepth);
    expect(fc.overlayDepth).toBeGreaterThan(fb.overlayDepth);
  });

  test("handles a renderable-root 1{…} doc (concentric overlays)", () => {
    const ring = String(placeRect({ rootW: W, rootH: H, rectW: 600, rectH: 600 }).m0);
    const hole = String(placeRect({ rootW: W, rootH: H, rectW: 300, rectH: 300 }).m0);
    const m0 = addOverlayLayer(addOverlayLayer("1", ring), hole);
    const res = rebuildRects({ m0, width: W, height: H });
    expect(isValidM0String(String(res.m0))).toBe(true);
    expect(res.meta.frameCount).toBe(3);
    expect(res.liveKeys).toHaveLength(3);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });

  test("ALWAYS rebuilds (no growth guard) — unlike compactDocument", () => {
    // A tight hand-authored nested m0 that compactDocument keeps verbatim.
    // rebuildRects must regenerate it regardless (the user's edit must apply),
    // while keeping the exact geometry.
    const m0 = "2(-,1){5(1,0,0,0,-)}";
    const res = rebuildRects({ m0, width: W, height: H });
    expect(String(res.m0)).not.toBe(m0);
    expect(res.meta.frameCount).toBe(2);
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));
  });
});

describe("rebuildRects — overrides (resize / move)", () => {
  test("resize a single leaf (others unchanged)", () => {
    const m0 = "2(1,1)"; // [{0,0,500,800},{500,0,500,800}]
    const keys = leafKeysByPaintOrder(m0);
    const res = rebuildRects({
      m0,
      width: W,
      height: H,
      overrides: { [keys[0]]: { x: 0, y: 0, w: 300, h: 800 } },
    });
    expect(renderedGeometry(String(res.m0))).toEqual(["0,0,300,800", "500,0,500,800"]);
    expect(res.meta.frameCount).toBe(2);
  });

  test("move a leaf to a new position", () => {
    const m0 = "2(1,1)";
    const keys = leafKeysByPaintOrder(m0);
    const res = rebuildRects({
      m0,
      width: W,
      height: H,
      overrides: { [keys[1]]: { x: 700, y: 100, w: 200, h: 200 } },
    });
    expect(renderedGeometry(String(res.m0))).toEqual(["0,0,500,800", "700,100,200,200"]);
  });
});

describe("rebuildRects — order (z permutation)", () => {
  test("order flips which overlapping rect paints on top + GATHER keeps sources bound", () => {
    const a = { x: 0, y: 0, w: 400, h: 400 };
    const b = { x: 200, y: 200, w: 500, h: 300 }; // overlaps a
    const m0 = layerPerRect([a, b]); // A base, B top
    const keys = leafKeysByPaintOrder(m0); // [Akey, Bkey]

    const res = rebuildRects({ m0, width: W, height: H, order: [keys[1], keys[0]] }); // B base, A top
    expect(renderedGeometry(String(res.m0))).toEqual(renderedGeometry(m0));

    // A (x=0) now paints ABOVE B (x=200).
    const frames = renderedEditorFrames(String(res.m0));
    const fa = frames.find((f) => Math.round(f.x) === 0)!;
    const fb = frames.find((f) => Math.round(f.x) === 200)!;
    expect(fa.overlayDepth).toBeGreaterThan(fb.overlayDepth);

    // GATHER: base slot (paint order 0) must now carry B's source. Old paint
    // order widths were [A=400, B=500]; after the flip the base leaf is B.
    const oldWidths = [a.w, b.w];
    const migrated = res.sourceOrder.map((oi) => oldWidths[oi]);
    const renderWidths = queryFrames(String(res.m0), { width: W, height: H })
      .render()
      .map((f) => Math.round(f.width));
    expect(renderWidths).toEqual(migrated);
    expect(res.sourceOrder).toEqual([1, 0]);
  });
});

describe("rebuildRects — errors", () => {
  const m0 = "2(1,1)";
  const keys = leafKeysByPaintOrder(m0);

  test("throws on unknown override key", () => {
    expect(() =>
      rebuildRects({ m0, width: W, height: H, overrides: { "nope/9": { x: 0, y: 0, w: 10, h: 10 } } }),
    ).toThrow(/unknown rendered-leaf/);
  });

  test("throws on non-integer override rect", () => {
    expect(() =>
      rebuildRects({ m0, width: W, height: H, overrides: { [keys[0]]: { x: 0, y: 0, w: 10.5, h: 10 } } }),
    ).toThrow(/integer/);
  });

  test("throws on out-of-bounds override rect", () => {
    expect(() =>
      rebuildRects({ m0, width: W, height: H, overrides: { [keys[0]]: { x: 900, y: 0, w: 200, h: 10 } } }),
    ).toThrow(/out of bounds/);
  });

  test("throws on non-permutation order (wrong length)", () => {
    expect(() => rebuildRects({ m0, width: W, height: H, order: [keys[0]] })).toThrow(/permutation/);
  });

  test("throws on order with a repeated key", () => {
    expect(() => rebuildRects({ m0, width: W, height: H, order: [keys[0], keys[0]] })).toThrow(/repeats|permutation/);
  });

  test("throws on order referencing an unknown key", () => {
    expect(() => rebuildRects({ m0, width: W, height: H, order: [keys[0], "nope/9"] })).toThrow(/unknown/);
  });

  test("throws on invalid m0 / bad dims", () => {
    expect(() => rebuildRects({ m0: "2(1)", width: W, height: H })).toThrow();
    expect(() => rebuildRects({ m0, width: 0, height: H })).toThrow(/width/);
    expect(() => rebuildRects({ m0, width: W, height: 1.5 })).toThrow(/height/);
  });
});

describe("rebuildRects — meta + determinism", () => {
  test("meta reports before/after sizes and layer counts", () => {
    const m0 = layerPerRect([
      { x: 0, y: 0, w: 200, h: H },
      { x: 400, y: 0, w: 200, h: H },
    ]);
    const res = rebuildRects({ m0, width: W, height: H });
    expect(res.meta.layersBefore).toBe(2);
    expect(res.meta.layersAfter).toBe(1); // disjoint full-height → one layer
    expect(res.meta.dslLengthBefore).toBe(m0.length);
    expect(res.meta.dslLengthAfter).toBe(String(res.m0).length);
  });

  test("deterministic — same input, same output", () => {
    const m0 = layerPerRect([
      { x: 0, y: 0, w: 400, h: 400 },
      { x: 200, y: 200, w: 400, h: 400 },
    ]);
    const a = rebuildRects({ m0, width: W, height: H });
    const b = rebuildRects({ m0, width: W, height: H });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.rekey).toEqual(b.rekey);
    expect(a.sourceOrder).toEqual(b.sourceOrder);
  });
});
