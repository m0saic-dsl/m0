import { hasOverlayAtSpan } from "./hasOverlayAtSpan";

describe("hasOverlayAtSpan", () => {
  // ---- Basic true cases ----

  test("single tile with overlay", () => {
    expect(hasOverlayAtSpan("1{1}", { start: 0, end: 1 })).toBe(true);
  });

  test("tile inside container with overlay", () => {
    expect(hasOverlayAtSpan("2(1{1},1)", { start: 2, end: 3 })).toBe(true);
  });

  test("group with overlay", () => {
    // 2(1,1){1} — group span is [0, 6), overlay at position 6
    expect(hasOverlayAtSpan("2(1,1){1}", { start: 0, end: 6 })).toBe(true);
  });

  // ---- Basic false cases ----

  test("single tile without overlay", () => {
    expect(hasOverlayAtSpan("1", { start: 0, end: 1 })).toBe(false);
  });

  test("tile inside container without overlay", () => {
    expect(hasOverlayAtSpan("2(1,1)", { start: 2, end: 3 })).toBe(false);
  });

  test("second tile when first has overlay", () => {
    expect(hasOverlayAtSpan("2(1{1},1)", { start: 6, end: 7 })).toBe(false);
  });

  // ---- Pretty input normalized ----

  test("pretty input canonicalized before check", () => {
    // F{F} canonicalizes to 1{1}
    expect(hasOverlayAtSpan("F{F}", { start: 0, end: 1 })).toBe(true);
  });

  // ---- Span at end of string ----

  test("span.end at string length — no overlay possible", () => {
    // "1" has length 1, span [0,1) — nothing after span.end
    expect(hasOverlayAtSpan("1", { start: 0, end: 1 })).toBe(false);
  });

  test("last tile in container — no overlay", () => {
    // "2(1,1)" — second tile at [4,5), char at 5 is ")"
    expect(hasOverlayAtSpan("2(1,1)", { start: 4, end: 5 })).toBe(false);
  });

  // ---- Complex overlay content ----

  test("tile with nested overlay content", () => {
    // 1{2(1,1)} — root tile has complex overlay
    expect(hasOverlayAtSpan("1{2(1,1)}", { start: 0, end: 1 })).toBe(true);
  });

  // ---- Passthrough and null spans ----

  test("passthrough without overlay", () => {
    // "3(1,0,1)" — passthrough at [4,5), char at 5 is ","
    expect(hasOverlayAtSpan("3(1,0,1)", { start: 4, end: 5 })).toBe(false);
  });

  // ---- Invalid input ----

  test("invalid m0saic throws", () => {
    expect(() => hasOverlayAtSpan("(", { start: 0, end: 1 })).toThrow(
      /invalid input/i,
    );
  });

  test("out-of-bounds span throws", () => {
    expect(() => hasOverlayAtSpan("1", { start: 5, end: 6 })).toThrow(
      /invalid/i,
    );
  });

  test("reversed span throws", () => {
    expect(() => hasOverlayAtSpan("2(1,1)", { start: 3, end: 2 })).toThrow(
      /invalid/i,
    );
  });
});
