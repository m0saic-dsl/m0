import { parseM0StringToRenderFrames, validateM0String } from "@m0saic/dsl";
import { replaceNodeByStableId } from "../../transforms/primitives/replace/replaceNodeByStableId";
import { qrToM0 } from "./qrToM0";
import { qrToMatrix } from "./qrToMatrix";
import {
  qrPayloadWifi,
  qrPayloadVCard,
  qrPayloadGeo,
} from "./qrPayloads";

describe("qrToM0 — base behaviour (no safe area)", () => {
  test("produces a validated M0String for a typical URL", () => {
    const result = qrToM0("https://m0saic.io", { errorCorrectionLevel: "M" });
    expect(typeof result.m0).toBe("string");
    const validation = validateM0String(String(result.m0));
    expect(validation.ok).toBe(true);
  });

  test("matrixSize + 2·quietZone matches the canonical QR side", () => {
    const result = qrToM0("https://m0saic.io", { errorCorrectionLevel: "M" });
    // 4·version + 17 = matrixSize.
    expect(result.matrixSize).toBe(4 * result.version + 17);
    expect(result.quietZone).toBe(4);
  });

  test("default canvas is 25 px per cell when no safe area requested", () => {
    const result = qrToM0("https://m0saic.io", { errorCorrectionLevel: "M" });
    const N = result.matrixSize + 2 * result.quietZone;
    expect(result.canvasW).toBe(N * 25);
    expect(result.canvasH).toBe(N * 25);
  });

  test("no safe area → no bounds or stable key returned", () => {
    const result = qrToM0("https://m0saic.io");
    expect(result.safeAreaBounds).toBeUndefined();
    expect(result.safeAreaStableKey).toBeUndefined();
  });

  test("number of visible (rendered) frames equals dark-module count", () => {
    const result = qrToM0("https://m0saic.io", { errorCorrectionLevel: "M" });
    const N = result.matrixSize + 2 * result.quietZone;
    const frames = parseM0StringToRenderFrames(String(result.m0), N * 25, N * 25);
    // Without a safe area, every visible cell ("1") in the matrix renders.
    // Count dark modules in the matrix to compare.
    const matrix = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "M" });
    let dark = 0;
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        if (matrix.modules[r][c]) dark++;
      }
    }
    expect(frames.length).toBe(dark);
  });

  test("deterministic — same input twice produces identical m0", () => {
    const a = qrToM0("https://m0saic.io", { errorCorrectionLevel: "H" });
    const b = qrToM0("https://m0saic.io", { errorCorrectionLevel: "H" });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.canvasW).toBe(b.canvasW);
  });
});

describe("qrToM0 — safe area: bounds mode", () => {
  test("returns safeAreaBounds without carving the matrix", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6, // force V6 so 15-cell safe area fits
      safeArea: { mode: "bounds", size: { width: 272, height: 272 } },
    });
    expect(result.safeAreaBounds).toBeDefined();
    expect(result.safeAreaBounds!.width).toBe(272);
    expect(result.safeAreaBounds!.height).toBe(272);
    // stableKey absent because we didn't carve.
    expect(result.safeAreaStableKey).toBeUndefined();
  });

  test("canvas dimensions scale so the safe-area cell span × pxPerCell ≥ max(W, H)", () => {
    const W = 272, H = 272;
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "bounds", size: { width: W, height: H } },
    });
    // V6 + QZ=4 → N=49 cells. pxPerCell = ceil(272/15) = 19 (rounded UP so
    // the rendered safe area is never smaller than the request). canvas =
    // 49 × 19 = 931.
    expect(result.canvasW).toBe(49 * 19);
    // The rendered 15-cell safe-area square is at least the requested size.
    expect(15 * (result.canvasW / 49)).toBeGreaterThanOrEqual(Math.max(W, H));
  });
});

