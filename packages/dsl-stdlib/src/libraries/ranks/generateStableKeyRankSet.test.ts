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

describe("generateStableKeyRankSet — edge cases", () => {
  test("empty input → empty ranks record, mode preserved", () => {
    expect(generateStableKeyRankSet([], "diag")).toEqual({ mode: "diag", ranks: {} });
    expect(generateStableKeyRankSet([], "cascade")).toEqual({ mode: "cascade", ranks: {} });
    expect(generateStableKeyRankSet([], "radial")).toEqual({ mode: "radial", ranks: {} });
  });

  test("single frame → rank { [k]: 0 }", () => {
    expect(generateStableKeyRankSet([frame(0, 0, 10, 10, 0, "k/0")], "diag").ranks).toEqual({
      "k/0": 0,
    });
  });

  test("returned mode matches the requested mode", () => {
    const frames = [frame(0, 0, 1, 1, 0, "k/0"), frame(10, 10, 1, 1, 1, "k/1")];
    expect(generateStableKeyRankSet(frames, "diag").mode).toBe("diag");
    expect(generateStableKeyRankSet(frames, "cascade").mode).toBe("cascade");
    expect(generateStableKeyRankSet(frames, "radial").mode).toBe("radial");
  });

  test("rank values key by stableKey, not by input position", () => {
    // Frame at (10, 10) is farther diagonally than (0, 0) → gets rank 1.
    const frames = [frame(10, 10, 1, 1, 0, "far"), frame(0, 0, 1, 1, 1, "near")];
    const { ranks } = generateStableKeyRankSet(frames, "diag");
    expect(ranks["near"]).toBe(0);
    expect(ranks["far"]).toBe(1);
  });
});

describe("generateStableKeyRankSet — diag parity with positional builder", () => {
  test("3 frames on the same diagonal: tie-break by x", () => {
    const frames = [
      frame(0, 6, 1, 1, 0, "k/a"),
      frame(3, 3, 1, 1, 1, "k/b"),
      frame(6, 0, 1, 1, 2, "k/c"),
    ];
    const { ranks } = generateStableKeyRankSet(frames, "diag");
    // All three on the (x+y=6) diagonal; tie-broken by x ascending:
    //   frames[0] (x=0) → rank 0
    //   frames[1] (x=3) → rank 0.5
    //   frames[2] (x=6) → rank 1
    expect(ranks).toEqual({ "k/a": 0, "k/b": 0.5, "k/c": 1 });
  });
});

describe("generateStableKeyRankSet — cascade", () => {
  test("frames sorted by (y, x, logicalIndex) ascending", () => {
    const frames: RankFrame[] = [
      frame(20, 0, 5, 5, 0, "k/0"),  // y=0, x=20
      frame(0, 0, 5, 5, 1, "k/1"),   // y=0, x=0  → first
      frame(10, 0, 5, 5, 2, "k/2"),  // y=0, x=10
      frame(0, 10, 5, 5, 3, "k/3"),  // y=10, x=0
    ];
    const { ranks } = generateStableKeyRankSet(frames, "cascade");
    // Sorted: k/1 (0,0), k/2 (10,0), k/0 (20,0), k/3 (0,10)
    expect(ranks["k/1"]).toBe(0);
    expect(ranks["k/2"]).toBeCloseTo(1 / 3, 6);
    expect(ranks["k/0"]).toBeCloseTo(2 / 3, 6);
    expect(ranks["k/3"]).toBe(1);
  });
});

describe("generateStableKeyRankSet — radial", () => {
  test("frames closer to bbox center get lower ranks", () => {
    const frames: RankFrame[] = [
      frame(0, 0, 10, 10, 0, "tl"),
      frame(90, 0, 10, 10, 1, "tr"),
      frame(0, 90, 10, 10, 2, "bl"),
      frame(90, 90, 10, 10, 3, "br"),
      frame(45, 45, 10, 10, 4, "center"),
    ];
    const { ranks } = generateStableKeyRankSet(frames, "radial");
    expect(ranks["center"]).toBe(0);
    // generateStableKeyRankSet only emits numeric ranks (no nulls), so the
    // ranks at known stableKeys are all numbers. Narrow via `Number()` so
    // TS is happy with the subtraction in the sort comparator.
    const cornerRanks = (
      [ranks["tl"], ranks["tr"], ranks["bl"], ranks["br"]] as number[]
    ).sort((a, b) => a - b);
    expect(cornerRanks).toEqual([0.25, 0.5, 0.75, 1]);
  });

  test("explicit radialCenter override changes the ordering", () => {
    const frames: RankFrame[] = [
      frame(0, 0, 1, 1, 0, "k/0"),
      frame(100, 100, 1, 1, 1, "k/1"),
    ];
    const overridden = generateStableKeyRankSet(frames, "radial", {
      radialCenter: { x: 100, y: 100 },
    });
    expect(overridden.ranks["k/1"]).toBe(0);
    expect(overridden.ranks["k/0"]).toBe(1);
  });
});

describe("generateStableKeyRankSet — validation", () => {
  test("throws when a frame is missing stableKey", () => {
    const frames = [
      { x: 0, y: 0, width: 1, height: 1, logicalIndex: 0 } as RankFrame,
      frame(10, 10, 1, 1, 1, "k/1"),
    ];
    expect(() => generateStableKeyRankSet(frames, "diag")).toThrow(/missing a stableKey/);
  });

  test("throws when frame has empty-string stableKey", () => {
    const frames = [frame(0, 0, 1, 1, 0, ""), frame(10, 10, 1, 1, 1, "k/1")];
    expect(() => generateStableKeyRankSet(frames, "diag")).toThrow(/missing a stableKey/);
  });

  test("throws on duplicate stableKeys (output would silently collapse)", () => {
    const frames = [
      frame(0, 0, 1, 1, 0, "dup"),
      frame(10, 10, 1, 1, 1, "dup"),
    ];
    expect(() => generateStableKeyRankSet(frames, "diag")).toThrow(/duplicate stableKey/);
  });

  test("single-frame input still requires stableKey", () => {
    const frames = [{ x: 0, y: 0, width: 1, height: 1, logicalIndex: 0 } as RankFrame];
    expect(() => generateStableKeyRankSet(frames, "diag")).toThrow(/missing a stableKey/);
  });
});

describe("generateStableKeyRankSet — determinism", () => {
  test("identical input twice → byte-identical output across all three modes", () => {
    const frames: RankFrame[] = [
      frame(0, 0, 1, 1, 0, "k/0"),
      frame(10, 5, 1, 1, 1, "k/1"),
      frame(5, 10, 1, 1, 2, "k/2"),
      frame(7, 7, 1, 1, 3, "k/3"),
    ];
    for (const mode of ["diag", "cascade", "radial"] as const) {
      const a = generateStableKeyRankSet(frames, mode);
      const b = generateStableKeyRankSet(frames, mode);
      expect(a).toEqual(b);
    }
  });
});
