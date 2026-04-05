import { toM0String, tryM0String } from "./toM0String";
import { rewriteOverlayChains } from "../transforms/rewriteOverlayChains";

describe("toM0String", () => {
  // ---- Valid input ----

  test("returns branded string for valid input", () => {
    const result = toM0String("2(1,1)");
    expect(typeof result).toBe("string");
    expect(result).toBe("2(1,1)");
  });

  test("single tile", () => {
    expect(toM0String("1")).toBe("1");
  });

  test("nested structure", () => {
    expect(toM0String("2[2(1,1),2(1,1)]")).toBe("2[2(1,1),2(1,1)]");
  });

  // ---- Canonicalization ----

  test("strips whitespace", () => {
    expect(toM0String("2( 1 , 1 )")).toBe("2(1,1)");
  });

  test("normalizes F alias to 1", () => {
    expect(toM0String("F")).toBe("1");
  });

  test("normalizes > alias to 0", () => {
    expect(toM0String("2(>,1)")).toBe("2(0,1)");
  });

  // ---- Overlay chains are NOT implicitly rewritten ----

  test("throws on overlay chain (no implicit rewrite)", () => {
    expect(() => toM0String("1{1}{1}")).toThrow();
  });

  test("throws on multi-level overlay chain", () => {
    expect(() => toM0String("1{1}{1}{1}")).toThrow();
  });

  test("throws on deep-nested overlay chain", () => {
    expect(() => toM0String("1{1{1}}{1}")).toThrow();
  });

  // ---- Explicit rewrite + brand works ----

  test("explicit rewriteOverlayChains then toM0String works", () => {
    const normalized = rewriteOverlayChains("1{1}{1}");
    expect(toM0String(normalized)).toBe("1{1{1}}");
  });

  test("explicit rewrite for deep chain works", () => {
    const normalized = rewriteOverlayChains("1{1{1}}{1}");
    expect(toM0String(normalized)).toBe("1{1{1{1}}}");
  });

  // ---- Non-chain overlays pass through ----

  test("passes through non-chain overlays unchanged", () => {
    expect(toM0String("1{1}")).toBe("1{1}");
  });

  test("already-nested overlays are not affected", () => {
    expect(toM0String("1{1{1}}")).toBe("1{1{1}}");
  });

  // ---- Error: invalid input ----

  test("throws on empty string", () => {
    expect(() => toM0String("")).toThrow();
  });

  test("throws on malformed DSL", () => {
    expect(() => toM0String("999()")).toThrow();
  });

  // ---- Error message formatting ----

  test("error includes context string", () => {
    expect(() => toM0String("", "myContext")).toThrow(/myContext/);
  });

  test("error includes 'm0:' with canonical form", () => {
    expect(() => toM0String("999()", "test")).toThrow(/m0:/);
  });

  test("uses default context when none provided", () => {
    expect(() => toM0String("")).toThrow(/toM0String/);
  });
});

// ─────────────────────────────────────────────────────────────
// tryM0String — non-throwing Result variant
// ─────────────────────────────────────────────────────────────

describe("tryM0String", () => {
  test("returns ok: true with branded value for valid input", () => {
    const result = tryM0String("2(1,1)");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("2(1,1)");
    }
  });

  test("canonicalizes aliases", () => {
    const result = tryM0String("2(F,F)");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("2(1,1)");
    }
  });

  test("returns ok: false with error for invalid input", () => {
    const result = tryM0String("");
    expect(result.ok).toBe(false);
    expect("error" in result && result.error.code).toBe("INVALID_EMPTY");
  });

  test("returns ok: false for overlay chains", () => {
    const result = tryM0String("1{1}{1}");
    expect(result.ok).toBe(false);
    expect("error" in result && result.error.code).toBe("OVERLAY_CHAIN");
  });

  test("never throws", () => {
    const inputs = ["", ")(", "}{", "999()", "bad!", "1{1}{1}"];
    for (const input of inputs) {
      const result = tryM0String(input);
      expect(typeof result.ok).toBe("boolean");
    }
  });
});
