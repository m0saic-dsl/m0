import {
  isValidM0String,
  parseM0StringToRenderFrames,
} from "@m0saic/dsl";
import { aspectFit } from "./aspectFit";
import type { AspectFitOptions } from "./aspectFit";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertAspectFit(
  opts: AspectFitOptions,
  expectedW: number,
  expectedH: number,
  expectedX?: number,
  expectedY?: number,
) {
  const result = aspectFit(opts);

  // Must pass the canonical validator
  expect(isValidM0String(result.m0)).toBe(true);

  // Exactly 1 rendered frame
  const frames = parseM0StringToRenderFrames(
    result.m0,
    opts.rootW,
    opts.rootH,
  );
  expect(frames.length).toBe(1);

  // Frame dimensions
  expect(frames[0].width).toBe(expectedW);
  expect(frames[0].height).toBe(expectedH);
  expect(result.frameW).toBe(expectedW);
  expect(result.frameH).toBe(expectedH);

  // Frame position (if specified)
  if (expectedX !== undefined) expect(frames[0].x).toBe(expectedX);
  if (expectedY !== undefined) expect(frames[0].y).toBe(expectedY);
}

// ---------------------------------------------------------------------------
// Exact fit
// ---------------------------------------------------------------------------

describe("aspectFit — exact fit", () => {
  test("16:9 root with 16:9 target", () => {
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 16, h: 9 },
    });
    expect(r.m0).toBe("1");
    expect(r.frameW).toBe(1920);
    expect(r.frameH).toBe(1080);
    expect(r.totalWeight).toBe(0);
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 16, h: 9 } },
      1920,
      1080,
      0,
      0,
    );
  });

  test("1:1 root with 1:1 target", () => {
    const r = aspectFit({
      rootW: 1080,
      rootH: 1080,
      target: { w: 1, h: 1 },
    });
    expect(r.m0).toBe("1");
    assertAspectFit(
      { rootW: 1080, rootH: 1080, target: { w: 1, h: 1 } },
      1080,
      1080,
    );
  });

  test("equivalent ratio (200:100 == 2:1)", () => {
    assertAspectFit(
      { rootW: 200, rootH: 100, target: { w: 200, h: 100 } },
      200,
      100,
    );
  });
});

// ---------------------------------------------------------------------------
// Letterbox (target wider than root → bars top/bottom)
// ---------------------------------------------------------------------------

describe("aspectFit �� letterbox", () => {
  test("1920x1080 + 21:9 centered", () => {
    // frameH = floor(1920*9/21) = 822
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 21, h: 9 } },
      1920,
      822,
    );
  });

  test("1920x1080 + 32:9 centered", () => {
    // frameH = floor(1920*9/32) = 540
    // bars = 540, topBar = 270, bottomBar = 270
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 32, h: 9 } },
      1920,
      540,
      0,
      270,
    );
  });

  test("1000x1000 + 16:9 centered (letterbox in square)", () => {
    // frameH = floor(1000*9/16) = 562
    assertAspectFit(
      { rootW: 1000, rootH: 1000, target: { w: 16, h: 9 } },
      1000,
      562,
    );
  });

  test("1920x1080 + 2:1 centered", () => {
    // frameH = floor(1920*1/2) = 960
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 2, h: 1 } },
      1920,
      960,
      0,
      60,
    );
  });

  test("compact output for 32:9 top-aligned", () => {
    // topBar=0, frame=540, bottomBar=540 → GCD=540 → [1,1] → "2[1,-]"
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 32, h: 9 },
      vAlign: "top",
    });
    expect(r.m0).toBe("2[1,-]");
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 32, h: 9 }, vAlign: "top" },
      1920,
      540,
      0,
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// Pillarbox (target taller than root → bars left/right)
// ---------------------------------------------------------------------------

describe("aspectFit — pillarbox", () => {
  test("1920x1080 + 9:16 centered", () => {
    // frameW = floor(1080*9/16) = 607
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 9, h: 16 } },
      607,
      1080,
    );
  });

  test("1920x1080 + 1:1 centered (pillarbox square)", () => {
    // frameW = 1080
    // leftBar = (1920-1080)/2 = 420
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 1, h: 1 } },
      1080,
      1080,
      420,
      0,
    );
  });

  test("1920x1080 + 4:3 centered", () => {
    // frameW = floor(1080*4/3) = 1440
    // leftBar = (1920-1440)/2 = 240
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 4, h: 3 } },
      1440,
      1080,
      240,
      0,
    );
  });

  test("1080x1080 + 9:16 centered (pillarbox in square)", () => {
    // frameW = floor(1080*9/16) = 607
    assertAspectFit(
      { rootW: 1080, rootH: 1080, target: { w: 9, h: 16 } },
      607,
      1080,
    );
  });
});

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

