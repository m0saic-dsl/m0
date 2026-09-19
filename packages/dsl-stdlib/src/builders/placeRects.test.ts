import { parseM0StringToRenderFrames, validateM0String } from "@m0saic/dsl";
import { placeRects } from "./placeRects";

describe("placeRects — single layer (non-overlapping)", () => {
  test("empty rects throws (caller's responsibility to skip the empty case)", () => {
    expect(() => placeRects({ rootW: 100, rootH: 100, rects: [] })).toThrow(/non-empty/);
  });

  test("one rect → 1 layer, 1 frame", () => {
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [{ x: 10, y: 20, w: 30, h: 40 }],
    });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].rectIndices).toEqual([0]);
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 100);
    expect(frames).toHaveLength(1);
    const f = frames[0];
    expect(f.x).toBe(10);
    expect(f.y).toBe(20);
    expect(f.width).toBe(30);
    expect(f.height).toBe(40);
  });

  test("three non-overlapping rects → 1 layer, 3 frames in document order (top-to-bottom, left-to-right)", () => {
    // TL and TR share rows 0..30; BL is rows 70..100.
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 0, y: 0, w: 30, h: 30 }, // TL
        { x: 70, y: 0, w: 30, h: 30 }, // TR
        { x: 0, y: 70, w: 30, h: 30 }, // BL
      ],
    });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].rectIndices).toEqual([0, 1, 2]);
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 100);
    expect(frames).toHaveLength(3);
    // Document order: TL (rendered first in the top band), TR (rendered
    // second in the top band), BL (in the bottom band).
    expect(frames.map((f) => ({ x: f.x, y: f.y, w: f.width, h: f.height }))).toEqual([
      { x: 0, y: 0, w: 30, h: 30 },
      { x: 70, y: 0, w: 30, h: 30 },
      { x: 0, y: 70, w: 30, h: 30 },
    ]);
  });

  test("rects sharing a row band are placed correctly side by side", () => {
    const result = placeRects({
      rootW: 100,
      rootH: 50,
      rects: [
        { x: 0, y: 10, w: 20, h: 30 },
        { x: 40, y: 10, w: 20, h: 30 },
        { x: 80, y: 10, w: 20, h: 30 },
      ],
    });
    expect(result.layers).toHaveLength(1);
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 50);
    expect(frames).toHaveLength(3);
    expect(frames.map((f) => f.x)).toEqual([0, 40, 80]);
  });

  test("rect filling the entire canvas → valid m0 with 1 frame", () => {
    const result = placeRects({
      rootW: 50,
      rootH: 50,
      rects: [{ x: 0, y: 0, w: 50, h: 50 }],
    });
    expect(result.layers).toHaveLength(1);
    const frames = parseM0StringToRenderFrames(String(result.m0), 50, 50);
    expect(frames).toHaveLength(1);
    expect(frames[0].width).toBe(50);
    expect(frames[0].height).toBe(50);
  });
});

describe("placeRects — multi-layer (overlapping)", () => {
  test("two overlapping rects → 2 layers, 1 rect each", () => {
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 0, y: 0, w: 60, h: 60 },
        { x: 30, y: 30, w: 60, h: 60 }, // overlaps first
      ],
    });
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].rectIndices).toEqual([0]);
    expect(result.layers[1].rectIndices).toEqual([1]);
  });

  test("three rects where 0/1 are non-overlapping but 2 overlaps both → 2 layers", () => {
    // Greedy first-fit: rect 0 → layer 0. Rect 1 (no overlap with 0) →
    // layer 0. Rect 2 (overlaps both 0 and 1) → new layer 1.
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 0, y: 0, w: 30, h: 100 }, // left column
        { x: 70, y: 0, w: 30, h: 100 }, // right column
        { x: 0, y: 0, w: 100, h: 100 }, // full canvas — overlaps everything
      ],
    });
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].rectIndices).toEqual([0, 1]);
    expect(result.layers[1].rectIndices).toEqual([2]);
  });

  test("composed m0 nests layers L0 { L1 } and renders both layers' frames", () => {
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 0, y: 0, w: 50, h: 50 },
        { x: 25, y: 25, w: 50, h: 50 }, // overlaps
      ],
    });
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 100);
    expect(frames).toHaveLength(2);
  });
});

describe("placeRects — input validation", () => {
  test("rejects non-positive rootW/rootH", () => {
    expect(() => placeRects({ rootW: 0, rootH: 10, rects: [] })).toThrow(/rootW/);
    expect(() => placeRects({ rootW: 10, rootH: 0, rects: [] })).toThrow(/rootH/);
  });

  test("rejects rects with negative coords or non-positive dims", () => {
    expect(() =>
      placeRects({ rootW: 100, rootH: 100, rects: [{ x: -1, y: 0, w: 10, h: 10 }] }),
    ).toThrow(/x must be a non-negative/);
    expect(() =>
      placeRects({ rootW: 100, rootH: 100, rects: [{ x: 0, y: 0, w: 0, h: 10 }] }),
    ).toThrow(/w must be a positive/);
  });

  test("rejects rects that overflow the canvas", () => {
    expect(() =>
      placeRects({ rootW: 50, rootH: 50, rects: [{ x: 30, y: 0, w: 30, h: 10 }] }),
    ).toThrow(/overflows rootW/);
    expect(() =>
      placeRects({ rootW: 50, rootH: 50, rects: [{ x: 0, y: 40, w: 10, h: 20 }] }),
    ).toThrow(/overflows rootH/);
  });
});

