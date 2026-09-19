import { validateFill } from "./validateFill";
import type { StableKey } from "@m0saic/dsl";
import type { M0cFill } from "../types";

const sk = (s: string) => s as StableKey;
const fillOf = (entries: Array<[string, M0cFill]>) =>
  Object.fromEntries(entries.map(([k, v]) => [k, v])) as Record<StableKey, M0cFill>;

describe("validateFill", () => {
  it("returns empty result when fill is null/undefined/empty", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    expect(validateFill({ validStableKeys: validKeys, fill: null }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
    expect(validateFill({ validStableKeys: validKeys, fill: undefined }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
    expect(validateFill({ validStableKeys: validKeys, fill: {} as Record<StableKey, M0cFill> }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
  });

  it("returns no issues when every fill entry maps to a valid stableKey and color is valid hex", () => {
    const validKeys = new Set<string>(["r/fc0", "r/fc1"]);
    const fill = fillOf([
      [sk("r/fc0"), { color: "#ef7525" }],
      [sk("r/fc1"), { color: "#bcd6e8ff" }],
    ]);
    const result = validateFill({ validStableKeys: validKeys, fill });
    expect(result.issues).toEqual([]);
    expect(result.hasError).toBe(false);
    expect(result.hasWarning).toBe(false);
  });

  it("flags orphan stableKeys with ORPHANED_FILL", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const fill = fillOf([
      [sk("r/fc0"), { color: "#ef7525" }],
      [sk("r/gone"), { color: "#ffffff" }],
    ]);
    const result = validateFill({ validStableKeys: validKeys, fill });
    expect(result.hasWarning).toBe(true);
    expect(result.hasError).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      level: "warning",
      code: "ORPHANED_FILL",
      stableKey: "r/gone",
    });
  });

  it("flags malformed hex colors with INVALID_FILL_COLOR", () => {
    const validKeys = new Set<string>(["r/fc0", "r/fc1", "r/fc2"]);
    const fill = fillOf([
      [sk("r/fc0"), { color: "#ef7525" }],            // valid 6-digit
      [sk("r/fc1"), { color: "red" }],                // invalid — named color
      [sk("r/fc2"), { color: "#abc" }],               // invalid — 3-digit not supported
    ]);
    const result = validateFill({ validStableKeys: validKeys, fill });
    expect(result.issues).toHaveLength(2);
    const codes = result.issues.map(i => i.code).sort();
    expect(codes).toEqual(["INVALID_FILL_COLOR", "INVALID_FILL_COLOR"]);
  });

  it("does not flag missing color when mediaRef is present", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const fill = fillOf([
      [sk("r/fc0"), { mediaRef: "avatar.png" }],
    ]);
    const result = validateFill({ validStableKeys: validKeys, fill });
    expect(result.issues).toEqual([]);
  });

  it("accumulates both ORPHANED_FILL and INVALID_FILL_COLOR for the same key", () => {
    const validKeys = new Set<string>([]);
    const fill = fillOf([[sk("r/gone"), { color: "not-a-color" }]]);
    const result = validateFill({ validStableKeys: validKeys, fill });
    expect(result.issues).toHaveLength(2);
    const codes = result.issues.map(i => i.code).sort();
    expect(codes).toEqual(["INVALID_FILL_COLOR", "ORPHANED_FILL"]);
  });

  it("accepts 8-digit hex (with alpha)", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const fill = fillOf([[sk("r/fc0"), { color: "#ef752580" }]]);
    const result = validateFill({ validStableKeys: validKeys, fill });
    expect(result.issues).toEqual([]);
  });
});
