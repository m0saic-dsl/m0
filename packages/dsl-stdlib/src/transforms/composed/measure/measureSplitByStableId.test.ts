import { isValidM0String, parseM0StringToFullGraph } from "@m0saic/dsl";
import { measureSplitByStableId } from "./measureSplitByStableId";

function expectValid(s: string) {
  expect(typeof s).toBe("string");
  expect(isValidM0String(s)).toBe(true);
}

function countChar(s: string, ch: string) {
  const re = new RegExp(ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  return (s.match(re) ?? []).length;
}

function countClaimants(s: string) {
  const re = /(^|[,\[\]\(\)\{\}\-])(F|1)(?=($|[,\[\]\(\)\{\}\-]))/g;
  return (s.match(re) ?? []).length;
}

/** Helper: get the stableKey of the Nth frame (by id order) matching a kind. */
function getStableKey(
  m0: string,
  kind: string,
  index: number,
): string {
  const frames = parseM0StringToFullGraph(m0, 1920, 1080);
  const matches = frames
    .filter((f) => f.kind === kind);
  if (index >= matches.length) throw new Error(`No frame at index ${index}`);
  return String(matches[index].meta.stableKey);
}

describe("measureSplitByStableId", () => {
  const m0 = "3(1,0,1)";

  test("replaces a tile by stableKey with a measure split", () => {
    const key = getStableKey(m0, "frame", 0);
    const out = measureSplitByStableId(m0, key, "col", 4, [{ a: 1, b: 2 }]);
    expectValid(out);
    // The first tile should be replaced with a 4(...)
    expect(out).toMatch(/^3\(4\(/);
  });

  test("replaces second tile by stableKey", () => {
    const key = getStableKey(m0, "frame", 1);
    const out = measureSplitByStableId(m0, key, "row", 6, [
      { a: 0, b: 2 },
      { a: 3, b: 5 },
    ]);
    expectValid(out);
    // Second tile replaced, passthrough unchanged
    expect(out).toMatch(/^3\(1,0,6\[/);
    // Two adjacent groups → 2 claimants inside measure + 1 from first child
    expect(countClaimants(out)).toBe(3);
    expect(countChar(out, "-")).toBe(0);
  });

  test("adjacent groups remain distinct", () => {
    const key = getStableKey("1", "root", 0);
    const out = measureSplitByStableId("1", key, "col", 6, [
      { a: 0, b: 2 },
      { a: 3, b: 5 },
    ]);
    expectValid(out);
    expect(out).toBe("6(0,0,1,0,0,1)");
  });

  test("preserves overlay on replaced tile", () => {
    const withOverlay = "2(1{1},1)";
    const key = getStableKey(withOverlay, "frame", 0);
    const out = measureSplitByStableId(withOverlay, key, "col", 4, [
      { a: 0, b: 1 },
    ]);
    expectValid(out);
    expect(out).toContain("{");
  });

  test("works with nested structure", () => {
    const nested = "2(1,2[1,1])";
    const key = getStableKey(nested, "frame", 2);
    const out = measureSplitByStableId(nested, key, "col", 4, [
      { a: 0, b: 3 },
    ]);
    expectValid(out);
    expect(out).toMatch(/2\(1,2\[1,4\(/);
  });

  test("throws on passthrough target", () => {
    const key = getStableKey(m0, "passthrough", 0);
    expect(() =>
      measureSplitByStableId(m0, key, "col", 4, [{ a: 0, b: 1 }]),
    ).toThrow(/rendered frame/i);
  });

  test("throws on unknown stableKey", () => {
    expect(() =>
      measureSplitByStableId(m0, "nonexistent/key", "col", 4, [{ a: 0, b: 1 }]),
    ).toThrow(/no node found/i);
  });

  test("throws on invalid m0saic input", () => {
    expect(() =>
      measureSplitByStableId("((", "x", "col", 4, [{ a: 0, b: 1 }]),
    ).toThrow();
  });
});
