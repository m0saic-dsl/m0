import { classifyPixels } from "./classifyPixels";

function rgba(pixels: Array<[number, number, number, number]>): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    buf[i * 4 + 0] = pixels[i][0];
    buf[i * 4 + 1] = pixels[i][1];
    buf[i * 4 + 2] = pixels[i][2];
    buf[i * 4 + 3] = pixels[i][3];
  }
  return buf;
}

describe("classifyPixels — argument validation", () => {
  test("rejects non-positive width", () => {
    const buf = new Uint8ClampedArray(0);
    expect(() => classifyPixels(buf, 0, 1)).toThrow(/width/);
  });
  test("rejects mismatched buffer length", () => {
    const buf = new Uint8ClampedArray(8); // 2 pixels worth
    expect(() => classifyPixels(buf, 3, 1)).toThrow(/buffer length/);
  });
  test("rejects nearest mode without onColor", () => {
    const buf = rgba([[255, 255, 255, 255]]);
    expect(() => classifyPixels(buf, 1, 1, { mode: "nearest" })).toThrow(/onColor/);
  });
});

describe("classifyPixels — luminance mode", () => {
  test("default (threshold 128, light=ON): white→true, black→false", () => {
    const buf = rgba([
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    const grid = classifyPixels(buf, 2, 1);
    expect(grid).toEqual([[true, false]]);
  });

  test("on-mode 'dark' inverts: black→ON, white→OFF", () => {
    const buf = rgba([
      [255, 255, 255, 255],
      [0, 0, 0, 255],
    ]);
    const grid = classifyPixels(buf, 2, 1, { onMode: "dark" });
    expect(grid).toEqual([[false, true]]);
  });

  test("threshold knob flips classification at the expected value", () => {
    // Pixel at lum ≈ 150 (avoids floating-point boundary at exactly 128).
    const pixel: [number, number, number, number] = [150, 150, 150, 255];
    const buf = rgba([pixel]);
    // lum 150 ≥ default threshold 128 → ON
    expect(classifyPixels(buf, 1, 1)).toEqual([[true]]);
    // Bump threshold above luminance → OFF
    expect(classifyPixels(buf, 1, 1, { threshold: 200 })).toEqual([[false]]);
  });

  test("alpha below threshold forces OFF even for bright pixels", () => {
    const buf = rgba([[255, 255, 255, 50]]);
    const grid = classifyPixels(buf, 1, 1, { alphaThreshold: 128 });
    expect(grid).toEqual([[false]]);
  });
});

describe("classifyPixels — nearest mode", () => {
  test("classifies by RGB distance to onColor vs offColor (default off=black)", () => {
    const buf = rgba([
      [10, 10, 10, 255], // closer to black (default off)
      [240, 240, 240, 255], // closer to white (on)
    ]);
    const grid = classifyPixels(buf, 2, 1, {
      mode: "nearest",
      onColor: { r: 255, g: 255, b: 255 },
    });
    expect(grid).toEqual([[false, true]]);
  });

  test("explicit offColor — ffmpeg-logo-style green ON over white background", () => {
    const buf = rgba([
      [44, 130, 53, 255], // approx ffmpeg green
      [255, 255, 255, 255], // white bg
      [220, 230, 220, 255], // pale green-ish white — closer to white
    ]);
    const grid = classifyPixels(buf, 3, 1, {
      mode: "nearest",
      onColor: { r: 44, g: 130, b: 53 },
      offColor: { r: 255, g: 255, b: 255 },
    });
    expect(grid).toEqual([[true, false, false]]);
  });
});

describe("classifyPixels — determinism", () => {
  test("identical inputs produce identical grids", () => {
    const a = rgba([
      [200, 100, 50, 255],
      [10, 200, 10, 255],
      [128, 128, 128, 255],
      [0, 0, 255, 100],
    ]);
    const b = rgba([
      [200, 100, 50, 255],
      [10, 200, 10, 255],
      [128, 128, 128, 255],
      [0, 0, 255, 100],
    ]);
    expect(classifyPixels(a, 2, 2)).toEqual(classifyPixels(b, 2, 2));
  });
});
