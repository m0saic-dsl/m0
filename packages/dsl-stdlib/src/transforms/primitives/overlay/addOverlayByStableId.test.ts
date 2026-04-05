import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { addOverlayByStableId } from "./addOverlayByStableId";

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

describe("addOverlayByStableId", () => {
  const m0 = "3(1,0,1)";

  test("adds overlay to a rendered frame by stableKey", () => {
    const key = getStableKey(m0, "frame", 0);
    expect(addOverlayByStableId(m0, key)).toBe("3(1{1},0,1)");
  });

  test("adds overlay to a passthrough by stableKey", () => {
    const key = getStableKey(m0, "passthrough", 0);
    expect(addOverlayByStableId(m0, key)).toBe("3(1,0{1},1)");
  });

  test("no-op when tile already has overlay", () => {
    const withOverlay = "3(1{1},0,1)";
    const key = getStableKey(withOverlay, "frame", 0);
    expect(addOverlayByStableId(withOverlay, key)).toBe("3(1{1},0,1)");
  });

  test("throws on unknown stableKey", () => {
    expect(() => addOverlayByStableId(m0, "nonexistent/key")).toThrow(
      /no node found/i,
    );
  });

  test("throws on invalid m0saic input", () => {
    expect(() => addOverlayByStableId("((", "x")).toThrow();
  });

  test("works with nested structure", () => {
    const nested = "2(1,2[1,1])";
    const key = getStableKey(nested, "frame", 2);
    const result = addOverlayByStableId(nested, key);
    expect(result).toBe("2(1,2[1,1{1}])");
  });
});