describe("aspectFit — alignment", () => {
  test("letterbox top-aligned", () => {
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 21, h: 9 }, vAlign: "top" },
      1920,
      822,
      0,
      0,
    );
  });

  test("letterbox bottom-aligned", () => {
    // frameH=822, bars=258 → frame at y=258
    assertAspectFit(
      {
        rootW: 1920,
        rootH: 1080,
        target: { w: 21, h: 9 },
        vAlign: "bottom",
      },
      1920,
      822,
      0,
      258,
    );
  });

  test("pillarbox left-aligned", () => {
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 4, h: 3 }, hAlign: "left" },
      1440,
      1080,
      0,
      0,
    );
  });

  test("pillarbox right-aligned", () => {
    // frameW=1440, bars=480 → frame at x=480
    assertAspectFit(
      { rootW: 1920, rootH: 1080, target: { w: 4, h: 3 }, hAlign: "right" },
      1440,
      1080,
      480,
      0,
    );
  });

  test("1px bar asymmetry in center", () => {
    // 1920x1080, target that gives odd bar total
    // 21:9: frameH=822, bars=258, center: top=129, bottom=129 (even)
    // 3:1: frameH=floor(1920/3)=640, bars=440, center: top=220, bottom=220
    // Let's use a case that gives odd bar:
    // root 101x100, target 2:1: frameH=floor(101/2)=50, bars=50
    // center: top=25, bottom=25 (even)
    // root 101x101, target 2:1: frameH=50, bars=51, center: top=25, bottom=26
    assertAspectFit(
      { rootW: 101, rootH: 101, target: { w: 2, h: 1 } },
      101,
      50,
      0,
      25,
    );
    // Verify bottom bar: 101 - 50 - 25 = 26
    const frames = parseM0StringToRenderFrames(
      aspectFit({ rootW: 101, rootH: 101, target: { w: 2, h: 1 } }).m0,
      101,
      101,
    );
    expect(frames[0].y + frames[0].height).toBeLessThanOrEqual(101);
  });
});

// ---------------------------------------------------------------------------
// Padding
// ---------------------------------------------------------------------------

