import { isValidM0String } from "@m0saic/dsl";
import { binaryGridToM0 } from "./binaryGridToM0";

describe("binaryGridToM0", () => {
  test("3×2 grid → expected token layout", () => {
    const grid = [
      [true, false, true],
      [false, true, false],
    ];
    const m0 = binaryGridToM0(grid);
    expect(m0).toBe("2[3(1,-,1),3(-,1,-)]");
  });

  test("all-ON 2×2", () => {
    const m0 = binaryGridToM0([
      [true, true],
      [true, true],
    ]);
    expect(m0).toBe("2[2(1,1),2(1,1)]");
  });

  test("output is a valid m0 string", () => {
    const m0 = binaryGridToM0([
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ]);
    expect(isValidM0String(m0)).toBe(true);
  });

  test("rejects empty grid", () => {
    expect(() => binaryGridToM0([])).toThrow(/at least one row/);
  });

  test("rejects ragged rows", () => {
    expect(() =>
      binaryGridToM0([
        [true, false, true],
        [false, true],
      ]),
    ).toThrow(/row 1/);
  });
});
