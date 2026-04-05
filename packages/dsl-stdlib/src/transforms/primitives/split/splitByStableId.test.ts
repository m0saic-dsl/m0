import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { splitByStableId } from "./splitByStableId";

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

describe("splitByStableId", () => {
  const m0 = "3(1,0,1)";

  test("splits a rendered frame by stableKey into cols", () => {
    const key = getStableKey(m0, "frame", 0);
    expect(splitByStableId(m0, key, "col", 2)).toBe("3(2(1,1),0,1)");
  });

  test("splits a rendered frame by stableKey into rows", () => {
    const key = getStableKey(m0, "frame", 1);
    expect(splitByStableId(m0, key, "row", 3)).toBe("3(1,0,3[1,1,1])");
  });

  test("splits with weights (optimized: GCD reduces [60,40] → [3,2])", () => {
    const key = getStableKey("1", "root", 0);
    const result = splitByStableId("1", key, "col", 2, [60, 40]);
    // GCD(60,40) = 20, reduced to [3,2], total = 5
    expect(result).toBe("5(0,0,1,0,1)");
  });

  test("preserves overlay on split tile", () => {
    const withOverlay = "2(1{1},1)";
    const key = getStableKey(withOverlay, "frame", 0);
    expect(splitByStableId(withOverlay, key, "col", 2)).toBe("2(2(1,1){1},1)");
  });

  test("splits tile inside nested structure", () => {
    const nested = "2(1,2[1,1])";
    const key = getStableKey(nested, "frame", 2);
    expect(splitByStableId(nested, key, "col", 2)).toBe("2(1,2[1,2(1,1)])");
  });

  test("throws on passthrough target", () => {
    const key = getStableKey(m0, "passthrough", 0);
    expect(() => splitByStableId(m0, key, "col", 2)).toThrow(/rendered frame/i);
  });

  test("throws on unknown stableKey", () => {
    expect(() => splitByStableId(m0, "nonexistent/key", "col", 2)).toThrow(
      /no node found/i,
    );
  });

  test("throws on invalid m0saic input", () => {
    expect(() => splitByStableId("((", "x", "col", 2)).toThrow();
  });
});