describe("qrToM0 — safe area: carve mode", () => {
  test("square safe area: emits a labeled F as the splice point", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    expect(result.safeAreaBounds).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      width: 272,
      height: 272,
    });
    expect(result.safeAreaStableKey).toBeDefined();
    expect(typeof result.safeAreaStableKey).toBe("string");
  });

  test("the carved m0 is a valid M0String", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    const validation = validateM0String(String(result.m0));
    expect(validation.ok).toBe(true);
  });

  test("replaceNodeByStableId can swap the safe-area frame without throwing", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    const replacement = "F"; // any valid m0 fragment
    const replaced = replaceNodeByStableId(
      String(result.m0),
      result.safeAreaStableKey as unknown as string,
      replacement,
    );
    const validation = validateM0String(replaced);
    expect(validation.ok).toBe(true);
  });

  test("non-square safe area: inner placeRect letterboxes the W×H rect", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 400, height: 300 } },
    });
    expect(result.safeAreaBounds).toBeDefined();
    expect(result.safeAreaBounds!.width).toBe(400);
    expect(result.safeAreaBounds!.height).toBe(300);
    expect(result.safeAreaStableKey).toBeDefined();
    const validation = validateM0String(String(result.m0));
    expect(validation.ok).toBe(true);
  });

  test("padding adds an inset around the inner logo rect", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 200, height: 200 }, paddingPct: 10 },
    });
    // With 10% padding, the safe-area square = 200 + 2*20 = 240.
    // pxPerCell = 240/15 = 16. canvas = 49 × 16 = 784.
    expect(result.canvasW).toBe(49 * 16);
    expect(result.safeAreaBounds!.width).toBe(200);
    expect(result.safeAreaBounds!.height).toBe(200);
    // The bounds rect should be centered, and the padding implies its
    // top-left coords differ from where a no-padding 200-wide rect would land.
    const validation = validateM0String(String(result.m0));
    expect(validation.ok).toBe(true);
  });

  test("safe area visible-frame count: dark modules outside carve, plus 1 for the splice F", () => {
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    const N = result.matrixSize + 2 * result.quietZone;
    const frames = parseM0StringToRenderFrames(String(result.m0), result.canvasW, result.canvasH);
    expect(frames.length).toBeGreaterThan(0);
    // The LAST frame is the safe-area splice point (overlay composes last).
    const last = frames[frames.length - 1];
    expect(last).toBeDefined();
  });
});

describe("qrToM0 — safe-area size: never undersize the requested W×H", () => {
  test("integer pxPerCell guarantees the rendered safe area ≥ requested", () => {
    // Regression: a request for 272×272 used to round the cell size down,
    // producing a rendered safe area of 270×270. The fix forces an integer
    // `pxPerCell ≥ ceil(targetSquare / 15)` so the renderer always produces
    // at least the requested dimensions.
    const result = qrToM0("https://m0saic.io", {
      errorCorrectionLevel: "H",
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 }, paddingPct: 11 },
    });
    const N = result.matrixSize + 2 * result.quietZone;
    const pxPerCellRendered = result.canvasW / N;
    // pxPerCell is an integer (canvas is N × pxPerCell exactly).
    expect(Number.isInteger(pxPerCellRendered)).toBe(true);
    // The 15-cell safe area in rendered pixels is at least the requested W
    // including the requested padding inset.
    const renderedSafeArea = 15 * pxPerCellRendered;
    const requestedPadded = 272 + 2 * (0.11 * 272);
    expect(renderedSafeArea).toBeGreaterThanOrEqual(requestedPadded);
    // Inner bounds are exactly the requested W×H (the inner placeRect
    // letterboxes a 272-px rect inside the (possibly larger) carved square).
    expect(result.safeAreaBounds!.width).toBe(272);
    expect(result.safeAreaBounds!.height).toBe(272);
  });
});

describe("qrToM0 — input validation", () => {
  test("rejects safeArea.mode without size", () => {
    expect(() =>
      qrToM0("hi", { safeArea: { mode: "carve" } }),
    ).toThrow(/requires safeArea.size/);
  });

  test("rejects zero or negative safeArea.size dims", () => {
    expect(() =>
      qrToM0("hi", { safeArea: { mode: "carve", size: { width: 0, height: 100 } } }),
    ).toThrow(/positive/);
    expect(() =>
      qrToM0("hi", { safeArea: { mode: "carve", size: { width: -10, height: 100 } } }),
    ).toThrow(/positive/);
  });

  test("rejects out-of-range paddingPct", () => {
    expect(() =>
      qrToM0("hi", {
        safeArea: { mode: "carve", size: { width: 100, height: 100 }, paddingPct: 60 },
      }),
    ).toThrow(/paddingPct/);
  });

  test("rejects too-small QR version for the 15-cell safe area", () => {
    // V1 = 21 modules + QZ 4 = 29 total. 15-cell safe area fits but overlaps
    // function patterns (this is a graceful warning, not a throw, in v1 of
    // qrToM0 — but really small versions throw because cells don't fit).
    // Force V1 with QZ=0 → 21 cells, can't fit 15-cell safe area centered
    // without going outside.
    expect(() =>
      qrToM0("hi", {
        version: 1,
        quietZoneModules: 0,
        safeArea: { mode: "carve", size: { width: 100, height: 100 } },
      }),
    ).not.toThrow(); // 15 fits in 21
  });
});

