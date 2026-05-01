import { validateLabels } from "./validateLabels";
import type { M0Label, StableKey } from "@m0saic/dsl";

const sk = (s: string) => s as StableKey;
const labelsOf = (entries: Array<[string, M0Label]>) =>
  Object.fromEntries(entries.map(([k, v]) => [k, v])) as Record<StableKey, M0Label>;

describe("validateLabels", () => {
  it("returns empty result when labels are null/undefined/empty", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    expect(validateLabels({ validStableKeys: validKeys, labels: null }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
    expect(validateLabels({ validStableKeys: validKeys, labels: undefined }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
    expect(validateLabels({ validStableKeys: validKeys, labels: {} as Record<StableKey, M0Label> }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
  });

  it("returns no issues when every label maps to a valid stableKey", () => {
    const validKeys = new Set<string>(["r/fc0", "r/fc1", "r/g0"]);
    const labels = labelsOf([
      [sk("r/fc0"), { text: "header" }],
      [sk("r/fc1"), { text: "body" }],
    ]);
    const result = validateLabels({ validStableKeys: validKeys, labels });
    expect(result.issues).toEqual([]);
    expect(result.hasError).toBe(false);
    expect(result.hasWarning).toBe(false);
  });

  it("flags labels whose stableKey is not in the valid set", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const labels = labelsOf([
      [sk("r/fc0"), { text: "header" }],
      [sk("r/fc1"), { text: "missing" }],
    ]);
    const result = validateLabels({ validStableKeys: validKeys, labels });
    expect(result.hasWarning).toBe(true);
    expect(result.hasError).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      level: "warning",
      code: "ORPHANED_LABEL",
      stableKey: "r/fc1",
      text: "missing",
    });
  });

  it("flags every orphan label, not just the first", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const labels = labelsOf([
      [sk("r/gone-1"), { text: "a" }],
      [sk("r/gone-2"), { text: "b" }],
      [sk("r/gone-3"), { text: "c" }],
      [sk("r/fc0"), { text: "kept" }],
    ]);
    const result = validateLabels({ validStableKeys: validKeys, labels });
    expect(result.issues).toHaveLength(3);
    expect(result.issues.map(i => i.text).sort()).toEqual(["a", "b", "c"]);
  });

  it("preserves the label text in the issue (used by tooltips)", () => {
    const validKeys = new Set<string>([]);
    const labels = labelsOf([[sk("r/x"), { text: "Special — Heading" }]]);
    const result = validateLabels({ validStableKeys: validKeys, labels });
    expect(result.issues[0].text).toBe("Special — Heading");
    expect(result.issues[0].message).toContain("Special — Heading");
  });
});
