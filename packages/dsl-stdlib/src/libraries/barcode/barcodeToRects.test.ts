import { barcodeToBars } from "./barcodeToBars";
import { barcodeToRects } from "./barcodeToRects";

describe("barcodeToRects", () => {
  test("returns one rect per dark bar in barcodeToBars output", () => {
    const text = "Hello";
    const bars = barcodeToBars(text);
    const rects = barcodeToRects(text);
    const darkCount = bars.bars.filter((b) => b.ink === "dark").length;
    expect(rects).toHaveLength(darkCount);
  });

  test("every rect has y = 0 and h = 1 (module units)", () => {
    const rects = barcodeToRects("Hello");
    for (const r of rects) {
      expect(r.y).toBe(0);
      expect(r.h).toBe(1);
    }
  });

  test("rect widths are positive integers ∈ {1, 2, 3, 4} for Code 128", () => {
    const rects = barcodeToRects("Hello");
    for (const r of rects) {
      expect([1, 2, 3, 4]).toContain(r.w);
    }
  });

  test("rect x-positions match the dark-bar positions in barcodeToBars", () => {
    const text = "PJJ123C";
    const bars = barcodeToBars(text);
    const rects = barcodeToRects(text);
    const darkBars = bars.bars.filter((b) => b.ink === "dark");
    expect(rects.length).toBe(darkBars.length);
    for (let i = 0; i < rects.length; i++) {
      expect(rects[i].x).toBe(darkBars[i].x);
      expect(rects[i].w).toBe(darkBars[i].widthModules);
    }
  });

  test("default quiet zone of 10 → no rects in x ∈ [0, 10)", () => {
    const rects = barcodeToRects("Hello");
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(10);
    }
  });

  test("quietZoneModules: 0 → first rect starts at x = 0", () => {
    const rects = barcodeToRects("Hello", { quietZoneModules: 0 });
    expect(rects[0].x).toBe(0);
  });

  test("determinism: same input → byte-identical rects", () => {
    const a = barcodeToRects("M0SAIC");
    const b = barcodeToRects("M0SAIC");
    expect(a).toEqual(b);
  });
});
