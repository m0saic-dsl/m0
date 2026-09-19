import { validateInsets } from "./validateInsets";
import type { StableKey } from "@m0saic/dsl";
import type { M0cInset } from "../types";

const sk = (s: string) => s as StableKey;
const insetsOf = (entries: Array<[string, M0cInset]>) =>
  Object.fromEntries(entries.map(([k, v]) => [k, v])) as Record<StableKey, M0cInset>;

describe("validateInsets", () => {
  it("returns empty result when insets is null/undefined/empty", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    expect(validateInsets({ validStableKeys: validKeys, insets: null }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
    expect(validateInsets({ validStableKeys: validKeys, insets: undefined }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
    expect(validateInsets({ validStableKeys: validKeys, insets: {} as Record<StableKey, M0cInset> }))
      .toEqual({ issues: [], hasError: false, hasWarning: false });
  });

  it("returns no issues for in-range entries mapping to valid stableKeys", () => {
    const validKeys = new Set<string>(["r/fc0", "r/fc1"]);
    const insets = insetsOf([
      [sk("r/fc0"), { top: 0.02, right: 0.03, bottom: 0.02, left: 0.03 }],
      [sk("r/fc1"), { top: 0, right: 0.1, bottom: 0, left: 0.1 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    expect(result.issues).toEqual([]);
    expect(result.hasError).toBe(false);
    expect(result.hasWarning).toBe(false);
  });

  it("flags orphan stableKeys with ORPHANED_INSET", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const insets = insetsOf([
      [sk("r/fc0"), { top: 0.02, right: 0.02, bottom: 0.02, left: 0.02 }],
      [sk("r/gone"), { top: 0.02, right: 0.02, bottom: 0.02, left: 0.02 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    expect(result.hasWarning).toBe(true);
    expect(result.hasError).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      level: "warning",
      code: "ORPHANED_INSET",
      stableKey: "r/gone",
    });
  });

  it("flags a negative out-of-range edge in isolation (no axis collapse)", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    // A negative edge is out of range but keeps its axis sum < 1, so only
    // INSET_OUT_OF_RANGE fires (no collapse).
    const insets = insetsOf([
      [sk("r/fc0"), { top: 0.02, right: -0.1, bottom: 0.02, left: 0.02 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: "INSET_OUT_OF_RANGE",
      stableKey: "r/fc0",
      edge: "right",
      value: -0.1,
    });
  });

  it("a positive edge >= 1 fires BOTH out-of-range and axis collapse", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    // top = 1.2 is out of range AND (top + bottom = 1.22) collapses vertically —
    // both are correct; a single positive edge ≥ 1 always collapses its axis.
    const insets = insetsOf([
      [sk("r/fc0"), { top: 1.2, right: 0.02, bottom: 0.02, left: 0.02 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    const codes = result.issues.map(i => i.code).sort();
    expect(codes).toEqual(["INSET_COLLAPSES_FRAME", "INSET_OUT_OF_RANGE"]);
  });

  it("flags an axis that sums to >= 1 with INSET_COLLAPSES_FRAME", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    // left + right = 0.6 + 0.5 = 1.1 >= 1 → horizontal collapse; each edge is
    // still < 1 so no OUT_OF_RANGE fires.
    const insets = insetsOf([
      [sk("r/fc0"), { top: 0.1, right: 0.5, bottom: 0.1, left: 0.6 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: "INSET_COLLAPSES_FRAME",
      axis: "horizontal",
      sum: 1.1,
    });
  });

  it("flags both axes when both collapse", () => {
    const validKeys = new Set<string>(["r/fc0"]);
    const insets = insetsOf([
      [sk("r/fc0"), { top: 0.6, right: 0.6, bottom: 0.5, left: 0.5 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    const codes = result.issues.map(i => i.code).sort();
    expect(codes).toEqual(["INSET_COLLAPSES_FRAME", "INSET_COLLAPSES_FRAME"]);
    const axes = result.issues
      .filter((i): i is Extract<typeof i, { axis: string }> => i.code === "INSET_COLLAPSES_FRAME")
      .map(i => i.axis)
      .sort();
    expect(axes).toEqual(["horizontal", "vertical"]);
  });

  it("accumulates orphan + out-of-range for the same key", () => {
    const validKeys = new Set<string>([]);
    // Negative right edge keeps the horizontal axis sum < 1 (no collapse), so
    // exactly orphan + out-of-range accumulate.
    const insets = insetsOf([
      [sk("r/gone"), { top: 0.02, right: -0.5, bottom: 0.02, left: 0.02 }],
    ]);
    const result = validateInsets({ validStableKeys: validKeys, insets });
    const codes = result.issues.map(i => i.code).sort();
    expect(codes).toEqual(["INSET_OUT_OF_RANGE", "ORPHANED_INSET"]);
  });
});
