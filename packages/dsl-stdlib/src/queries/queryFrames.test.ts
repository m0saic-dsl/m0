import { queryFrames, FrameQuery } from "./queryFrames";
import { findFrames, findStableKeys, countFrames } from "./findFrames";

describe("queryFrames (cached)", () => {
  const m0 = "3(1,2(1,1),1)";

  test("entry returns a FrameQuery", () => {
    expect(queryFrames(m0)).toBeInstanceOf(FrameQuery);
  });

  test("find / count agree with the stateless helpers", () => {
    const q = queryFrames(m0);
    expect(q.find((f) => f.kind === "frame").length).toBe(
      findFrames(m0, (f) => f.kind === "frame").length,
    );
    expect(q.count((f) => f.kind === "frame")).toBe(
      countFrames(m0, (f) => f.kind === "frame"),
    );
  });

  test("stableKeys agrees with findStableKeys", () => {
    const q = queryFrames(m0);
    const a = q.stableKeys((f) => f.kind === "frame");
    const b = findStableKeys(m0, (f) => f.kind === "frame");
    expect(a).toEqual(b);
  });

  test("editor walk is cached across calls", () => {
    const q = queryFrames(m0);
    // First call populates the cache; second call returns the same array reference.
    const a = q.editor();
    const b = q.editor();
    expect(b).toBe(a);
  });

  test("render / logical caches are independent", () => {
    const q = queryFrames(m0);
    const r1 = q.render();
    const r2 = q.render();
    const l1 = q.logical();
    const l2 = q.logical();
    expect(r2).toBe(r1);
    expect(l2).toBe(l1);
  });

  test("findFirst returns null when nothing matches", () => {
    expect(queryFrames(m0).findFirst(() => false)).toBeNull();
  });

  test("some / every short-circuit", () => {
    const q = queryFrames(m0);
    expect(q.some((f) => f.kind === "frame")).toBe(true);
    expect(q.every(() => true)).toBe(true);
  });

  test("opts override the canvas size for the parse", () => {
    const small = queryFrames(m0, { width: 100, height: 100 });
    const big = queryFrames(m0, { width: 4000, height: 4000 });
    const smallMax = Math.max(...small.render().map((f) => f.width));
    const bigMax = Math.max(...big.render().map((f) => f.width));
    expect(bigMax).toBeGreaterThan(smallMax);
  });
});

describe("FrameQuery.within — chainable scope-narrowing", () => {
  // `3(1,2(1,1),1)` at 1920×1080:
  //   col 0:      (0,0,640,1080)
  //   col 1 root: (640,0,640,1080)  ← splits into two columns
  //     inner 0:  (640,0,320,1080)
  //     inner 1:  (960,0,320,1080)
  //   col 2:      (1280,0,640,1080)
  const m0 = "3(1,2(1,1),1)";

  test("within(rect) — frames inside the rect are kept, siblings dropped", () => {
    const q = queryFrames(m0);
    // Scope to the LEFT TWO COLUMNS — drops col 2.
    const scoped = q.within({ x: 0, y: 0, width: 1280, height: 1080 });
    const xs = scoped.render().map((f) => f.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 640, 960]); // cols 0, inner-0, inner-1 — col 2 (x=1280) dropped
  });

  test("within(stableKey) resolves the key to bounds", () => {
    const q = queryFrames(m0);
    // Find the middle column's 2(1,1) group node by bounds and use its key.
    const midGroup = q.editor().find(
      (f) => f.kind === "group" && f.x === 640 && f.width === 640,
    );
    expect(midGroup).toBeDefined();
    const scoped = q.within(midGroup!.meta.stableKey);
    const xs = scoped.render().map((f) => f.x).sort((a, b) => a - b);
    expect(xs).toEqual([640, 960]); // just the middle column's two inner leaves
  });

  test("missing stableKey returns an empty query (no throw)", () => {
    const q = queryFrames(m0);
    // A clearly-non-existent stableKey shouldn't throw or include anything.
    const scoped = q.within("not-a-real-stable-key" as unknown as ReturnType<typeof q.editor>[0]["meta"]["stableKey"]);
    expect(scoped.render()).toHaveLength(0);
    expect(scoped.editor()).toHaveLength(0);
    expect(scoped.logical()).toHaveLength(0);
  });

  test("chained within() composes — inner scope wins when contained in outer", () => {
    const q = queryFrames(m0);
    const outer = { x: 0, y: 0, width: 1280, height: 1080 };
    const inner = { x: 640, y: 0, width: 640, height: 1080 };
    const direct = q.within(inner).render().map((f) => f.x).sort();
    const chained = q.within(outer).within(inner).render().map((f) => f.x).sort();
    expect(chained).toEqual(direct);
    expect(chained).toEqual([640, 960]);
  });

  test("non-overlapping chained scopes yield empty results", () => {
    const q = queryFrames(m0);
    const left = { x: 0, y: 0, width: 640, height: 1080 };
    const right = { x: 1280, y: 0, width: 640, height: 1080 };
    expect(q.within(left).within(right).render()).toHaveLength(0);
  });

  test("editor / logical / render walks all honor the same scope", () => {
    const q = queryFrames(m0);
    const scoped = q.within({ x: 640, y: 0, width: 640, height: 1080 });
    // All three walks should agree that the two middle leaves are inside.
    expect(scoped.render().map((f) => f.x).sort()).toEqual([640, 960]);
    expect(scoped.logical().map((f) => f.x).sort()).toEqual([640, 960]);
    // editor() includes the group node itself (its bounds are also inside) + the two leaves.
    const editorXs = scoped.editor().map((f) => f.x).sort();
    expect(editorXs).toContain(640);
    expect(editorXs).toContain(960);
  });

  test("base parses are shared with the parent (no re-parse on scope)", () => {
    const q = queryFrames(m0);
    // Touch the parent walks first to populate caches.
    const parentEditor = q.editor();
    const parentRender = q.render();
    const parentLogical = q.logical();
    // Chained scoped queries should pull from the parent's caches, not re-parse.
    const scoped = q.within({ x: 0, y: 0, width: 1920, height: 1080 });
    // When the scope contains everything, the filtered slice equals the base
    // — array contents identical, just freshly filtered each call.
    expect(scoped.editor().length).toBe(parentEditor.length);
    expect(scoped.render().length).toBe(parentRender.length);
    expect(scoped.logical().length).toBe(parentLogical.length);
  });
});
