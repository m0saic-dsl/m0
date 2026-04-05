import {
  isValidM0String,
  parseM0StringToRenderFrames,
} from "@m0saic/dsl";
import { placeRect } from "./placeRect";
import type { PlaceRectOptions } from "./placeRect";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertPlaceRect(
  opts: PlaceRectOptions,
  expectedW: number,
  expectedH: number,
  expectedX?: number,
  expectedY?: number,
) {
  const result = placeRect(opts);
  expect(isValidM0String(result.m0)).toBe(true);

  const frames = parseM0StringToRenderFrames(
    result.m0,
    opts.rootW,
    opts.rootH,
  );
  expect(frames.length).toBe(1);
  expect(frames[0].width).toBe(expectedW);
  expect(frames[0].height).toBe(expectedH);
  expect(result.rectW).toBe(expectedW);
  expect(result.rectH).toBe(expectedH);

  if (expectedX !== undefined) expect(frames[0].x).toBe(expectedX);
  if (expectedY !== undefined) expect(frames[0].y).toBe(expectedY);
}

// ---------------------------------------------------------------------------
// Exact fit
// ---------------------------------------------------------------------------

describe("placeRect — exact fit", () => {
  test("same size as root → bare 1", () => {
    const r = placeRect({ rootW: 1920, rootH: 1080, rectW: 1920, rectH: 1080 });
    expect(r.m0).toBe("1");
    expect(r.totalWeight).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Centering
// ---------------------------------------------------------------------------

describe("placeRect — centered", () => {
  test("1740x975 centered in 1920x1080", () => {
    // leftBar=(1920-1740)/2=90, topBar=(1080-975)/2=52
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975 },
      1740, 975, 90, 52,
    );
  });

  test("1080x1080 centered in 1920x1080 (pillarbox)", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1080, rectH: 1080 },
      1080, 1080, 420, 0,
    );
  });

  test("1920x540 centered in 1920x1080 (letterbox)", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1920, rectH: 540 },
      1920, 540, 0, 270,
    );
  });
});

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

describe("placeRect — alignment", () => {
  test("top-left", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1000, rectH: 600, hAlign: "left", vAlign: "top" },
      1000, 600, 0, 0,
    );
  });

  test("bottom-right", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1000, rectH: 600, hAlign: "right", vAlign: "bottom" },
      1000, 600, 920, 480,
    );
  });

  test("center-top", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1000, rectH: 600, vAlign: "top" },
      1000, 600, 460, 0,
    );
  });
});

// ---------------------------------------------------------------------------
// Grid-safe canvas use case
// ---------------------------------------------------------------------------

describe("placeRect — grid-safe canvas", () => {
  test("1740x975 (8x6 grid-safe) centered in 1920x1080", () => {
    const r = placeRect({ rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975 });
    expect(isValidM0String(r.m0)).toBe(true);

    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames.length).toBe(1);
    expect(frames[0].width).toBe(1740);
    expect(frames[0].height).toBe(975);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("placeRect — edge cases", () => {
  test("1px rect in large canvas", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1, rectH: 1 },
      1, 1,
    );
  });

  test("full width, partial height", () => {
    assertPlaceRect(
      { rootW: 1920, rootH: 1080, rectW: 1920, rectH: 1 },
      1920, 1, 0,
    );
  });

  test("rectW > rootW throws", () => {
    expect(() =>
      placeRect({ rootW: 100, rootH: 100, rectW: 101, rectH: 50 }),
    ).toThrow(/rectW.*must be <= rootW/);
  });

  test("rectH > rootH throws", () => {
    expect(() =>
      placeRect({ rootW: 100, rootH: 100, rectW: 50, rectH: 101 }),
    ).toThrow(/rectH.*must be <= rootH/);
  });

  test("non-integer throws", () => {
    expect(() =>
      placeRect({ rootW: 1920, rootH: 1080, rectW: 100.5, rectH: 100 }),
    ).toThrow(/rectW must be a positive integer/);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("placeRect — determinism", () => {
  test("same inputs always produce same output", () => {
    const opts: PlaceRectOptions = {
      rootW: 1920, rootH: 1080, rectW: 1740, rectH: 975,
    };
    expect(placeRect(opts).m0).toBe(placeRect(opts).m0);
  });
});
