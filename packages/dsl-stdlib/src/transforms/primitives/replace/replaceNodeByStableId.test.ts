import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { replaceNodeByStableId } from "./replaceNodeByStableId";

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

describe("replaceNodeByStableId", () => {
  const m0 = "3(1,0,1)";

  test("replaces a rendered frame by stableKey", () => {
    const key = getStableKey(m0, "frame", 0);
    expect(replaceNodeByStableId(m0, key, "2(1,1)")).toBe("3(2(1,1),0,1)");
  });

  test("replaces second rendered frame by stableKey", () => {
    const key = getStableKey(m0, "frame", 1);
    expect(replaceNodeByStableId(m0, key, "2[1,1]")).toBe("3(1,0,2[1,1])");
  });

  test("replaces a passthrough by stableKey", () => {
    const key = getStableKey(m0, "passthrough", 0);
    expect(replaceNodeByStableId(m0, key, "1")).toBe("3(1,1,1)");
  });

  test("preserves overlay when replacing tile", () => {
    const withOverlay = "2(1{1},1)";
    const key = getStableKey(withOverlay, "frame", 0);
    expect(replaceNodeByStableId(withOverlay, key, "3(1,1,1)")).toBe(
      "2(3(1,1,1){1},1)",
    );
  });

  test("replaces root node", () => {
    const key = getStableKey("2(1,1)", "root", 0);
    expect(replaceNodeByStableId("2(1,1)", key, "3(1,1,1)")).toBe("3(1,1,1)");
  });

  test("replaces nested group by stableKey", () => {
    const nested = "2(1,2[1,1])";
    const key = getStableKey(nested, "group", 0);
    expect(replaceNodeByStableId(nested, key, "1")).toBe("2(1,1)");
  });

  test("replaces tile inside nested structure", () => {
    const nested = "2(1,2[1,1])";
    const key = getStableKey(nested, "frame", 2);
    expect(replaceNodeByStableId(nested, key, "3(1,1,1)")).toBe(
      "2(1,2[1,3(1,1,1)])",
    );
  });

  test("canonicalizes replacement (F → 1)", () => {
    const key = getStableKey(m0, "frame", 0);
    expect(replaceNodeByStableId(m0, key, "2(F,F)")).toBe("3(2(1,1),0,1)");
  });

  test("throws on unknown stableKey", () => {
    expect(() => replaceNodeByStableId(m0, "nonexistent/key", "1")).toThrow(
      /no node found/i,
    );
  });

  test("throws on invalid m0saic input", () => {
    expect(() => replaceNodeByStableId("((", "x", "1")).toThrow();
  });
});
