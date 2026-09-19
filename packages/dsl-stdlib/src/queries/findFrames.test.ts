import { parseM0StringToFullGraph, parseM0StringToRenderFrames, type EditorFrame } from "@m0saic/dsl";
import {
  findFrames,
  findFirstFrame,
  findStableKeys,
  countFrames,
  mapFrames,
  someFrame,
  everyFrame,
  findRenderFrames,
  findLogicalFrames,
} from "./findFrames";

describe("findFrames family (stateless)", () => {
  const m0 = "3(1,2(1,1),1)"; // root → row of 3, middle is a 2-col group
  const w = 1920;
  const h = 1080;

  test("findFrames: predicate true for all matches the full graph length", () => {
    const all = findFrames(m0, () => true);
    const expected = parseM0StringToFullGraph(m0, 1920, 1080);
    expect(all).toHaveLength(expected.length);
  });

  test("findFrames: filters to rendered frames only", () => {
    const onlyRendered = findFrames(m0, (f) => f.kind === "frame");
    expect(onlyRendered.length).toBe(4); // 1, 1, 1, 1 → 4 rendered
    for (const f of onlyRendered) expect(f.kind).toBe("frame");
  });

  test("findFirstFrame: returns null when nothing matches", () => {
    expect(findFirstFrame(m0, () => false)).toBeNull();
  });

  test("findFirstFrame: returns the first match", () => {
    const first = findFirstFrame(m0, (f) => f.kind === "frame");
    expect(first).not.toBeNull();
    expect(first!.kind).toBe("frame");
  });

  test("findStableKeys: returns one key per match", () => {
    const keys = findStableKeys(m0, (f) => f.kind === "frame");
    expect(keys).toHaveLength(4);
    for (const k of keys) expect(typeof k).toBe("string");
  });

  test("countFrames: equivalent to findFrames(...).length", () => {
    const pred = (f: EditorFrame) => f.kind === "frame";
    expect(countFrames(m0, pred)).toBe(findFrames(m0, pred).length);
  });

  test("mapFrames: walks every editor frame, yields equal-length array", () => {
    const kinds = mapFrames(m0, (f) => f.kind);
    expect(kinds.length).toBe(parseM0StringToFullGraph(m0, 1920, 1080).length);
  });

  test("someFrame / everyFrame: short-circuit semantics", () => {
    expect(someFrame(m0, (f) => f.kind === "frame")).toBe(true);
    expect(someFrame(m0, () => false)).toBe(false);
    expect(everyFrame(m0, () => true)).toBe(true);
    expect(everyFrame(m0, (f) => f.kind === "frame")).toBe(false);
  });

  test("predicate ctx exposes the documented bits", () => {
    const seen: Array<{ depth: number; logicalIndex: number | undefined }> = [];
    findFrames(m0, (_f, ctx) => {
      seen.push({ depth: ctx.depth, logicalIndex: ctx.logicalIndex });
      return false;
    });
    // ctx is collected for every frame — at least the root + every frame visit
    expect(seen.length).toBeGreaterThan(0);
    // depth values are non-negative and the root depth is 0
    expect(seen.some((s) => s.depth === 0)).toBe(true);
  });

  test("opts: width / height override the default canvas", () => {
    const small = findRenderFrames(m0, (f) => f.width > 0, { width: 100, height: 100 });
    const big = findRenderFrames(m0, (f) => f.width > 0, { width: 4000, height: 4000 });
    // Frames widen with the canvas; the largest tile in `big` is wider.
    const maxSmall = Math.max(...small.map((f) => f.width));
    const maxBig = Math.max(...big.map((f) => f.width));
    expect(maxBig).toBeGreaterThan(maxSmall);
  });
});

describe("findRenderFrames / findLogicalFrames (variants)", () => {
  const m0 = "3(1,>,1)"; // 3 cols, middle is passthrough

  test("findRenderFrames: only rendered tiles", () => {
    const matches = findRenderFrames(m0, () => true);
    const expected = parseM0StringToRenderFrames(m0, 1920, 1080);
    expect(matches).toHaveLength(expected.length);
    expect(matches.length).toBe(2); // two `1` leaves
  });

  test("findLogicalFrames: array index === logicalIndex", () => {
    const all = findLogicalFrames(m0, () => true);
    for (let i = 0; i < all.length; i++) {
      expect(all[i]!.logicalIndex).toBe(i);
    }
  });
});
