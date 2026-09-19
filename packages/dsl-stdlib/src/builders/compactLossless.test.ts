import { compactLossless } from "./compactLossless";
import { isValidM0String } from "@m0saic/dsl";

describe("compactLossless", () => {
  test("chains null-layer removal and split reduction", () => {
    // `2(-,-){...}` is a pure-null base layer; the survivor is a reducible
    // 10-split.
    const r = compactLossless({
      m0: "2(-,-){10(0,1,0,0,0,0,0,0,0,1)}",
      width: 1000,
      height: 100,
    });
    expect(r.m0).toBe("5(1,0,0,0,1)");
    expect(r.meta.reducedSplits).toBe(1);
    expect(r.meta.layersBefore).toBe(2);
    expect(r.meta.layersAfter).toBe(1);
    expect(r.meta.dslLengthAfter).toBeLessThan(r.meta.dslLengthBefore);
    expect(r.meta.maxDriftPx).toBe(0);
    expect(isValidM0String(r.m0)).toBe(true);
  });

  test("frame count is invariant across compaction", () => {
    const r = compactLossless({
      m0: "10(0,1,0,0,0,0,0,0,0,1)",
      width: 1000,
      height: 100,
    });
    expect(r.meta.frameCount).toBe(2);
  });

  test("reports keysStable + an empty rekey when nothing structural moves", () => {
    // Single painting layer, reducible split; the reduced split's surviving
    // claimants keep their identity? No — child indices shift, so keys change.
    // Use an unreducible doc to assert the stable path.
    const r = compactLossless({ m0: "2(1,1)", width: 1000, height: 100 });
    expect(r.m0).toBe("2(1,1)");
    expect(r.keysStable).toBe(true);
    expect(r.rekey).toEqual([]);
    expect(r.liveKeys).toHaveLength(2);
  });

  test("surfaces a rekey map when reduction shifts cell stableKeys", () => {
    const r = compactLossless({
      m0: "10(0,1,0,0,0,0,0,0,0,1)",
      width: 1000,
      height: 100,
    });
    // The two claimants move from child indices 1,9 to 0,4 → keys change.
    expect(r.keysStable).toBe(false);
    expect(r.rekey.length).toBeGreaterThan(0);
    expect(r.liveKeys).toHaveLength(2);
    // Every rekey target is a live key.
    for (const { to } of r.rekey) expect(r.liveKeys).toContain(to);
  });

  test("identity result when there is nothing to compact", () => {
    const r = compactLossless({ m0: "3[1,1,1]", width: 900, height: 900 });
    expect(r.m0).toBe("3[1,1,1]");
    expect(r.meta.reducedSplits).toBe(0);
    expect(r.keysStable).toBe(true);
  });

  test("reduceSplits:false only removes null layers", () => {
    const r = compactLossless({
      m0: "2(-,-){10(0,1,0,0,0,0,0,0,0,1)}",
      width: 1000,
      height: 100,
      reduceSplits: false,
    });
    expect(r.m0).toBe("10(0,1,0,0,0,0,0,0,0,1)");
    expect(r.meta.reducedSplits).toBe(0);
  });

  test("removeNullLayers:false leaves null layers in place", () => {
    const r = compactLossless({
      m0: "2(1,1){2(-,-)}",
      width: 1000,
      height: 100,
      removeNullLayers: false,
    });
    expect(r.m0).toBe("2(1,1){2(-,-)}");
  });

  test("rejects non-integer canvas dims", () => {
    expect(() => compactLossless({ m0: "2(1,1)", width: 0, height: 100 })).toThrow();
  });
});