describe("placeRects — custom claimants + empty tokens", () => {
  test("each rect can specify its own claimant", () => {
    const result = placeRects({
      rootW: 100,
      rootH: 50,
      rects: [
        { x: 0, y: 0, w: 30, h: 50, claimant: "1" },
        { x: 70, y: 0, w: 30, h: 50, claimant: "F" },
      ],
    });
    // Both render as frames (1 is the QR-style data tile; F is the
    // overlay-style frame token; both produce renderable frames).
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 50);
    expect(frames).toHaveLength(2);
  });
});

describe("placeRects — no fragmentation (one rect = one frame)", () => {
  test("a rect sliced vertically by a neighbor spills to its own layer", () => {
    // Rail spans full height; two stacked rects on the right put a y=50 edge
    // strictly inside the rail. Old behavior: all on 1 layer, rail fragmented
    // into 2 frames (4 total). New behavior: rail spills, 3 frames total.
    const rects = [
      { x: 0, y: 0, w: 20, h: 100 }, // rail (tall) — would be sliced at y=50
      { x: 20, y: 0, w: 80, h: 50 }, // top-right
      { x: 20, y: 50, w: 80, h: 50 }, // bottom-right
    ];
    const result = placeRects({ rootW: 100, rootH: 100, rects });
    expect(result.layers).toHaveLength(2);
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 100);
    // Exactly one frame per rect — no filler slices.
    expect(frames).toHaveLength(rects.length);
    // The rail renders as a single full-height frame.
    expect(frames).toContainEqual(
      expect.objectContaining({ x: 0, y: 0, width: 20, height: 100 }),
    );
  });

  test("stacked + side-by-side rects that share edges stay on one layer", () => {
    // No edge falls strictly inside another rect → no conflict → one layer,
    // one frame each. Guards against over-spilling on shared boundaries.
    const rects = [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 50, y: 0, w: 50, h: 50 },
      { x: 0, y: 50, w: 100, h: 50 }, // bottom band, touches at y=50
    ];
    const result = placeRects({ rootW: 100, rootH: 100, rects });
    expect(result.layers).toHaveLength(1);
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 100);
    expect(frames).toHaveLength(rects.length);
  });
});

describe("placeRects — determinism", () => {
  test("same input → byte-identical m0", () => {
    const opts = {
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 10, y: 10, w: 20, h: 20 },
        { x: 50, y: 60, w: 30, h: 30 },
      ],
    };
    const a = placeRects(opts);
    const b = placeRects(opts);
    expect(String(a.m0)).toBe(String(b.m0));
  });
});

describe("placeRects — importance (paint priority)", () => {
  test("higher importance stacks ABOVE lower even when the rects don't overlap (would otherwise share a layer)", () => {
    // Two non-overlapping rects: without importance they'd both land on layer 0.
    // A higher importance on the second forces it onto a layer above the first.
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 0, y: 0, w: 30, h: 30, importance: 0 },
        { x: 60, y: 60, w: 30, h: 30, importance: 1 }, // no overlap, but more important
      ],
    });
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].rectIndices).toEqual([0]); // base
    expect(result.layers[1].rectIndices).toEqual([1]); // on top
    const frames = parseM0StringToRenderFrames(String(result.m0), 100, 100);
    expect(frames).toHaveLength(2);
  });

  test("equal-importance rects still collapse onto as few layers as possible", () => {
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 0, y: 0, w: 30, h: 30, importance: 5 },
        { x: 40, y: 0, w: 30, h: 30, importance: 5 },
        { x: 70, y: 0, w: 30, h: 30, importance: 5 },
      ],
    });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].rectIndices).toEqual([0, 1, 2]);
  });

  test("tiers emit base→top by ascending importance regardless of input order", () => {
    // High-importance rect listed first; it must still end up on the TOP layer.
    const result = placeRects({
      rootW: 100,
      rootH: 100,
      rects: [
        { x: 10, y: 10, w: 20, h: 20, importance: 9 }, // input[0], more important
        { x: 50, y: 50, w: 20, h: 20, importance: 0 }, // input[1], less important
      ],
    });
    expect(result.layers).toHaveLength(2);
    expect(result.layers[0].rectIndices).toEqual([1]); // importance 0 is the base
    expect(result.layers[1].rectIndices).toEqual([0]); // importance 9 on top
  });

  test("omitting importance is byte-identical to importance:0 everywhere (backward compatible)", () => {
    const rects = [
      { x: 0, y: 0, w: 60, h: 60 },
      { x: 30, y: 30, w: 60, h: 60 },
    ];
    const none = placeRects({ rootW: 100, rootH: 100, rects });
    const allZero = placeRects({ rootW: 100, rootH: 100, rects: rects.map((r) => ({ ...r, importance: 0 })) });
    expect(String(none.m0)).toBe(String(allZero.m0));
    expect(none.layers.map((l) => l.rectIndices)).toEqual(allZero.layers.map((l) => l.rectIndices));
  });

  test("non-finite importance throws", () => {
    expect(() => placeRects({ rootW: 100, rootH: 100, rects: [{ x: 0, y: 0, w: 10, h: 10, importance: NaN }] })).toThrow(/importance must be a finite number/);
  });
});
