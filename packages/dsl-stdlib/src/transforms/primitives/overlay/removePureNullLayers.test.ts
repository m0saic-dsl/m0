import { removePureNullLayers, splitRootChain } from "./removePureNullLayers";
import { isValidM0String } from "@m0saic/dsl";
import { getLayerCount } from "../../../queries/getLayerCount";

describe("removePureNullLayers", () => {
  // ── No-op cases ───────────────────────────────────────────

  test("single painting layer is untouched", () => {
    expect(removePureNullLayers("2(1,1)")).toBe("2(1,1)");
  });

  test("all-painting chain is untouched", () => {
    expect(removePureNullLayers("2(1,1){3[1,1,1]}")).toBe("2(1,1){3[1,1,1]}");
  });

  // ── Dropping ──────────────────────────────────────────────

  test("drops a pure-null trailing layer", () => {
    expect(removePureNullLayers("2(1,1){2(-,-)}")).toBe("2(1,1)");
  });

  test("drops a pure-null layer with passthroughs", () => {
    expect(removePureNullLayers("2(1,1){3(0,0,-)}")).toBe("2(1,1)");
  });

  test("drops a pure-null MIDDLE layer and re-nests survivors", () => {
    expect(removePureNullLayers("2(1,1){2(-,-){3[1,1,1]}}")).toBe(
      "2(1,1){3[1,1,1]}",
    );
  });

  test("drops a paint-less BASE — first painting layer promotes", () => {
    expect(removePureNullLayers("2(-,-){2(1,1)}")).toBe("2(1,1)");
  });

  test("drops several null layers at once", () => {
    expect(
      removePureNullLayers("2(-,-){2(1,1){3(-,-,-){2[1,1]}}}"),
    ).toBe("2(1,1){2[1,1]}");
  });

  // ── Discrimination ────────────────────────────────────────

  test("multi-digit split counts are not mistaken for paint", () => {
    // 12-way split of nulls — the "1" in "12" is a digit run, not a tile.
    expect(
      removePureNullLayers("2(1,1){12(-,-,-,-,-,-,-,-,-,-,-,-)}"),
    ).toBe("2(1,1)");
  });

  test("a layer whose paint lives in an inner-cell overlay is kept", () => {
    const m0 = "2(1,1){2(-{1},-)}";
    expect(removePureNullLayers(m0)).toBe(m0);
  });

  test("canonicalizes F → 1 and > → 0", () => {
    expect(removePureNullLayers("2(F,F){2(-,-)}")).toBe("2(1,1)");
  });

  // ── Invariants ────────────────────────────────────────────

  test("output is always valid and layer count never grows", () => {
    const cases = [
      "2(1,1){2(-,-)}",
      "2(-,-){2(1,1){3(-,-,-)}}",
      "3[1,0,1]{2(-,-){2(1,1)}}",
    ];
    for (const m0 of cases) {
      const out = removePureNullLayers(m0);
      expect(isValidM0String(out)).toBe(true);
      expect(getLayerCount(out) ?? 1).toBeLessThanOrEqual(getLayerCount(m0) ?? 1);
    }
  });

  test("throws on invalid input", () => {
    expect(() => removePureNullLayers("2(1)")).toThrow();
  });
});

describe("splitRootChain", () => {
  test("splits a 3-deep chain", () => {
    expect(splitRootChain("2(1,1){2(-,-){3[1,1,1]}}")).toEqual([
      "2(1,1)",
      "2(-,-)",
      "3[1,1,1]",
    ]);
  });

  test("inner-cell overlays stay inside their layer expression", () => {
    expect(splitRootChain("2[1{1},1]{1}")).toEqual(["2[1{1},1]", "1"]);
  });

  test("single expression yields one layer", () => {
    expect(splitRootChain("3(1,1,1)")).toEqual(["3(1,1,1)"]);
  });
});
