import { isValidM0String } from "@m0saic/dsl";
import { downgradeM0cToM0 } from "@m0saic/dsl-file-formats";
import type { M0cFile, M0cInset } from "@m0saic/dsl-file-formats";
import { bakeM0cInsets, lowerM0cToM0 } from "./bakeM0cInsets";
import { queryFrames } from "../queries/queryFrames";
import { isRenderedLeaf } from "./_internal/packLeafRects";

const W = 1000;
const H = 1000;
const GRID = "2[2(1,1),2(1,1)]"; // 2×2, four 500×500 cells, no base layer

type Rect = { x: number; y: number; w: number; h: number };

/** Rendered-leaf stableKeys of `m0` at W×H, in paint order. */
function leafKeys(m0: string): string[] {
  const q = queryFrames(m0, { width: W, height: H });
  const keyByLogical = new Map<number, string>();
  for (const f of q.editor().filter(isRenderedLeaf)) {
    if (f.logicalIndex != null) keyByLogical.set(f.logicalIndex, String(f.meta.stableKey));
  }
  return q.render().map((f) => keyByLogical.get(f.logicalIndex) ?? String(f.meta.stableKey));
}

function leafRects(m0: string): Rect[] {
  return queryFrames(m0, { width: W, height: H })
    .render()
    .map((f) => ({ x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.width), h: Math.round(f.height) }));
}

/** The engine's applyInsetToRect: floor per edge, clamp size. */
function engineRecover(cell: Rect, inset: M0cInset): Rect {
  const l = Math.floor(inset.left * cell.w);
  const r = Math.floor(inset.right * cell.w);
  const t = Math.floor(inset.top * cell.h);
  const b = Math.floor(inset.bottom * cell.h);
  return { x: cell.x + l, y: cell.y + t, w: Math.max(1, cell.w - (l + r)), h: Math.max(1, cell.h - (t + b)) };
}

function file(over: Partial<M0cFile> = {}): M0cFile {
  return {
    format: "m0c",
    version: 1,
    created: "2026-09-21T00:00:00.000Z",
    app: "test",
    appVersion: "0",
    meta: null,
    size: { width: W, height: H },
    m0: GRID,
    labels: null,
    derive: { background: null },
    masks: null,
    fill: null,
    insets: null,
    rankSets: null,
    custom: null,
    ...over,
  };
}

const hasRect = (rects: Rect[], r: Rect) =>
  rects.some((c) => c.x === r.x && c.y === r.y && c.w === r.w && c.h === r.h);

