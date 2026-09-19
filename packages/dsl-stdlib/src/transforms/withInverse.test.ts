import { withInverse } from "./withInverse";
import { split } from "./unified/split";
import { addOverlay } from "./unified/addOverlay";
import { removeOverlay } from "./unified/removeOverlay";
import { setTileType } from "./unified/setTileType";
import { replace } from "./unified/replace";
import { swapFrames } from "./unified/swapFrames";

/**
 * withInverse round-trips every unified transform back to its
 * pre-transform input. Snapshot inverse, so no symbolic correctness
 * checks; we just confirm that the inverse closure returns the
 * original m0 string byte-for-byte.
 */
describe("withInverse", () => {
  test("split: inverse returns the original m0", () => {
    const m0 = "1";
    const wrapped = withInverse(split);
    const { m0: next, inverse } = wrapped(m0, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    expect(next).not.toBe(m0);
    expect(inverse()).toBe(m0);
  });

  test("addOverlay: inverse returns the original m0", () => {
    const m0 = "2(1,1)";
    const wrapped = withInverse(addOverlay);
    const { m0: next, inverse } = wrapped(m0, { by: "logicalIndex", index: 0 });
    expect(next).not.toBe(m0);
    expect(inverse()).toBe(m0);
  });

  test("removeOverlay: inverse returns the m0 with overlay still present", () => {
    // Start with an overlayed layout, then remove it; inverse should
    // return the overlayed string we started from.
    const overlayed = addOverlay("2(1,1)", { by: "logicalIndex", index: 0 });
    const wrapped = withInverse(removeOverlay);
    const { m0: next, inverse } = wrapped(overlayed, { by: "logicalIndex", index: 0 });
    expect(next).not.toBe(overlayed);
    expect(inverse()).toBe(overlayed);
  });

  test("setTileType: inverse returns the original m0", () => {
    const m0 = "2(1,1)";
    const wrapped = withInverse(setTileType);
    const { m0: next, inverse } = wrapped(m0, { by: "logicalIndex", index: 0 }, "0");
    expect(next).not.toBe(m0);
    expect(inverse()).toBe(m0);
  });

  test("replace: inverse returns the original m0", () => {
    const m0 = "2(1,1)";
    const wrapped = withInverse(replace);
    const { m0: next, inverse } = wrapped(m0, { by: "logicalIndex", index: 0 }, "2(1,1)");
    expect(inverse()).toBe(m0);
    expect(next).not.toBe(m0);
  });

  test("swapFrames: inverse returns the original m0", () => {
    const m0 = "2(1,1)";
    const wrapped = withInverse(swapFrames);
    const { m0: next, inverse } = wrapped(m0, 0, 1);
    expect(inverse()).toBe(m0);
    // swapFrames may return the same string when frames are identical.
    expect(typeof next).toBe("string");
  });

  test("preserves the underlying transform's throws", () => {
    const wrapped = withInverse(split);
    expect(() =>
      wrapped("1", { by: "logicalIndex", index: 99 }, { axis: "col", count: 2 }),
    ).toThrow();
  });

  test("inverse does not capture the result, only the input", () => {
    // Calling inverse() repeatedly always returns the captured
    // pre-transform string; subsequent forward applications don't
    // alter what inverse() returns.
    const m0 = "1";
    const wrapped = withInverse(split);
    const { inverse } = wrapped(m0, { by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    expect(inverse()).toBe(m0);
    expect(inverse()).toBe(m0);
  });
});