describe("aspectFit — padding", () => {
  test("uniform padding on exact-fit root", () => {
    // 1920x1080, 16:9 target (exact fit without padding)
    // insetL = floor(1920*0.1) = 192, insetR = 192
    // insetT = floor(1080*0.1) = 108, insetB = 108
    // usable = 1536 x 864 → fit 16:9 → 1536x864 (exact)
    // centered within usable → leftWithin=0, topWithin=0
    // leftBar = 192+0=192, topBar = 108+0=108
    assertAspectFit(
      {
        rootW: 1920,
        rootH: 1080,
        target: { w: 16, h: 9 },
        padding: 0.1,
      },
      1536,
      864,
      192,
      108,
    );
  });

  test("uniform padding on letterbox", () => {
    // 1920x1080, 21:9, padding=0.1
    // usable = 1536 x 864
    // fit 21:9 in 1536x864: cross 1536*9=13824 vs 21*864=18144 → letterbox
    // frameW=1536, frameH=floor(1536*9/21)=floor(658.28)=658
    // vGap=864-658=206, center: topWithin=103, bottomWithin=103
    // topBar=108+103=211, bottomBar=108+103=211
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 21, h: 9 },
      padding: 0.1,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames.length).toBe(1);
    expect(r.frameW).toBe(frames[0].width);
    expect(r.frameH).toBe(frames[0].height);
    expect(r.frameW).toBeLessThan(1920);
    expect(r.frameH).toBeLessThan(1080);
  });

  test("paddingTop only pushes frame downward", () => {
    // 1920x1080, 1:1 target centered (no padding)
    // Without padding: frameW=1080, frameH=1080, x=420, y=0
    // With paddingTop=0.1: insetT=floor(1080*0.1)=108, usable=1920x972
    // fit 1:1 in 1920x972 → frameW=972, frameH=972
    // centered within usable: leftWithin=floor((1920-972)/2)=474, topWithin=0
    // leftBar=0+474=474, topBar=108+0=108
    const noPad = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 1, h: 1 },
    });
    const withPadTop = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 1, h: 1 },
      paddingTop: 0.1,
    });

    const framesNoPad = parseM0StringToRenderFrames(noPad.m0, 1920, 1080);
    const framesPadTop = parseM0StringToRenderFrames(withPadTop.m0, 1920, 1080);

    // With paddingTop, frame should move down (higher y)
    expect(framesPadTop[0].y).toBeGreaterThan(framesNoPad[0].y);
    // Frame should be at y=108 (the inset)
    expect(framesPadTop[0].y).toBe(108);
    // Frame height shrinks to fit usable region
    expect(framesPadTop[0].height).toBe(972);
    // Bottom should touch the bottom edge (no bottom inset)
    expect(framesPadTop[0].y + framesPadTop[0].height).toBe(1080);
  });

  test("paddingLeft only pushes frame rightward", () => {
    // 1920x1080, 1:1 target centered
    // With paddingLeft=0.1: insetL=floor(1920*0.1)=192, usable=1728x1080
    // fit 1:1 in 1728x1080 → frameW=1080, frameH=1080
    // centered within usable: leftWithin=floor((1728-1080)/2)=324
    // leftBar=192+324=516
    const noPad = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 1, h: 1 },
    });
    const withPadLeft = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 1, h: 1 },
      paddingLeft: 0.1,
    });

    const framesNoPad = parseM0StringToRenderFrames(noPad.m0, 1920, 1080);
    const framesPadLeft = parseM0StringToRenderFrames(withPadLeft.m0, 1920, 1080);

    // With paddingLeft, frame should move right (higher x)
    expect(framesPadLeft[0].x).toBeGreaterThan(framesNoPad[0].x);
    // Frame x must be >= insetL (192)
    expect(framesPadLeft[0].x).toBeGreaterThanOrEqual(192);
    // Frame dimensions: still 1080x1080 (usable region is 1728x1080,
    // 1:1 fits as 1080x1080)
    expect(framesPadLeft[0].width).toBe(1080);
    expect(framesPadLeft[0].height).toBe(1080);
  });

  test("asymmetric padding on multiple sides", () => {
    // 1920x1080, 16:9 target
    // paddingLeft=0.2, paddingTop=0.1
    // insetL=floor(1920*0.2)=384, insetT=floor(1080*0.1)=108
    // usable = (1920-384) x (1080-108) = 1536 x 972
    // fit 16:9 in 1536x972: cross 1536*9=13824 vs 16*972=15552 → letterbox
    // frameW=1536, frameH=floor(1536*9/16)=864
    // vGap=972-864=108, center: topWithin=54
    // topBar=108+54=162, leftBar=384
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 16, h: 9 },
      paddingLeft: 0.2,
      paddingTop: 0.1,
    });
    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames.length).toBe(1);
    // Frame must not intrude into the padded regions
    expect(frames[0].x).toBeGreaterThanOrEqual(384);
    expect(frames[0].y).toBeGreaterThanOrEqual(108);
    expect(r.frameW).toBe(1536);
    expect(r.frameH).toBe(864);
  });

  test("alignment inside padded usable region", () => {
    // 1920x1080, 1:1 target, paddingTop=0.2, vAlign=bottom
    // insetT=floor(1080*0.2)=216, usable=1920x864
    // fit 1:1 in 1920x864 → frameW=864, frameH=864
    // bottom-align within usable: topWithin=0, bottomWithin=0
    // topBar = 216+0=216
    // Frame should touch bottom of usable (which is bottom of root since no bottomPad)
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 1, h: 1 },
      paddingTop: 0.2,
      vAlign: "bottom",
    });
    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames[0].y + frames[0].height).toBe(1080);
    expect(frames[0].y).toBe(216);
    expect(frames[0].height).toBe(864);
  });

  test("non-uniform padding", () => {
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 16, h: 9 },
      paddingLeft: 0.1,
      paddingRight: 0.1,
      paddingTop: 0.05,
      paddingBottom: 0.05,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames.length).toBe(1);
    expect(r.frameW).toBeLessThan(1920);
    expect(r.frameH).toBeLessThan(1080);
  });

  test("padding overrides per-side", () => {
    // padding=0.1 but paddingLeft=0.2 overrides left
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 16, h: 9 },
      padding: 0.1,
      paddingLeft: 0.2,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames.length).toBe(1);
    // Left inset should be 0.2*1920=384, not 0.1*1920=192
    expect(frames[0].x).toBeGreaterThanOrEqual(384);
  });

  test("zero padding same as no padding", () => {
    const withPad = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 21, h: 9 },
      padding: 0,
    });
    const without = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 21, h: 9 },
    });
    expect(withPad.m0).toBe(without.m0);
  });

  test("invalid padding sum throws (left+right >= 1)", () => {
    expect(() =>
      aspectFit({
        rootW: 1920,
        rootH: 1080,
        target: { w: 16, h: 9 },
        paddingLeft: 0.5,
        paddingRight: 0.5,
      }),
    ).toThrow(/paddingLeft \+ paddingRight must be < 1/);
  });

  test("invalid padding sum throws (top+bottom >= 1)", () => {
    expect(() =>
      aspectFit({
        rootW: 1920,
        rootH: 1080,
        target: { w: 16, h: 9 },
        paddingTop: 0.6,
        paddingBottom: 0.5,
      }),
    ).toThrow(/paddingTop \+ paddingBottom must be < 1/);
  });

  test("negative padding throws", () => {
    expect(() =>
      aspectFit({
        rootW: 1920,
        rootH: 1080,
        target: { w: 16, h: 9 },
        padding: -0.1,
      }),
    ).toThrow(/padding values must be non-negative/);
  });

  test("large padding still produces valid layout", () => {
    // padL+padR < 1 is enforced, so usable region always has >= 1px
    const r = aspectFit({
      rootW: 100,
      rootH: 100,
      target: { w: 1, h: 1 },
      paddingLeft: 0.49,
      paddingRight: 0.49,
    });
    expect(isValidM0String(r.m0)).toBe(true);
    const frames = parseM0StringToRenderFrames(r.m0, 100, 100);
    expect(frames.length).toBe(1);
    // Frame must be within the usable region (insetL=49, insetR=49, usable=2)
    expect(frames[0].x).toBeGreaterThanOrEqual(49);
    expect(frames[0].x + frames[0].width).toBeLessThanOrEqual(51);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("aspectFit — edge cases", () => {
  test("minimum root 2x2 with 1:2 target", () => {
    // pillarbox: frameW = floor(2*1/2) = 1
    assertAspectFit({ rootW: 2, rootH: 2, target: { w: 1, h: 2 } }, 1, 2);
  });

  test("minimum root 2x2 with 2:1 target", () => {
    // letterbox: frameH = floor(2*1/2) = 1
    assertAspectFit({ rootW: 2, rootH: 2, target: { w: 2, h: 1 } }, 2, 1);
  });

  test("frame would be 0px throws", () => {
    expect(() =>
      aspectFit({ rootW: 1, rootH: 1, target: { w: 2, h: 1 } }),
    ).toThrow(/too extreme/);
  });

  test("float target ratio works", () => {
    // 2.39:1 (anamorphic)
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 2.39, h: 1 },
    });
    expect(isValidM0String(r.m0)).toBe(true);
    const frames = parseM0StringToRenderFrames(r.m0, 1920, 1080);
    expect(frames.length).toBe(1);
    expect(frames[0].width).toBe(1920);
    expect(frames[0].height).toBeLessThan(1080);
  });

  test("rootW=0 throws", () => {
    expect(() =>
      aspectFit({ rootW: 0, rootH: 1080, target: { w: 16, h: 9 } }),
    ).toThrow(/rootW must be a positive integer/);
  });

  test("rootH=-1 throws", () => {
    expect(() =>
      aspectFit({ rootW: 1920, rootH: -1, target: { w: 16, h: 9 } }),
    ).toThrow(/rootH must be a positive integer/);
  });

  test("targetW=0 throws", () => {
    expect(() =>
      aspectFit({ rootW: 1920, rootH: 1080, target: { w: 0, h: 9 } }),
    ).toThrow(/target.w must be positive/);
  });

  test("non-integer root throws", () => {
    expect(() =>
      aspectFit({ rootW: 1920.5, rootH: 1080, target: { w: 16, h: 9 } }),
    ).toThrow(/rootW must be a positive integer/);
  });
});

// ---------------------------------------------------------------------------
// GCD reduction verification
// ---------------------------------------------------------------------------

describe("aspectFit �� GCD reduction", () => {
  test("32:9 centered produces compact output", () => {
    // topBar=270, frame=540, bottomBar=270, GCD=270, weights=[1,2,1], total=4
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 32, h: 9 },
    });
    expect(r.totalWeight).toBe(4);
  });

  test("4:3 centered pillarbox GCD reduction", () => {
    // frameW=1440, leftBar=240, rightBar=240, GCD=240, weights=[1,6,1], total=8
    const r = aspectFit({
      rootW: 1920,
      rootH: 1080,
      target: { w: 4, h: 3 },
    });
    expect(r.totalWeight).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe("aspectFit — determinism", () => {
  test("same inputs always produce same output", () => {
    const opts: AspectFitOptions = {
      rootW: 1920,
      rootH: 1080,
      target: { w: 21, h: 9 },
      vAlign: "center",
    };
    const a = aspectFit(opts);
    const b = aspectFit(opts);
    expect(a.m0).toBe(b.m0);
    expect(a.frameW).toBe(b.frameW);
    expect(a.frameH).toBe(b.frameH);
  });
});
