import { addOverlayLayer } from "./addOverlayLayer";
import { isValidM0String } from "@m0saic/dsl";
import { getLayerCount } from "../../../queries/getLayerCount";

describe("addOverlayLayer", () => {
  // ── Base cases — no existing root overlay ─────────────────

  test("attaches to a bare leaf", () => {
    expect(addOverlayLayer("1", "1")).toBe("1{1}");
  });

  test("canonicalizes F → 1 on both inputs", () => {
    expect(addOverlayLayer("F", "F")).toBe("1{1}");
  });

  test("attaches to a horizontal split", () => {
    expect(addOverlayLayer("2(1,1)", "1")).toBe("2(1,1){1}");
  });

  test("attaches to a vertical split", () => {
    expect(addOverlayLayer("3[1,1,1]", "1")).toBe("3[1,1,1]{1}");
  });

  test("attaches to a nested composite", () => {
    expect(addOverlayLayer("2(1,2[1,1])", "1")).toBe("2(1,2[1,1]){1}");
  });

  test("attaches to a multi-digit split", () => {
    expect(addOverlayLayer("12(1,1,1,1,1,1,1,1,1,1,1,1)", "1"))
      .toBe("12(1,1,1,1,1,1,1,1,1,1,1,1){1}");
  });

  // ── Nests inside existing root overlay chain ─────────────

  test("nests inside a single root overlay", () => {
    expect(addOverlayLayer("1{1}", "1")).toBe("1{1{1}}");
  });

  test("nests inside a 2-deep root overlay chain", () => {
    expect(addOverlayLayer("1{1{1}}", "1")).toBe("1{1{1{1}}}");
  });

  test("nests inside a 3-deep root overlay chain", () => {
    expect(addOverlayLayer("1{1{1{1}}}", "1")).toBe("1{1{1{1{1}}}}");
  });

  test("nests inside a chain where base + layers are composites", () => {
    expect(addOverlayLayer("2(1,1){3[1,1,1]}", "1"))
      .toBe("2(1,1){3[1,1,1]{1}}");
  });

  // ── Inner-cell overlays must NOT be confused for root-level ──

  test("does not descend into an inner-cell overlay", () => {
    // The `{1}` is attached to the FIRST CELL inside the `2[...]`,
    // not to the root. addOverlayLayer must attach the new layer at
    // the root (i.e. after the closing `]`).
    expect(addOverlayLayer("2[1{1},1]", "1"))
      .toBe("2[1{1},1]{1}");
  });

  test("inner-cell overlay alongside root overlay → still nests at root chain", () => {
    expect(addOverlayLayer("2[1{1},1]{1}", "1"))
      .toBe("2[1{1},1]{1{1}}");
  });

  // ── Output invariants ─────────────────────────────────────

  test("output is valid m0 and layer count increases by exactly 1", () => {
    const before = "2(1,1){3[1,1,1]{1}}";
    const beforeLayers = getLayerCount(before) ?? 0;
    const after = addOverlayLayer(before, "1");
    expect(isValidM0String(after)).toBe(true);
    expect(getLayerCount(after)).toBe(beforeLayers + 1);
  });

  test("layer count climbs 1→2→3→4 across repeated calls", () => {
    let m0: string = "1";
    expect(getLayerCount(m0)).toBe(1);
    m0 = addOverlayLayer(m0, "1");
    expect(getLayerCount(m0)).toBe(2);
    m0 = addOverlayLayer(m0, "1");
    expect(getLayerCount(m0)).toBe(3);
    m0 = addOverlayLayer(m0, "1");
    expect(getLayerCount(m0)).toBe(4);
    expect(m0).toBe("1{1{1{1}}}");
  });

  // ── Validation ────────────────────────────────────────────

  test("throws on invalid base m0", () => {
    expect(() => addOverlayLayer("((", "1")).toThrow();
  });

  test("throws on invalid layer content", () => {
    expect(() => addOverlayLayer("1", "((")).toThrow();
  });

  // ── Determinism ───────────────────────────────────────────

  test("repeated calls with the same args produce the same output", () => {
    const out1 = addOverlayLayer("2(1,1){3[1,1,1]}", "1");
    const out2 = addOverlayLayer("2(1,1){3[1,1,1]}", "1");
    expect(out1).toBe(out2);
  });
});
