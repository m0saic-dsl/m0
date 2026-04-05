test("testOutsideInRemainder", () => {
    expect(true).toBe(true);
});// fractionalRemainderOutsideIn.test.ts
// Defines the canonical “outside-in” remainder distribution rule for m0saic splits
// and locks down key edge cases (odd/even remainder, null tiles consuming space,
// horizontal + vertical splits, and deep nesting).

import { parseM0StringTestRunner } from "./m0StringParser"; // adjust import path if needed

function expectLogicalOrderToMatchArrayIndex(frames: any[]) {
  const rendered = frames.filter((f) => !f.nullRender);
  rendered.forEach((f, i) => {
    expect(f.logicalOrder).toBe(i);
  });
}

/**
 * Outside-in remainder distribution:
 * base = floor(total/n), rem = total - base*n
 * Give +1 pixels to indices: 0, n-1, 1, n-2, 2, n-3, ...
 * So if rem is odd, the “extra side” is always the left/top end.
 */
function outsideInSizes(total: number, n: number): number[] {
  if (n <= 0) throw new Error(`invalid n: ${n}`);
  const base = Math.floor(total / n);
  const rem = total - base * n;

  const sizes = new Array(n).fill(base);

  // outside-in index order: 0, n-1, 1, n-2, 2, ...
  const order: number[] = [];
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    const left = i;
    const right = n - 1 - i;
    order.push(left);
    if (right !== left) order.push(right);
  }

  for (let k = 0; k < rem; k++) {
    sizes[order[k]] += 1;
  }

  // sanity
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (sum !== total) throw new Error(`sizes do not sum: ${sum} != ${total}`);
  return sizes;
}

function prefixStarts(sizes: number[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const s of sizes) {
    starts.push(acc);
    acc += s;
  }
  return starts;
}

/**
 * Helper for asserting a frame’s rect.
 * (We keep explicit expects rather than deep equality so failures are more readable.)
 */
function expectRect(
  f: any,
  rect: { x: number; y: number; width: number; height: number }
) {
  expect(f.x).toBe(rect.x);
  expect(f.y).toBe(rect.y);
  expect(f.width).toBe(rect.width);
  expect(f.height).toBe(rect.height);
}

