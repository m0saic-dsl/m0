import { parseM0StringComplete } from "../parse/m0StringParser";
import { computeFeasibility } from "./computeFeasibility";
import { getFrameCount } from "../complexity";

const BIG_H = 16384;
const BIG_W = 16384;

// ─────────────────────────────────────────────────────────────
// A) percent sparse layout — 100 non-zero children in horizontal split
//    Each leaf needs ≥1px, so minWidth = 100, minHeight = 1.
// ─────────────────────────────────────────────────────────────

describe("percent sparse layout", () => {
  const ones = Array(100).fill("1").join(",");
  const s = `100(${ones})`;

  it("is feasible at 500×500", () => {
    expect(parseM0StringComplete(s, 500, 500).ok).toBe(true);
  });

  it("has minWidthPx === 100 and minHeightPx === 1", () => {
    const { minWidthPx, minHeightPx } = computeFeasibility(s);
    expect(minWidthPx).toBe(100);
    expect(minHeightPx).toBe(1);
  });

  it("boundary: parse fails at (99, BIG_H) and succeeds at (100, BIG_H)", () => {
    expect(parseM0StringComplete(s, 99, BIG_H).ok).toBe(false);
    expect(parseM0StringComplete(s, 100, BIG_H).ok).toBe(true);
  });

  it("boundary: minHeightPx === 1 (no height-1 check needed)", () => {
    const { minHeightPx } = computeFeasibility(s);
    expect(minHeightPx).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// B) deep same-axis nesting with passthrough zeros
//    9 zeros donate all space to the last child, so the single
//    leaf at the deepest level always gets the full width.
//    minWidth = 1, minHeight = 1 regardless of depth.
// ─────────────────────────────────────────────────────────────

function deepSameAxis(depth: number): string {
  let inner = "1";
  for (let d = 0; d < depth; d++) {
    inner = `10(${Array(9).fill("0").join(",")},${inner})`;
  }
  return inner;
}

describe("deep same-axis nesting (passthrough zeros)", () => {
  const s = deepSameAxis(4);

  it("minWidthPx === 1 and minHeightPx === 1 for depth=4 (zeros donate all space)", () => {
    const { minWidthPx, minHeightPx } = computeFeasibility(s);
    expect(minWidthPx).toBe(1);
    expect(minHeightPx).toBe(1);
  });

  it("is feasible even at 1×1", () => {
    expect(parseM0StringComplete(s, 1, 1).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// C) overlays + nesting correctness (non-zero children)
//    Base split: 10 non-zero children. Last child owns an overlay
//    whose body is also a 10-split of non-zero children.
//    The overlay body must fit inside the last child's tile.
//    minWidth = 92 (outer split + remainder distribution → inner child
//    gets enough for its own 10-split), minHeight = 1.
// ─────────────────────────────────────────────────────────────

describe("overlays + nesting correctness", () => {
  const base = `10(${Array(9).fill("1").join(",")},1{10(${Array(9).fill("1").join(",")},1)})`;

  it("minWidthPx === 92 and minHeightPx === 1", () => {
    const { minWidthPx, minHeightPx } = computeFeasibility(base);
    expect(minWidthPx).toBe(92);
    expect(minHeightPx).toBe(1);
  });

  it("boundary: (91, BIG_H) fails, (92, BIG_H) succeeds", () => {
    expect(parseM0StringComplete(base, 91, BIG_H).ok).toBe(false);
    expect(parseM0StringComplete(base, 92, BIG_H).ok).toBe(true);
  });

  it("final pair parse(92, 1) succeeds", () => {
    expect(parseM0StringComplete(base, 92, 1).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// D2) deep same-axis nesting with all non-zero children
//     10(10(10(1*10),1*9),1*9) — 3-level nesting where every
//     child is a real leaf. Outer needs 10px, middle child 0
//     gets ~1/10th of that and itself needs 10px, etc.
//     Outside-in remainder distribution gives minWidth = 901.
// ─────────────────────────────────────────────────────────────

describe("deep same-axis nesting (non-zero children, depth=3)", () => {
  const s =
    "10(10(10(1,1,1,1,1,1,1,1,1,1),1,1,1,1,1,1,1,1,1),1,1,1,1,1,1,1,1,1)";

  it("minWidthPx === 901 and minHeightPx === 1", () => {
    const { minWidthPx, minHeightPx } = computeFeasibility(s);
    expect(minWidthPx).toBe(901);
    expect(minHeightPx).toBe(1);
  });

  it("boundary: (900, BIG_H) fails, (901, BIG_H) succeeds", () => {
    expect(parseM0StringComplete(s, 900, BIG_H).ok).toBe(false);
    expect(parseM0StringComplete(s, 901, BIG_H).ok).toBe(true);
  });

  it("has 28 source frames", () => {
    expect(getFrameCount(s)).toBe(28);
  });
});

// ─────────────────────────────────────────────────────────────
// E) fails at (min-1) and succeeds at (min)
// ─────────────────────────────────────────────────────────────

describe("fails at (min-1) and succeeds at (min)", () => {
  const testCases: { name: string; s: string }[] = [
    {
      name: "100 horizontal non-zero children",
      s: `100(${Array(100).fill("1").join(",")})`,
    },
    { name: "deep same-axis depth=4 (passthrough zeros)", s: deepSameAxis(4) },
    {
      name: "overlays + nesting (non-zero)",
      s: `10(${Array(9).fill("1").join(",")},1{10(${Array(9).fill("1").join(",")},1)})`,
    },
    {
      name: "3×3 grid",
      s: "3(3[1,1,1],3[1,1,1],3[1,1,1])",
    },
    {
      name: "deep same-axis non-zero depth=3",
      s: "10(10(10(1,1,1,1,1,1,1,1,1,1),1,1,1,1,1,1,1,1,1),1,1,1,1,1,1,1,1,1)",
    },
  ];

  for (const { name, s } of testCases) {
    it(`${name}: succeeds at min, fails at min-1`, () => {
      const { minWidthPx, minHeightPx } = computeFeasibility(s);

      expect(parseM0StringComplete(s, minWidthPx, minHeightPx).ok).toBe(
        true,
      );

      if (minWidthPx > 1) {
        expect(
          parseM0StringComplete(s, minWidthPx - 1, BIG_H).ok,
        ).toBe(false);
      }

      if (minHeightPx > 1) {
        expect(
          parseM0StringComplete(s, BIG_W, minHeightPx - 1).ok,
        ).toBe(false);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────
// Count test: overlay renders
// ─────────────────────────────────────────────────────────────

describe("getFrameCount with overlays", () => {
  it("1{1} has 2 source frames (base + overlay)", () => {
    const s = "1{1}";
    const { minWidthPx, minHeightPx } = computeFeasibility(s);
    expect(minWidthPx).toBe(1);
    expect(minHeightPx).toBe(1);
    expect(parseM0StringComplete(s, 1, 1).ok).toBe(true);
    expect(getFrameCount(s)).toBe(2);
  });
});