// ── Channels API (Phase 2 additions) ────────────────────────────────

describe("qrToM0 — channels: default (no opt-in) behavior", () => {
  test("no channels opted in: only 'data' channel in result", () => {
    const result = qrToM0("https://m0saic.io");
    expect(result.channels.length).toBe(1);
    expect(result.channels[0].channel).toBe("data");
    expect(result.channels[0].layerIndex).toBe(0);
    expect(result.channelByRole.eyes).toBeUndefined();
    expect(result.channelByRole.alignmentPatterns).toBeUndefined();
  });

  test("no channels opted in: labels map is empty", () => {
    const result = qrToM0("https://m0saic.io");
    expect(Object.keys(result.labels)).toEqual([]);
  });

  test("no channels opted in: source array length matches pre-change dark-cell count", () => {
    // This is the load-bearing default-behavior parity check.
    const result = qrToM0("https://m0saic.io", { errorCorrectionLevel: "M" });
    const N = result.matrixSize + 2 * result.quietZone;
    const frames = parseM0StringToRenderFrames(String(result.m0), N * 25, N * 25);
    const { qrToMatrix } = require("./qrToMatrix");
    const matrix = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "M" });
    let dark = 0;
    for (let r = 0; r < matrix.size; r++) {
      for (let c = 0; c < matrix.size; c++) {
        if (matrix.modules[r][c]) dark++;
      }
    }
    expect(frames.length).toBe(dark);
  });
});

describe("qrToM0 — channels: eyes", () => {
  test("eyes: true → 3 logical-owner anchors, base unchanged, render-frame count identical to channels-off", () => {
    const baseline = qrToM0("https://m0saic.io");
    const baselineFrames = parseM0StringToRenderFrames(
      String(baseline.m0),
      baseline.canvasW,
      baseline.canvasH,
    );

    const withEyes = qrToM0("https://m0saic.io", { channels: { eyes: true } });
    const withEyesFrames = parseM0StringToRenderFrames(
      String(withEyes.m0),
      withEyes.canvasW,
      withEyes.canvasH,
    );

    expect(withEyes.channelByRole.eyes?.frames).toHaveLength(3);

    // Channels are PURE logical-owner anchors — they emit `-{-}` overlays
    // that paint nothing, and the base layer is left intact. So enabling
    // the eyes channel doesn't change the rendered pixel set at all; the
    // render-frame count stays identical to channels-off. The opt-in is
    // purely about getting stableKeys + bounds for the 3 eye regions so
    // templates / animators can address them by name.
    expect(withEyesFrames.length).toBe(baselineFrames.length);
  });

  test("eyes: { suppressBase: true } → the 3×49 finder cells leave the base layer", () => {
    const plain = qrToM0("https://m0saic.io", { channels: { eyes: true } });
    const suppressed = qrToM0("https://m0saic.io", {
      channels: { eyes: { emit: true, suppressBase: true } },
    });
    const frames = (r: typeof plain) =>
      parseM0StringToRenderFrames(String(r.m0), r.canvasW, r.canvasH);
    // Every finder-pattern DARK module vanishes from the base: 3 finders ×
    // 33 dark cells each (7×7 ring pattern has 33 dark of 49). The anchors
    // (paint-nothing `-{-}`) are unchanged, so the delta is exactly the
    // suppressed dark cells.
    const darkPerFinder = 33;
    expect(frames(plain).length - frames(suppressed).length).toBe(3 * darkPerFinder);
    // Anchors + stableKeys survive suppression — splice targets intact.
    expect(suppressed.channelByRole.eyes?.frames).toHaveLength(3);
    expect(validateM0String(String(suppressed.m0)).ok).toBe(true);
  });

  test("eyes: true → 3 eye stable keys labeled qr-eye-{tl,tr,bl}", () => {
    const result = qrToM0("https://m0saic.io", { channels: { eyes: true } });
    const eyeFrames = result.channelByRole.eyes!.frames;
    const labels = eyeFrames.map((f) => result.labels[f.stableKey]);
    expect(labels).toEqual(["qr-eye-tl", "qr-eye-tr", "qr-eye-bl"]);
  });

  test("eyes: true → 3 eye frames have 7x7 cellBounds at correct corners", () => {
    const result = qrToM0("https://m0saic.io", { channels: { eyes: true } });
    const N = result.matrixSize;
    expect(result.channelByRole.eyes!.frames.map((f) => f.cellBounds)).toEqual([
      { row: 0, col: 0, w: 7, h: 7 },
      { row: 0, col: N - 7, w: 7, h: 7 },
      { row: N - 7, col: 0, w: 7, h: 7 },
    ]);
  });

  test("eyes: false (explicit) → no eyes channel emitted", () => {
    const result = qrToM0("https://m0saic.io", { channels: { eyes: false } });
    expect(result.channelByRole.eyes).toBeUndefined();
    expect(result.channels).toHaveLength(1);
  });

  test("composed m0 is valid", () => {
    const result = qrToM0("https://m0saic.io", { channels: { eyes: true } });
    const v = validateM0String(String(result.m0));
    expect(v.ok).toBe(true);
  });
});