describe("fractional remainder distribution — outside-in policy", () => {
  describe("horizontal splits (columns) basic behavior", () => {
    test("n=1: consumes full width (no remainder logic)", () => {
      const f = parseM0StringTestRunner("1", 101, 50, "LOGICAL");
      expect(f.length).toBe(1);
      expectRect(f[0], { x: 0, y: 0, width: 101, height: 50 });
      expectLogicalOrderToMatchArrayIndex(f);
    });

    test("n=2, odd remainder: extra pixel goes to left end", () => {
      // 101 / 2 => [51,50]
      const f = parseM0StringTestRunner("2(1,1)", 101, 10, "LOGICAL");
      expect(f.length).toBe(2);

      const sizes = outsideInSizes(101, 2); // [51,50]
      const xs = prefixStarts(sizes);

      expectRect(f[0], { x: xs[0], y: 0, width: sizes[0], height: 10 });
      expectRect(f[1], { x: xs[1], y: 0, width: sizes[1], height: 10 });

      expectLogicalOrderToMatchArrayIndex(f);
    });

    test("n=3, odd remainder: only leftmost gets +1", () => {
      // 100 / 3 => base 33 rem 1 => [34,33,33]
      const f = parseM0StringTestRunner("3(1,1,1)", 100, 10, "LOGICAL");
      expect(f.length).toBe(3);

      const sizes = outsideInSizes(100, 3); // [34,33,33]
      const xs = prefixStarts(sizes);

      expectRect(f[0], { x: xs[0], y: 0, width: sizes[0], height: 10 });
      expectRect(f[1], { x: xs[1], y: 0, width: sizes[1], height: 10 });
      expectRect(f[2], { x: xs[2], y: 0, width: sizes[2], height: 10 });

      expectLogicalOrderToMatchArrayIndex(f);
    });

    test("n=4, even remainder: distributed to both ends (0 and last)", () => {
      // 102 / 4 => base 25 rem 2 => [26,25,25,26]
      const f = parseM0StringTestRunner("4(1,1,1,1)", 102, 10, "LOGICAL");
      expect(f.length).toBe(4);

      const sizes = outsideInSizes(102, 4); // [26,25,25,26]
      const xs = prefixStarts(sizes);

      expectRect(f[0], { x: xs[0], y: 0, width: sizes[0], height: 10 });
      expectRect(f[1], { x: xs[1], y: 0, width: sizes[1], height: 10 });
      expectRect(f[2], { x: xs[2], y: 0, width: sizes[2], height: 10 });
      expectRect(f[3], { x: xs[3], y: 0, width: sizes[3], height: 10 });

      expectLogicalOrderToMatchArrayIndex(f);
    });

    test("n=4, remainder=3: outside-in order is 0, last, 1", () => {
      // 103 / 4 => base 25 rem 3 => [26,26,25,26]
      const f = parseM0StringTestRunner("4(1,1,1,1)", 103, 10, "LOGICAL");
      expect(f.length).toBe(4);

      const sizes = outsideInSizes(103, 4); // [26,26,25,26]
      const xs = prefixStarts(sizes);

      expectRect(f[0], { x: xs[0], y: 0, width: sizes[0], height: 10 });
      expectRect(f[1], { x: xs[1], y: 0, width: sizes[1], height: 10 });
      expectRect(f[2], { x: xs[2], y: 0, width: sizes[2], height: 10 });
      expectRect(f[3], { x: xs[3], y: 0, width: sizes[3], height: 10 });

      expectLogicalOrderToMatchArrayIndex(f);
    });
  });

  describe("null tiles consume space but do not render", () => {
    test("horizontal: '-'' at both ends still affects x for rendered children", () => {
      // 102 / 4 => [26,25,25,26]
      // layout: 4(-,1,1,-) => only two rendered frames, but their x positions must
      // account for the leading '-' width.
      const f = parseM0StringTestRunner("4(-,1,1,-)", 102, 10, "LOGICAL");
      // Only the two middle '1' tiles render
      expect(f.length).toBe(2);

      const sizes = outsideInSizes(102, 4); // [26,25,25,26]
      const xs = prefixStarts(sizes);

      // rendered child indices are 1 and 2
      expectRect(f[0], { x: xs[1], y: 0, width: sizes[1], height: 10 });
      expectRect(f[1], { x: xs[2], y: 0, width: sizes[2], height: 10 });

      expectLogicalOrderToMatchArrayIndex(f);
    });
  });

  describe("vertical splits (rows) mirror the same policy on y/height", () => {
    test("n=3 vertical: 100 height -> [34,33,33] on y", () => {
      const f = parseM0StringTestRunner("3[1,1,1]", 10, 100, "LOGICAL");
      expect(f.length).toBe(3);

      const sizes = outsideInSizes(100, 3); // [34,33,33]
      const ys = prefixStarts(sizes);

      expectRect(f[0], { x: 0, y: ys[0], width: 10, height: sizes[0] });
      expectRect(f[1], { x: 0, y: ys[1], width: 10, height: sizes[1] });
      expectRect(f[2], { x: 0, y: ys[2], width: 10, height: sizes[2] });

      expectLogicalOrderToMatchArrayIndex(f);
    });

    test("vertical null consumption: 4[-,1,1,-] accounts for top '-' height", () => {
      // 102 / 4 => [26,25,25,26]
      const f = parseM0StringTestRunner("4[-,1,1,-]", 10, 102, "LOGICAL");
      expect(f.length).toBe(2);

      const sizes = outsideInSizes(102, 4); // [26,25,25,26]
      const ys = prefixStarts(sizes);

      // rendered child indices are 1 and 2
      expectRect(f[0], { x: 0, y: ys[1], width: 10, height: sizes[1] });
      expectRect(f[1], { x: 0, y: ys[2], width: 10, height: sizes[2] });

      expectLogicalOrderToMatchArrayIndex(f);
    });
  });

  describe("deep nesting: symmetric rounding prevents directional drift", () => {
    test("nested: 3(3[1,1,1],1,1) with 100x100 uses outside-in at each level", () => {
      // Outer: width 100 split into 3 cols => [34,33,33]
      // Inner (col0): height 100 split into 3 rows => [34,33,33]
      // Total rendered leaves: 3 (from inner) + 1 + 1 = 5
      const f = parseM0StringTestRunner("3(3[1,1,1],1,1)", 100, 100, "LOGICAL");
      expect(f.length).toBe(5);

      const colW = outsideInSizes(100, 3); // [34,33,33]
      const colX = prefixStarts(colW);     // [0,34,67]
      const rowH = outsideInSizes(100, 3); // [34,33,33]
      const rowY = prefixStarts(rowH);     // [0,34,67]

      // Frames in logical order should be:
      // - inner col0 rows top->bottom (3 frames)
      // - then col1 (1 frame)
      // - then col2 (1 frame)
      expectRect(f[0], { x: colX[0], y: rowY[0], width: colW[0], height: rowH[0] });
      expectRect(f[1], { x: colX[0], y: rowY[1], width: colW[0], height: rowH[1] });
      expectRect(f[2], { x: colX[0], y: rowY[2], width: colW[0], height: rowH[2] });

      expectRect(f[3], { x: colX[1], y: 0, width: colW[1], height: 100 });
      expectRect(f[4], { x: colX[2], y: 0, width: colW[2], height: 100 });

      expectLogicalOrderToMatchArrayIndex(f);
    });
  });

  describe("regression: your original 7-child case rewritten for outside-in", () => {
    test("7(-,2[1,1],2[1,1],1,-,-,-) @ 1080x720 (LOGICAL)", () => {
      const testStr = "7(-,2[1,1],2[1,1],1,-,-,-)";
      const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
      expect(f.length).toBe(5);

      // 1080 / 7 => base 154 rem 2 => [155,154,154,154,154,154,155]
      const colW = outsideInSizes(1080, 7);
      const colX = prefixStarts(colW);

      // child0 '-' consumes colW[0]=155, so first real child starts at x=155
      // child1 is 2[1,1] => two 360px rows
      // child2 is 2[1,1] => two 360px rows
      // child3 is 1 => full height 720
      // children 4,5,6 are '-' => no render, but still consume width (esp child6=155)

      const [f1, f2, f3, f4, f5] = f;

      // child1 @ x = colX[1], width = colW[1] = 154
      expectRect(f1, { x: colX[1], y: 0,   width: colW[1], height: 360 });
      expectRect(f2, { x: colX[1], y: 360, width: colW[1], height: 360 });

      // child2 @ x = colX[2], width = colW[2] = 154
      expectRect(f3, { x: colX[2], y: 0,   width: colW[2], height: 360 });
      expectRect(f4, { x: colX[2], y: 360, width: colW[2], height: 360 });

      // child3 @ x = colX[3], width = colW[3] = 154
      expectRect(f5, { x: colX[3], y: 0, width: colW[3], height: 720 });

      expectLogicalOrderToMatchArrayIndex(f);
    });
  });
});
