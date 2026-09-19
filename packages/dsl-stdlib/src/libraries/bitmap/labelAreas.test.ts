import { labelAreas } from "./labelAreas";

describe("labelAreas — counts and bboxes", () => {
  test("empty grid → 0 areas", () => {
    expect(labelAreas([])).toEqual({
      width: 0,
      height: 0,
      areaCount: 0,
      areas: [],
      map: [],
    });
  });

  test("all-OFF grid → 0 areas, all -1 in map", () => {
    const grid = [
      [false, false, false],
      [false, false, false],
    ];
    const out = labelAreas(grid);
    expect(out.areaCount).toBe(0);
    expect(out.areas).toEqual([]);
    expect(out.map).toEqual([
      [-1, -1, -1],
      [-1, -1, -1],
    ]);
  });

  test("single blob → 1 area, correct bbox and pixel count", () => {
    const grid = [
      [false, true, true, false],
      [false, true, true, false],
    ];
    const out = labelAreas(grid);
    expect(out.areaCount).toBe(1);
    expect(out.areas[0]).toEqual({
      id: 0,
      pixelCount: 4,
      bbox: { x: 1, y: 0, w: 2, h: 2 },
    });
    expect(out.map[0][1]).toBe(0);
    expect(out.map[0][0]).toBe(-1);
  });

  test("two diagonal cells = 1 area (8-connected, NOT 4-connected)", () => {
    const grid = [
      [true, false],
      [false, true],
    ];
    const out = labelAreas(grid);
    expect(out.areaCount).toBe(1);
    expect(out.areas[0].pixelCount).toBe(2);
  });

  test("three disjoint blobs → 3 areas, ids assigned in scan order", () => {
    const grid = [
      [true, false, false, true],
      [false, false, false, false],
      [false, true, false, false],
    ];
    const out = labelAreas(grid);
    expect(out.areaCount).toBe(3);
    // Scan order: top-left first, then top-right, then bottom-middle.
    expect(out.map[0][0]).toBe(0);
    expect(out.map[0][3]).toBe(1);
    expect(out.map[2][1]).toBe(2);
  });
});