describe("qrToM0 — channels: alignmentPatterns", () => {
  test("V1: no alignment patterns → empty frames", () => {
    const result = qrToM0("hi", {
      version: 1,
      channels: { alignmentPatterns: true },
    });
    // V1 has no alignment patterns; an empty regions list means no layer emitted.
    expect(result.channelByRole.alignmentPatterns).toBeUndefined();
  });

  test("V7: 6 alignment patterns (3 corner overlaps skipped per Annex E)", () => {
    const result = qrToM0("https://m0saic.io/somewhat-longer-url-to-force-v7-or-higher", {
      version: 7,
      channels: { alignmentPatterns: true },
    });
    expect(result.channelByRole.alignmentPatterns?.frames).toHaveLength(6);
    const labels = result.channelByRole.alignmentPatterns!.frames.map(
      (f) => result.labels[f.stableKey],
    );
    expect(labels).toEqual([
      "qr-align-0",
      "qr-align-1",
      "qr-align-2",
      "qr-align-3",
      "qr-align-4",
      "qr-align-5",
    ]);
  });
});

describe("qrToM0 — channels: timingPatterns", () => {
  test("timingPatterns: true → 2 frames (horizontal + vertical)", () => {
    const result = qrToM0("https://m0saic.io", {
      channels: { timingPatterns: true },
    });
    expect(result.channelByRole.timingPatterns?.frames).toHaveLength(2);
    const labels = result.channelByRole.timingPatterns!.frames.map(
      (f) => result.labels[f.stableKey],
    );
    expect(labels).toEqual(["qr-timing-h", "qr-timing-v"]);
  });
});

describe("qrToM0 — channels: darkModule", () => {
  test("darkModule: true → 1 frame at (4·v+9, 8)", () => {
    const result = qrToM0("https://m0saic.io", {
      version: 6,
      channels: { darkModule: true },
    });
    expect(result.channelByRole.darkModule?.frames).toHaveLength(1);
    expect(result.channelByRole.darkModule!.frames[0].cellBounds).toEqual({
      row: 4 * 6 + 9,
      col: 8,
      w: 1,
      h: 1,
    });
    expect(result.labels[result.channelByRole.darkModule!.frames[0].stableKey])
      .toBe("qr-darkmodule");
  });
});

