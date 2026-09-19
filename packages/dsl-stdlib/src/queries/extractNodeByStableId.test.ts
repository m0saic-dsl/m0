import { parseM0StringToFullGraph } from "@m0saic/dsl";
import { extractNodeByStableId } from "./extractNodeByStableId";
import { replaceNodeByStableId } from "../transforms/primitives/replace/replaceNodeByStableId";

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

/** Helper: get the stableKey of the Nth frame of a kind inside an overlay namespace. */
function getOverlayStableKey(
  m0: string,
  kind: string,
  index: number,
): string {
  const frames = parseM0StringToFullGraph(m0, 1920, 1080);
  const matches = frames.filter(
    (f) => f.kind === kind && String(f.meta.stableKey).includes("/ov"),
  );
  if (index >= matches.length) throw new Error(`No overlay frame at index ${index}`);
  return String(matches[index].meta.stableKey);
}

describe("extractNodeByStableId", () => {
  // ── Leaves ──

  test("extracts a rendered leaf", () => {
    const m0 = "3(1,0,1)";
    const key = getStableKey(m0, "frame", 0);
    expect(extractNodeByStableId(m0, key)).toBe("1");
  });

  test("extracts a leaf with its attached overlay by default", () => {
    const m0 = "2(1{1},1)";
    const key = getStableKey(m0, "frame", 0);
    expect(extractNodeByStableId(m0, key)).toBe("1{1}");
  });

  test("extracts the leaf body alone with includeOverlay: false", () => {
    const m0 = "2(1{1},1)";
    const key = getStableKey(m0, "frame", 0);
    expect(extractNodeByStableId(m0, key, { includeOverlay: false })).toBe("1");
  });

  test("extracts a leaf with a nested overlay chain", () => {
    const m0 = "2(1{1{1}},1)";
    const key = getStableKey(m0, "frame", 0);
    expect(extractNodeByStableId(m0, key)).toBe("1{1{1}}");
  });

  // ── Groups ──

  test("extracts a nested group as a standalone m0", () => {
    const m0 = "2(1,2[1,1])";
    const key = getStableKey(m0, "group", 0);
    expect(extractNodeByStableId(m0, key)).toBe("2[1,1]");
  });

  test("extracts a nested group with its attached overlay", () => {
    const m0 = "2(2(1,1){1},1)";
    const key = getStableKey(m0, "group", 0);
    expect(extractNodeByStableId(m0, key)).toBe("2(1,1){1}");
  });

  test("extracts the root node as the whole string", () => {
    const m0 = "2(1,1)";
    const key = getStableKey(m0, "root", 0);
    expect(extractNodeByStableId(m0, key)).toBe("2(1,1)");
  });

  // ── Overlay-namespace targets ──

  test("extracts a node inside an overlay body", () => {
    const m0 = "2(1{2(1,1)},1)";
    const key = getOverlayStableKey(m0, "group", 0);
    expect(extractNodeByStableId(m0, key)).toBe("2(1,1)");
  });

  // ── Round-trip with replaceNodeByStableId ──

  test("extract + replace with overlay drop round-trips (leaf with overlay)", () => {
    const m0 = "2(1{1},1)";
    const key = getStableKey(m0, "frame", 0);
    const subtree = extractNodeByStableId(m0, key);
    expect(replaceNodeByStableId(m0, key, subtree, { overlay: "drop" })).toBe(m0);
  });

  test("extract + replace with overlay drop round-trips (group)", () => {
    const m0 = "2(1,2[1,1])";
    const key = getStableKey(m0, "group", 0);
    const subtree = extractNodeByStableId(m0, key);
    expect(replaceNodeByStableId(m0, key, subtree, { overlay: "drop" })).toBe(m0);
  });

  // ── Error cases ──

  test("throws on unknown stableKey", () => {
    expect(() => extractNodeByStableId("2(1,1)", "nonexistent/key")).toThrow(
      /no node found/i,
    );
  });

  test("throws on invalid m0saic input", () => {
    expect(() => extractNodeByStableId("((", "x")).toThrow();
  });

  test("throws when extracting a bare null (not a standalone m0)", () => {
    const m0 = "2(-,1)";
    const key = getStableKey(m0, "null", 0);
    expect(() => extractNodeByStableId(m0, key)).toThrow(/invalid/i);
  });

  test("throws when extracting a bare passthrough (donor is not a subtree)", () => {
    const m0 = "3(1,0,1)";
    const key = getStableKey(m0, "passthrough", 0);
    expect(() => extractNodeByStableId(m0, key)).toThrow(/invalid/i);
  });
});
