import { customStableKeyRankSet, editStableKeyRankSet } from "./customStableKeyRankSet";
import { generateStableKeyRankSet } from "./generateStableKeyRankSet";
import type { RankFrame } from "./types";
import type { StableKey } from "@m0saic/dsl";

const sk = (s: string) => s as unknown as StableKey;

function frame(
  x: number,
  y: number,
  width: number,
  height: number,
  logicalIndex: number,
  stableKey: string,
): RankFrame {
  return { x, y, width, height, logicalIndex, stableKey: sk(stableKey) };
}

describe("customStableKeyRankSet", () => {
  test("packages caller ranks verbatim with default `custom` label", () => {
    const result = customStableKeyRankSet({ "k/0": 0, "k/1": 0.5, "k/2": 1 });
    expect(result).toEqual({
      mode: "custom",
      ranks: { "k/0": 0, "k/1": 0.5, "k/2": 1 },
    });
  });

  test("accepts a label override", () => {
    expect(customStableKeyRankSet({ "k/0": 0 }, "my-special-order").mode).toBe(
      "my-special-order",
    );
  });

  test("preserves explicit null entries verbatim", () => {
    const result = customStableKeyRankSet({ "k/0": 0.5, "k/1": null, "k/2": 1 });
    expect(result.ranks).toEqual({ "k/0": 0.5, "k/1": null, "k/2": 1 });
  });

  test("rejects non-finite numeric values", () => {
    expect(() => customStableKeyRankSet({ "k/0": Number.NaN })).toThrow(/finite number or null/);
    expect(() =>
      customStableKeyRankSet({ "k/0": Number.POSITIVE_INFINITY }),
    ).toThrow(/finite number or null/);
  });

  test("rejects non-numeric values", () => {
    expect(() =>
      customStableKeyRankSet({ "k/0": "0.5" as unknown as number }),
    ).toThrow(/finite number or null/);
  });

  test("rejects empty-string keys", () => {
    expect(() => customStableKeyRankSet({ "": 0 })).toThrow(/empty stableKey/);
  });

  test("accepts an empty object", () => {
    expect(customStableKeyRankSet({})).toEqual({ mode: "custom", ranks: {} });
  });

  test("does NOT clamp or normalize — out-of-range values pass through", () => {
    const result = customStableKeyRankSet({ "k/0": 1.5, "k/1": -0.3 });
    expect(result.ranks).toEqual({ "k/0": 1.5, "k/1": -0.3 });
  });
});

describe("editStableKeyRankSet", () => {
  const frames: RankFrame[] = [
    frame(0, 0, 1, 1, 0, "k/0"),
    frame(10, 0, 1, 1, 1, "k/1"),
    frame(0, 10, 1, 1, 2, "k/2"),
    frame(10, 10, 1, 1, 3, "k/3"),
  ];

  test("overrides specified stableKeys, leaves others alone", () => {
    const base = generateStableKeyRankSet(frames, "cascade");
    const edited = editStableKeyRankSet(base, { "k/0": 0.42, "k/2": 0.99 });
    expect(edited.ranks["k/0"]).toBe(0.42);
    expect(edited.ranks["k/1"]).toBe(base.ranks["k/1"]);
    expect(edited.ranks["k/2"]).toBe(0.99);
    expect(edited.ranks["k/3"]).toBe(base.ranks["k/3"]);
  });

  test("default mode label is `custom`", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    expect(editStableKeyRankSet(base, { "k/0": 0.5 }).mode).toBe("custom");
  });

  test("accepts a custom mode label", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    expect(
      editStableKeyRankSet(base, { "k/0": 0.5 }, "diag-tweaked").mode,
    ).toBe("diag-tweaked");
  });

  test("does not mutate the base", () => {
    const base = generateStableKeyRankSet(frames, "cascade");
    const before = { ...base.ranks };
    editStableKeyRankSet(base, { "k/0": 0.42 });
    expect(base.ranks).toEqual(before);
  });

  test("empty edits returns a copy of base ranks with custom label", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    const edited = editStableKeyRankSet(base, {});
    expect(edited.ranks).toEqual(base.ranks);
    expect(edited.mode).toBe("custom");
  });

  test("accepts an explicit null edit (sets the frame to 'no rank')", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    const edited = editStableKeyRankSet(base, { "k/0": null });
    expect(edited.ranks["k/0"]).toBeNull();
  });

  test("rejects edit stableKeys that don't exist in base.ranks", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    expect(() => editStableKeyRankSet(base, { "unknown": 0.5 })).toThrow(
      /not present in base\.ranks/,
    );
  });

  test("rejects non-finite numeric edit values", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    expect(() => editStableKeyRankSet(base, { "k/0": Number.NaN })).toThrow(
      /not finite/,
    );
  });

  test("rejects empty-string edit keys", () => {
    const base = generateStableKeyRankSet(frames, "diag");
    expect(() => editStableKeyRankSet(base, { "": 0 })).toThrow(/empty stableKey/);
  });
});
