/**
 * Type-level smoke tests — verify all public types are importable
 * and structurally sound. If this file compiles, the types are
 * correctly exported.
 */
import type {
  ContainerAxis,
  GridOptions,
  TileTypePrimitive,
  AspectFitOptions,
  AspectFitHAlign,
  AspectFitVAlign,
  PlaceRectOptions,
  SpotlightArrangement,
  RankedListDecay,
} from "./types";

describe("types", () => {
  it("ContainerAxis accepts row and col", () => {
    const axes: ContainerAxis[] = ["row", "col"];
    expect(axes).toHaveLength(2);
  });

  it("TileTypePrimitive accepts all five forms", () => {
    const types: TileTypePrimitive[] = ["F", "1", ">", "0", "-"];
    expect(types).toHaveLength(5);
  });

  it("GridOptions has required fields", () => {
    const opts: GridOptions = { rows: 2, cols: 3 };
    expect(opts.rows).toBe(2);
  });

  it("AspectFitOptions has required fields", () => {
    const opts: AspectFitOptions = {
      rootW: 1920,
      rootH: 1080,
      target: { w: 16, h: 9 },
    };
    expect(opts.rootW).toBe(1920);
  });

  it("PlaceRectOptions has required fields", () => {
    const opts: PlaceRectOptions = {
      rootW: 1920,
      rootH: 1080,
      rectW: 960,
      rectH: 540,
    };
    expect(opts.rectW).toBe(960);
  });

  it("AspectFitHAlign and VAlign cover expected values", () => {
    const h: AspectFitHAlign[] = ["left", "center", "right"];
    const v: AspectFitVAlign[] = ["top", "center", "bottom"];
    expect(h).toHaveLength(3);
    expect(v).toHaveLength(3);
  });

  it("SpotlightArrangement covers expected values", () => {
    const arr: SpotlightArrangement[] = ["right", "bottom", "l-wrap", "u-wrap"];
    expect(arr).toHaveLength(4);
  });

  it("RankedListDecay covers expected values", () => {
    const decays: RankedListDecay[] = ["linear", "gentle", "steep"];
    expect(decays).toHaveLength(3);
  });
});
