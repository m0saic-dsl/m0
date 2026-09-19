import { generateRankSet } from "./generateRankSet";
import type { RankFrame } from "./types";

function frame(
  x: number,
  y: number,
  width: number,
  height: number,
  logicalIndex: number,
): RankFrame {
  return { x, y, width, height, logicalIndex };
}

describe("generateRankSet — edge cases", () => {
  test("empty input → empty ranks, mode preserved", () => {
    expect(generateRankSet([], "diag")).toEqual({ mode: "diag", ranks: [] });
    expect(generateRankSet([], "cascade")).toEqual({ mode: "cascade", ranks: [] });
    expect(generateRankSet([], "radial")).toEqual({ mode: "radial", ranks: [] });
  });

  test("single frame → rank [0]", () => {
    expect(generateRankSet([frame(0, 0, 10, 10, 0)], "diag").ranks).toEqual([0]);
  });

  test("returned mode matches the requested mode", () => {
    const frames = [frame(0, 0, 1, 1, 0), frame(10, 10, 1, 1, 1)];
    expect(generateRankSet(frames, "diag").mode).toBe("diag");
    expect(generateRankSet(frames, "cascade").mode).toBe("cascade");
    expect(generateRankSet(frames, "radial").mode).toBe("radial");
  });

  test("ranks are aligned with input order — ranks[i] is for frames[i]", () => {
    // Frame at (10, 10) is farther diagonally than (0, 0) → gets higher rank.
    // Input order is reverse of diagonal: rank for index 0 should be 1.0.
    const frames = [frame(10, 10, 1, 1, 0), frame(0, 0, 1, 1, 1)];
    const { ranks } = generateRankSet(frames, "diag");
    expect(ranks[0]).toBe(1);
    expect(ranks[1]).toBe(0);
  });
});

describe("generateRankSet — diag (parity with qr-animate v1 buildDiagonalRanks)", () => {
  // Cross-checked against `packages/templates/src/m0saic/brand/qr-animate/v1/expressions.ts`:
  // sort by (x + y), tie-break by x, then by logicalIndex; assign pos / (n - 1).
  test("3 frames on the same diagonal: tie-break by x", () => {
    const frames = [
      frame(0, 6, 1, 1, 0),  // x+y=6, x=0
      frame(3, 3, 1, 1, 1),  // x+y=6, x=3
      frame(6, 0, 1, 1, 2),  // x+y=6, x=6
    ];
    const { ranks } = generateRankSet(frames, "diag");
    // All three are on the (x+y=6) diagonal; tie-broken by x ascending:
    //   frames[0] (x=0) → rank 0
    //   frames[1] (x=3) → rank 0.5
    //   frames[2] (x=6) → rank 1
    expect(ranks).toEqual([0, 0.5, 1]);
  });

  test("uniform grid: diagonal sweep matches the textbook (x+y) ordering", () => {
    // 3×3 grid of frames, 10-unit spacing, in row-major input order.
    const frames: RankFrame[] = [];
    let idx = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        frames.push(frame(c * 10, r * 10, 5, 5, idx++));
      }
    }
    const { ranks } = generateRankSet(frames, "diag");
    // Sort by (x+y), tie-break by x, then logicalIndex. The sorted order:
    //   (0,0)[idx 0]   x+y=0
    //   (0,10)[idx 3]  x+y=10, x=0
    //   (10,0)[idx 1]  x+y=10, x=10
    //   (0,20)[idx 6]  x+y=20, x=0
    //   (10,10)[idx 4] x+y=20, x=10
    //   (20,0)[idx 2]  x+y=20, x=20
    //   (10,20)[idx 7] x+y=30, x=10
    //   (20,10)[idx 5] x+y=30, x=20
    //   (20,20)[idx 8] x+y=40
    // Ranks scattered back to input positions:
    //   ranks[0]=0/8, ranks[3]=1/8, ranks[1]=2/8, ranks[6]=3/8,
    //   ranks[4]=4/8, ranks[2]=5/8, ranks[7]=6/8, ranks[5]=7/8, ranks[8]=1
    expect(ranks).toEqual([0, 2 / 8, 5 / 8, 1 / 8, 4 / 8, 7 / 8, 3 / 8, 6 / 8, 1]);
  });
});