describe("bakeM0cInsets", () => {
  it("folds a leaf's inset into the geometry with the engine's exact math, clears insets, and carries the other sidecars by rekey", () => {
    const keys = leafKeys(GRID);
    const cells = leafRects(GRID);
    const inset: M0cInset = { top: 0.1, right: 0.05, bottom: 0.1, left: 0.05 };
    const target = keys[2];
    const src = file({
      insets: { [target]: inset } as M0cFile["insets"],
      labels: { [keys[0]]: { text: "first" }, [target]: { text: "third" } } as M0cFile["labels"],
      fill: { [target]: { color: "#ff8800" } } as M0cFile["fill"],
      rankSets: { heat: { mode: "cascade", ranks: { [keys[1]]: 0.5, [target]: 1 } } } as M0cFile["rankSets"],
    });

    const res = bakeM0cInsets(src);
    expect(res.meta.changed).toBe(true);
    expect(res.meta.insetCount).toBe(1);
    expect(res.meta.frameCount).toBe(4);
    expect(res.meta.orphanInsetKeys).toEqual([]);
    expect(res.file.insets).toBeNull();
    expect(isValidM0String(res.file.m0)).toBe(true);
    expect(res.meta.dslLengthAfter).toBeGreaterThan(res.meta.dslLengthBefore);

    // The baked m0 paints the shrunk cell exactly where the engine would.
    const expected = engineRecover(cells[2], inset);
    expect(expected).not.toEqual(cells[2]);
    const out = leafRects(res.file.m0);
    expect(out).toHaveLength(4);
    expect(hasRect(out, expected)).toBe(true);
    // The untouched cells are still there, unshrunk.
    expect(hasRect(out, cells[0])).toBe(true);
    expect(hasRect(out, cells[1])).toBe(true);
    expect(hasRect(out, cells[3])).toBe(true);

    // Sidecars followed their leaves: every surviving key is live in the new m0.
    const live = new Set(res.liveKeys);
    expect(res.liveKeys).toHaveLength(4);
    for (const k of Object.keys(res.file.labels ?? {})) expect(live.has(k)).toBe(true);
    for (const k of Object.keys(res.file.fill ?? {})) expect(live.has(k)).toBe(true);
    for (const k of Object.keys(res.file.rankSets?.heat?.ranks ?? {})) expect(live.has(k)).toBe(true);
    expect(Object.values(res.file.labels ?? {}).map((l) => l.text).sort()).toEqual(["first", "third"]);
    expect(Object.values(res.file.fill ?? {})).toEqual([{ color: "#ff8800" }]);
    expect(Object.values(res.file.rankSets?.heat?.ranks ?? {}).sort()).toEqual([0.5, 1]);
    // Everything that is not keyed by stableKey rides along untouched.
    expect(res.file.size).toEqual({ width: W, height: H });
    expect(res.file.derive).toEqual({ background: null });
    expect(res.file.created).toBe(src.created);
  });

  it("is idempotent: a baked file bakes to itself", () => {
    const keys = leafKeys(GRID);
    const once = bakeM0cInsets(file({ insets: { [keys[1]]: { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 } } as M0cFile["insets"] }));
    const twice = bakeM0cInsets(once.file);
    expect(twice.meta.changed).toBe(false);
    expect(twice.file.m0).toBe(once.file.m0);
    expect(twice.file.insets).toBeNull();
  });

  it("without insets it is a no-op that still normalizes insets to null", () => {
    const res = bakeM0cInsets(file({ insets: null }));
    expect(res.meta.changed).toBe(false);
    expect(res.file.m0).toBe(GRID);
    expect(res.file.insets).toBeNull();
    expect(res.rekey).toEqual([]);
    // All-zero entries carry no meaning — same as the format normalizer.
    const zero = bakeM0cInsets(file({ insets: { [leafKeys(GRID)[0]]: { top: 0, right: 0, bottom: 0, left: 0 } } as M0cFile["insets"] }));
    expect(zero.meta.changed).toBe(false);
    expect(zero.file.insets).toBeNull();
  });

  it("drops orphan keys and identity insets without rebuilding", () => {
    const keys = leafKeys(GRID);
    const res = bakeM0cInsets(
      file({
        insets: {
          "nope/0": { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 },
          // 0.0001 of a 500px cell floors to 0 on every edge → identity.
          [keys[0]]: { top: 0.0001, right: 0.0001, bottom: 0.0001, left: 0.0001 },
        } as M0cFile["insets"],
      }),
    );
    expect(res.meta.changed).toBe(false);
    expect(res.meta.orphanInsetKeys).toEqual(["nope/0"]);
    expect(res.meta.insetCount).toBe(0);
    expect(res.file.m0).toBe(GRID);
    expect(res.file.insets).toBeNull();
  });

  it("refuses to bake insets without a canvas size", () => {
    const keys = leafKeys(GRID);
    expect(() =>
      bakeM0cInsets(file({ size: null, insets: { [keys[0]]: { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 } } as M0cFile["insets"] })),
    ).toThrow(/no canvas size/);
  });
});

describe("lowerM0cToM0", () => {
  it("lowers to a plain .m0 that still shows the inset geometry — where downgradeM0cToM0 alone loses it", () => {
    const keys = leafKeys(GRID);
    const cells = leafRects(GRID);
    const inset: M0cInset = { top: 0.1, right: 0.1, bottom: 0.1, left: 0.1 };
    const src = file({ insets: { [keys[3]]: inset } as M0cFile["insets"], labels: { [keys[3]]: { text: "x" } } as M0cFile["labels"] });

    const lowered = lowerM0cToM0(src);
    expect(lowered.baked.changed).toBe(true);
    expect(lowered.baked.insetCount).toBe(1);
    expect(lowered.file.version).toBe(1);
    expect(lowered.file.size).toEqual({ width: W, height: H });
    expect(hasRect(leafRects(lowered.file.m0), engineRecover(cells[3], inset))).toBe(true);
    // Plain .m0 has no labels field at all — that loss is the format's, not the bake's.
    expect("labels" in lowered.file).toBe(false);

    // The structural downgrade keeps the coarse grid: the gutter is gone.
    const structural = downgradeM0cToM0(src);
    expect(structural.m0).toBe(GRID);
    expect(hasRect(leafRects(structural.m0), engineRecover(cells[3], inset))).toBe(false);
  });
});
