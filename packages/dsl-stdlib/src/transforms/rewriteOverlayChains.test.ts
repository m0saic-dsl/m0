import { rewriteOverlayChains } from "./rewriteOverlayChains";

describe("rewriteOverlayChains", () => {
  // ── Simple chains ──
  it.each([
    ["1{1}{1}", "1{1{1}}"],
    ["1{1}{1}{1}", "1{1{1{1}}}"],
    ["2(1{1}{1},1)", "2(1{1{1}},1)"],
    ["1{2(1,1)}{1}", "1{2(1,1){1}}"],
    ["2(1,1{1}{1})", "2(1,1{1{1}})"],
  ])("%s → %s", (input, expected) => {
    expect(rewriteOverlayChains(input)).toBe(expected);
  });

  // ── Deep left-subtree chains (nested overlays before chain boundary) ──
  it.each([
    ["1{2{3}}{4}", "1{2{3{4}}}"],
    ["1{2{3}}{4}{5}", "1{2{3{4{5}}}}"],
    ["1{2{3{4}}}{5}", "1{2{3{4{5}}}}"],
    ["1{2{3{4{5}}}}{6}", "1{2{3{4{5{6}}}}}"],
  ])("deep left: %s → %s", (input, expected) => {
    expect(rewriteOverlayChains(input)).toBe(expected);
  });

  // ── Multiple independent chains ──
  it("multiple independent chains in same string", () => {
    expect(rewriteOverlayChains("2(1{1}{1},1{1}{1})")).toBe(
      "2(1{1{1}},1{1{1}})",
    );
  });

  // ── Idempotence ──
  it("is idempotent on already-nested overlays", () => {
    expect(rewriteOverlayChains("1{1{1}}")).toBe("1{1{1}}");
    expect(rewriteOverlayChains("1{1{1{1}}}")).toBe("1{1{1{1}}}");
    expect(rewriteOverlayChains("1{2{3{4}}}")).toBe("1{2{3{4}}}");
  });

  it("is idempotent (double application)", () => {
    const cases = [
      "1{1}{1}",
      "1{1}{1}{1}",
      "2(1{1}{1},1{1}{1})",
      "1{2{3}}{4}",
      "1{2{3}}{4}{5}",
      "1{2{3{4}}}{5}",
    ];
    for (const c of cases) {
      const once = rewriteOverlayChains(c);
      expect(rewriteOverlayChains(once)).toBe(once);
    }
  });

  // ── No overlays / single overlay (passthrough) ──
  it("passes through strings with no overlays", () => {
    expect(rewriteOverlayChains("2(1,1)")).toBe("2(1,1)");
    expect(rewriteOverlayChains("1")).toBe("1");
  });

  it("passes through strings with a single overlay", () => {
    expect(rewriteOverlayChains("1{1}")).toBe("1{1}");
    expect(rewriteOverlayChains("2(1{1},1)")).toBe("2(1{1},1)");
  });

  // ── No remaining chains after normalization ──
  it("output never contains }{", () => {
    const inputs = [
      "1{1}{1}",
      "1{1}{1}{1}",
      "1{2{3}}{4}",
      "1{2{3}}{4}{5}",
      "1{2{3{4}}}{5}",
      "2(1{1}{1},1{2{3}}{4})",
    ];
    for (const input of inputs) {
      const result = rewriteOverlayChains(input);
      expect(result).not.toContain("}{");
    }
  });
});