describe("generateRankSet — cascade (row-major)", () => {
  test("frames sorted by (y, x, logicalIndex) ascending", () => {
    const frames: RankFrame[] = [
      frame(20, 0, 5, 5, 0),   // y=0, x=20
      frame(0, 0, 5, 5, 1),    // y=0, x=0  → first
      frame(10, 0, 5, 5, 2),   // y=0, x=10
      frame(0, 10, 5, 5, 3),   // y=10, x=0
    ];
    const { ranks } = generateRankSet(frames, "cascade");
    // Sorted order by (y, x): frames[1] (0,0), frames[2] (10,0), frames[0] (20,0), frames[3] (0,10).
    // Ranks scattered back: ranks[1]=0, ranks[2]=1/3, ranks[0]=2/3, ranks[3]=1.
    expect(ranks).toEqual([2 / 3, 0, 1 / 3, 1]);
  });

  test("uniform 3x3 grid: rank order matches row-major input order exactly", () => {
    const frames: RankFrame[] = [];
    let idx = 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        frames.push(frame(c * 10, r * 10, 5, 5, idx++));
      }
    }
    const { ranks } = generateRankSet(frames, "cascade");
    // Input is already in row-major order → ranks are 0, 1/8, 2/8, ..., 8/8.
    for (let i = 0; i < 9; i++) {
      expect(ranks[i]).toBeCloseTo(i / 8, 6);
    }
  });
});

describe("generateRankSet — radial", () => {
  test("frames closer to the bbox center get lower ranks", () => {
    // 4 frames at the corners of a 100×100 area, plus one at the center.
    const frames: RankFrame[] = [
      frame(0, 0, 10, 10, 0),       // corner
      frame(90, 0, 10, 10, 1),      // corner
      frame(0, 90, 10, 10, 2),      // corner
      frame(90, 90, 10, 10, 3),     // corner
      frame(45, 45, 10, 10, 4),     // center
    ];
    const { ranks } = generateRankSet(frames, "radial");
    // The center frame should have the lowest rank (0).
    expect(ranks[4]).toBe(0);
    // All four corner frames are equidistant from the center → they tie,
    // and tie-break by logicalIndex puts them in input order. Their ranks
    // should be 0.25, 0.5, 0.75, 1.0 (in any internal order — what matters
    // is the center gets 0).
    const cornerRanks = [ranks[0], ranks[1], ranks[2], ranks[3]].sort((a, b) => a - b);
    expect(cornerRanks).toEqual([0.25, 0.5, 0.75, 1]);
  });

  test("explicit radialCenter override changes the ordering", () => {
    const frames: RankFrame[] = [
      frame(0, 0, 1, 1, 0),
      frame(100, 100, 1, 1, 1),
    ];
    // Default center is (50.5, 50.5) — equidistant → tie-break by logicalIndex.
    const def = generateRankSet(frames, "radial");
    // Force center at the second frame's location → frames[1] is closest → rank 0.
    const overridden = generateRankSet(frames, "radial", {
      radialCenter: { x: 100, y: 100 },
    });
    expect(overridden.ranks[1]).toBe(0);
    expect(overridden.ranks[0]).toBe(1);
    // Defaults differ from override — sanity check.
    expect(def.ranks).not.toEqual(overridden.ranks);
  });
});

describe("generateRankSet — determinism", () => {
  test("identical input twice → byte-identical ranks across all three modes", () => {
    const frames: RankFrame[] = [
      frame(0, 0, 1, 1, 0),
      frame(10, 5, 1, 1, 1),
      frame(5, 10, 1, 1, 2),
      frame(7, 7, 1, 1, 3),
    ];
    for (const mode of ["diag", "cascade", "radial"] as const) {
      const a = generateRankSet(frames, mode);
      const b = generateRankSet(frames, mode);
      expect(a).toEqual(b);
    }
  });
});