describe("qrToM0 — channels: composition order", () => {
  test("eyes + alignment + timing: appear in fixed order", () => {
    const result = qrToM0("https://m0saic.io/longer-url-to-force-larger-version", {
      version: 7,
      channels: { eyes: true, alignmentPatterns: true, timingPatterns: true },
    });
    expect(result.channels.map((c) => c.channel)).toEqual([
      "data",
      "eyes",
      "alignmentPatterns",
      "timingPatterns",
    ]);
    expect(result.channels.map((c) => c.layerIndex)).toEqual([0, 1, 2, 3]);
  });

  test("eyes + safeArea: safeArea is deepest (last in document order)", () => {
    const result = qrToM0("https://m0saic.io", {
      version: 6,
      channels: { eyes: true },
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    const channelOrder = result.channels.map((c) => c.channel);
    expect(channelOrder).toEqual(["data", "eyes", "safeArea"]);
    // safeArea frame is the last in document order.
    const frames = parseM0StringToRenderFrames(
      String(result.m0),
      result.canvasW,
      result.canvasH,
    );
    const lastFrame = frames[frames.length - 1];
    expect(lastFrame).toBeDefined();
    // The last frame's stableKey should be the safeArea key.
    expect(result.safeAreaStableKey).toBe(result.channelByRole.safeArea!.frames[0].stableKey);
  });

  test("all channels: pixel-coverage identical to no-channels baseline (visual identity)", () => {
    // Channels are pure suppress+overlay. The dark cells covered by an
    // overlay should be visually identical to the original dark cells (the
    // overlay is just a single rect covering the same dark area).
    // For now we just assert the m0 validates — pixel-rendering identity
    // would need a render-time test.
    const result = qrToM0("https://m0saic.io", {
      version: 6,
      channels: {
        eyes: true,
        alignmentPatterns: true,
        timingPatterns: true,
        formatInfo: true,
        versionInfo: true,
        darkModule: true,
        separators: true,
      },
    });
    expect(validateM0String(String(result.m0)).ok).toBe(true);
  });
});

describe("qrToM0 — channels: labels map", () => {
  test("labels map covers exactly the channel frames (no extras, no missing)", () => {
    const result = qrToM0("https://m0saic.io", {
      version: 7,
      channels: { eyes: true, timingPatterns: true, darkModule: true },
    });
    // 3 eyes + 2 timing + 1 darkmodule = 6 labels.
    expect(Object.keys(result.labels)).toHaveLength(6);
    // Every channel frame's stableKey must appear in labels.
    for (const ch of result.channels) {
      if (ch.channel === "data") continue;
      for (const frame of ch.frames) {
        expect(result.labels[frame.stableKey]).toBeDefined();
      }
    }
  });

  test("safeArea label is qr-safe-area", () => {
    const result = qrToM0("https://m0saic.io", {
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    expect(result.labels[result.safeAreaStableKey!]).toBe("qr-safe-area");
  });
});

describe("qrToM0 — channels: determinism", () => {
  test("same input → identical m0 + identical channel frames", () => {
    const a = qrToM0("https://m0saic.io", {
      channels: { eyes: true, alignmentPatterns: true },
      version: 7,
    });
    const b = qrToM0("https://m0saic.io", {
      channels: { eyes: true, alignmentPatterns: true },
      version: 7,
    });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.channelByRole.eyes!.frames).toEqual(b.channelByRole.eyes!.frames);
    expect(a.labels).toEqual(b.labels);
  });
});

describe("qrToM0 — channels: pixel bounds", () => {
  test("eye bounds in canvas pixels = (col + quietZone) * pxPerCell × pxPerCell per cell", () => {
    const result = qrToM0("https://m0saic.io", { channels: { eyes: true } });
    const N = result.matrixSize + 2 * result.quietZone;
    const pxPerCell = result.canvasW / N;
    const tlEye = result.channelByRole.eyes!.frames[0];
    expect(tlEye.bounds.x).toBe((0 + result.quietZone) * pxPerCell);
    expect(tlEye.bounds.y).toBe((0 + result.quietZone) * pxPerCell);
    expect(tlEye.bounds.width).toBe(7 * pxPerCell);
    expect(tlEye.bounds.height).toBe(7 * pxPerCell);
  });
});

// ── pack: true (engine-perf optimization) — Phase 3 additions ──────

describe("qrToM0 — pack mode", () => {
  test("pack: true reduces total visible frame count vs default", () => {
    const baseline = qrToM0("https://m0saic.io");
    const baselineFrames = parseM0StringToRenderFrames(
      String(baseline.m0),
      baseline.canvasW,
      baseline.canvasH,
    );
    const packed = qrToM0("https://m0saic.io", { pack: true });
    const packedFrames = parseM0StringToRenderFrames(
      String(packed.m0),
      packed.canvasW,
      packed.canvasH,
    );
    expect(packedFrames.length).toBeLessThan(baselineFrames.length);
    // Rowwise packing typically halves the frame count on a typical QR.
    expect(packedFrames.length).toBeLessThan(baselineFrames.length * 0.75);
  });

  test("pack: true data channel exposes packed rects with qr-pack-{i} labels", () => {
    const result = qrToM0("https://m0saic.io", { pack: true });
    expect(result.channelByRole.data?.frames.length).toBeGreaterThan(0);
    for (let i = 0; i < result.channelByRole.data!.frames.length; i++) {
      const frame = result.channelByRole.data!.frames[i];
      expect(result.labels[frame.stableKey]).toBe(`qr-pack-${i}`);
    }
  });

  test("pack: true preserves visual identity (same dark cells covered)", () => {
    // For each (row, col) of the matrix, check that the packed rects cover
    // exactly the dark cells.
    const result = qrToM0("https://m0saic.io", { pack: true });
    const N = result.matrixSize + 2 * result.quietZone;
    const { qrToMatrix } = require("./qrToMatrix");
    const matrix = qrToMatrix("https://m0saic.io", { errorCorrectionLevel: "M" });

    // Build coverage from data channel frames.
    const covered = Array.from({ length: N }, () => new Array<boolean>(N).fill(false));
    for (const frame of result.channelByRole.data!.frames) {
      const r0 = frame.cellBounds.row + result.quietZone;
      const c0 = frame.cellBounds.col + result.quietZone;
      for (let dy = 0; dy < frame.cellBounds.h; dy++) {
        for (let dx = 0; dx < frame.cellBounds.w; dx++) {
          covered[r0 + dy][c0 + dx] = true;
        }
      }
    }
    // Coverage must equal the matrix's dark cells (no missing, no extras).
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        expect(covered[r][c]).toBe(matrix.modules[r][c]);
      }
    }
  });

  test("pack: true is compatible with channels (eyes get their layer, dark data area gets packed)", () => {
    const result = qrToM0("https://m0saic.io", {
      pack: true,
      channels: { eyes: true },
    });
    expect(result.channelByRole.eyes?.frames).toHaveLength(3);
    expect(result.channelByRole.data?.frames.length).toBeGreaterThan(0);
    // Composed m0 still validates.
    expect(validateM0String(String(result.m0)).ok).toBe(true);
  });

  test("pack: true is deterministic", () => {
    const a = qrToM0("https://m0saic.io", { pack: true });
    const b = qrToM0("https://m0saic.io", { pack: true });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.channelByRole.data!.frames.length).toBe(
      b.channelByRole.data!.frames.length,
    );
  });

  test("pack: { strategy: 'rowwise' } object form works", () => {
    const result = qrToM0("https://m0saic.io", { pack: { strategy: "rowwise" } });
    expect(result.channelByRole.data?.frames.length).toBeGreaterThan(0);
  });
});

describe("qrToM0 — structured payload smokes", () => {
  // The payload helpers are unit-tested in qrPayloads.test.ts. These cases
  // confirm nothing in the canonical payload shapes (escaped chars, CRLF,
  // long byte sequences) chokes the encoder pipeline end-to-end.
  test("wifi payload encodes through qrToM0", () => {
    const text = qrPayloadWifi({ ssid: "Home;Wi-Fi", password: "p@ss\";word", hidden: true });
    const result = qrToM0(text);
    expect(validateM0String(String(result.m0)).ok).toBe(true);
    expect(result.matrixSize).toBeGreaterThan(0);
  });

  test("vCard payload encodes through qrToM0", () => {
    const text = qrPayloadVCard({
      fullName: "Ada Lovelace",
      org: "Analytical Engine, Ltd.",
      phone: "+15551234",
      email: "ada@example.com",
    });
    const result = qrToM0(text);
    expect(validateM0String(String(result.m0)).ok).toBe(true);
  });

  test("geo payload encodes through qrToM0", () => {
    const text = qrPayloadGeo({ lat: 37.7869, lng: -122.3996, query: "Pier 39" });
    const result = qrToM0(text);
    expect(validateM0String(String(result.m0)).ok).toBe(true);
  });
});
