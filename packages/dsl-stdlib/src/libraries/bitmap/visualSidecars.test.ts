import { labelAreas } from "./labelAreas";
import {
  areaMapToVisualLabels,
  binaryGridToVisualArt,
  binaryGridToVisualDsl,
} from "./visualSidecars";

describe("binaryGridToVisualDsl", () => {
  test("3×2 grid → one row per line, valid pretty DSL, trailing newline", () => {
    const grid = [
      [true, false, true],
      [false, true, false],
    ];
    expect(binaryGridToVisualDsl(grid)).toBe("2[\n3(1,-,1),\n3(-,1,-)\n]\n");
  });
});

describe("binaryGridToVisualArt", () => {
  test("default chars: '█' for ON, ' ' for OFF", () => {
    const grid = [
      [true, false],
      [false, true],
    ];
    expect(binaryGridToVisualArt(grid)).toBe("█ \n █\n");
  });

  test("custom chars", () => {
    const grid = [[true, false, true]];
    expect(binaryGridToVisualArt(grid, { onChar: "#", offChar: "." })).toBe("#.#\n");
  });
});

describe("areaMapToVisualLabels", () => {
  test("assigns A,B,C glyphs in scan order, ' ' for OFF cells", () => {
    const grid = [
      [true, false, false, true],
      [false, false, false, false],
      [false, true, false, false],
    ];
    const areaMap = labelAreas(grid);
    expect(areaMap.areaCount).toBe(3);
    expect(areaMapToVisualLabels(areaMap)).toBe("A  B\n    \n C  \n");
  });

  test("cycles glyph alphabet when area count exceeds glyph count", () => {
    // 3 disjoint ON pixels with a 2-glyph alphabet → A, B, A.
    const grid = [[true, false, true, false, true]];
    const areaMap = labelAreas(grid);
    expect(areaMapToVisualLabels(areaMap, { areaGlyphs: "AB" })).toBe("A B A\n");
  });

  test("rejects empty glyph string", () => {
    const areaMap = labelAreas([[true]]);
    expect(() => areaMapToVisualLabels(areaMap, { areaGlyphs: "" })).toThrow(
      /non-empty/,
    );
  });
});
