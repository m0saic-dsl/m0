import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { removeOverlayByStableId } from "./removeOverlayByStableId";

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

describe("removeOverlayByStableId", () => {
  test("removes overlay from a rendered frame by stableKey", () => {
    const m0 = "3(1{1},0,1)";
    const key = getStableKey(m0, "frame", 0);
    expect(removeOverlayByStableId(m0, key)).toBe("3(1,0,1)");
  });

  test("removes overlay from a passthrough by stableKey", () => {
    const m0 = "3(1,0{1},1)";
    const key = getStableKey(m0, "passthrough", 0);
    expect(removeOverlayByStableId(m0, key)).toBe("3(1,0,1)");
  });

  test("no-op when tile has no overlay", () => {
    const m0 = "3(1,0,1)";
    const key = getStableKey(m0, "frame", 0);
    expect(removeOverlayByStableId(m0, key)).toBe("3(1,0,1)");
  });

  test("removes overlay with nested content", () => {
    const m0 = "2(1{2(1,1)},1)";
    const key = getStableKey(m0, "frame", 0);
    expect(removeOverlayByStableId(m0, key)).toBe("2(1,1)");
  });

  test("throws on unknown stableKey", () => {
    expect(() => removeOverlayByStableId("3(1,0,1)", "nonexistent/key")).toThrow(
      /no node found/i,
    );
  });

  test("throws on invalid m0saic input", () => {
    expect(() => removeOverlayByStableId("((", "x")).toThrow();
  });

  test("works with nested structure", () => {
    const nested = "2(1,2[1,1{1}])";
    const key = getStableKey(nested, "frame", 2);
    expect(removeOverlayByStableId(nested, key)).toBe("2(1,2[1,1])");
  });
});
