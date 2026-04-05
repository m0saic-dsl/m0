import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { setTileTypeByStableId } from "./setTileTypeByStableId";

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

describe("setTileTypeByStableId", () => {
  const m0 = "3(1,0,1)";

  test("changes a rendered tile to null by stableKey", () => {
    const key = getStableKey(m0, "frame", 0);
    expect(setTileTypeByStableId(m0, key, "-")).toBe("3(-,0,1)");
  });

  test("changes a passthrough to tile by stableKey", () => {
    const key = getStableKey(m0, "passthrough", 0);
    expect(setTileTypeByStableId(m0, key, "F")).toBe("3(1,1,1)");
  });

  test("changes first tile to passthrough by stableKey", () => {
    const key = getStableKey(m0, "frame", 0);
    expect(setTileTypeByStableId(m0, key, ">")).toBe("3(0,0,1)");
  });

  test("throws on unknown stableKey", () => {
    expect(() => setTileTypeByStableId(m0, "nonexistent/key", "-")).toThrow(
      /no node found/i,
    );
  });

  test("throws on invalid m0saic input", () => {
    expect(() => setTileTypeByStableId("((", "x", "-")).toThrow();
  });

  test("works with nested structure", () => {
    const nested = "2(1,2[1,1])";
    // Get the second tile inside the nested bracket split
    const key = getStableKey(nested, "frame", 2);
    const result = setTileTypeByStableId(nested, key, "-");
    expect(result).toBe("2(1,2[1,-])");
  });
});
