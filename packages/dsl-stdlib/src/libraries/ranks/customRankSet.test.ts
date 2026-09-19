import { customRankSet, editRankSet } from "./customRankSet";
import { generateRankSet } from "./generateRankSet";
import type { RankFrame } from "./types";

describe("customRankSet", () => {
  test("packages caller ranks verbatim with default `custom` label", () => {
    const result = customRankSet([0, 0.25, 0.5, 0.75, 1]);
    expect(result).toEqual({ mode: "custom", ranks: [0, 0.25, 0.5, 0.75, 1] });
  });

  test("accepts a label override", () => {
    const result = customRankSet([0, 1], "my-special-order");
    expect(result.mode).toBe("my-special-order");
  });

  test("makes a defensive copy — input mutation doesn't affect output", () => {
    const input = [0, 0.5, 1];
    const result = customRankSet(input);
    input[0] = 999;
    expect(result.ranks).toEqual([0, 0.5, 1]);
  });

  test("rejects non-finite values", () => {
    expect(() => customRankSet([0, Number.NaN])).toThrow(/not a finite/);
    expect(() => customRankSet([0, Number.POSITIVE_INFINITY])).toThrow(/not a finite/);
  });

  test("accepts an empty array", () => {
    expect(customRankSet([])).toEqual({ mode: "custom", ranks: [] });
  });

  test("does NOT clamp or normalize — values like 1.5 pass through", () => {
    const result = customRankSet([0, 0.5, 1.5, -0.3]);
    expect(result.ranks).toEqual([0, 0.5, 1.5, -0.3]);
  });
});

describe("editRankSet", () => {
  const frames: RankFrame[] = [
    { x: 0, y: 0, width: 1, height: 1, logicalIndex: 0 },
    { x: 10, y: 0, width: 1, height: 1, logicalIndex: 1 },
    { x: 0, y: 10, width: 1, height: 1, logicalIndex: 2 },
    { x: 10, y: 10, width: 1, height: 1, logicalIndex: 3 },
  ];

  test("overrides specified indices, leaves others alone", () => {
    const base = generateRankSet(frames, "cascade");
    const edited = editRankSet(base, { 0: 0.42, 2: 0.99 });
    expect(edited.ranks[0]).toBe(0.42);
    expect(edited.ranks[1]).toBe(base.ranks[1]);
    expect(edited.ranks[2]).toBe(0.99);
    expect(edited.ranks[3]).toBe(base.ranks[3]);
  });

  test("default mode label is `custom` (signals 'derived from a built-in')", () => {
    const base = generateRankSet(frames, "diag");
    expect(editRankSet(base, { 0: 0.5 }).mode).toBe("custom");
  });

  test("accepts a custom mode label", () => {
    const base = generateRankSet(frames, "diag");
    expect(editRankSet(base, { 0: 0.5 }, "diag-tweaked").mode).toBe("diag-tweaked");
  });

  test("does not mutate the base", () => {
    const base = generateRankSet(frames, "cascade");
    const beforeRanks = [...base.ranks];
    editRankSet(base, { 0: 0.42 });
    expect(base.ranks).toEqual(beforeRanks);
  });

  test("empty edits returns a copy of base ranks with custom label", () => {
    const base = generateRankSet(frames, "diag");
    const edited = editRankSet(base, {});
    expect(edited.ranks).toEqual(base.ranks);
    expect(edited.mode).toBe("custom");
  });

  test("rejects out-of-range indices", () => {
    const base = generateRankSet(frames, "diag");
    expect(() => editRankSet(base, { 99: 0.5 })).toThrow(/out of range/);
    expect(() => editRankSet(base, { [-1]: 0.5 })).toThrow(/out of range/);
  });

  test("rejects non-finite values", () => {
    const base = generateRankSet(frames, "diag");
    expect(() => editRankSet(base, { 0: Number.NaN })).toThrow(/not finite/);
  });
});
