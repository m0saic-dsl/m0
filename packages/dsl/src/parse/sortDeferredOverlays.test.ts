import { sortDeferredOverlays } from "./sortDeferredOverlays";

describe("sortDeferredOverlays", () => {
  it("orders by area descending and rootId ascending as tie-breaker", () => {
    const list = [
      { area: 1000, rootId: 42 },
      { area: 1000, rootId: 7 },
      { area: 2000, rootId: 9 },
    ];

    sortDeferredOverlays(list);

    expect(list.map((x) => x.rootId)).toEqual([9, 7, 42]);
  });

  it("is deterministic across input permutations", () => {
    const a = [
      { area: 1000, rootId: 42 },
      { area: 1000, rootId: 7 },
      { area: 2000, rootId: 9 },
      { area: 1000, rootId: 13 },
    ];
    const b = [
      { area: 1000, rootId: 13 },
      { area: 2000, rootId: 9 },
      { area: 1000, rootId: 42 },
      { area: 1000, rootId: 7 },
    ];

    sortDeferredOverlays(a);
    sortDeferredOverlays(b);

    expect(a).toEqual(b);
    expect(a.map((x) => x.rootId)).toEqual([9, 7, 13, 42]);
  });
});
