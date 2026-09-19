import { isValidM0String } from "@m0saic/dsl";
import { barcodeToBars } from "./barcodeToBars";
import { barcodeToM0 } from "./barcodeToM0";

describe("barcodeToM0 — defaults", () => {
  test("default invocation produces a valid m0 + expected canvas dimensions", () => {
    const r = barcodeToM0("Hello");
    expect(isValidM0String(String(r.m0))).toBe(true);
    expect(r.format).toBe("code128");
    expect(r.quietZoneModules).toBe(10);

    // Default moduleWidthPx=2, default heightPx=80 → heightModules=40.
    // canvasH = 40 * 2 = 80 (no HRI by default).
    expect(r.canvasH).toBe(80);

    // canvasW = modulesWide * moduleWidthPx.
    const bars = barcodeToBars("Hello");
    expect(r.canvasW).toBe(bars.modulesWide * 2);
  });

  test("humanReadable defaults to mode: none → no HRI frame, no extra canvas height", () => {
    const r = barcodeToM0("Hello");
    expect(r.humanReadableFrames).toEqual([]);
    expect(r.channelByRole.humanReadable).toBeUndefined();
  });

  test("`bars` channel is always present at layerIndex 0", () => {
    const r = barcodeToM0("Hello");
    expect(r.channels[0].channel).toBe("bars");
    expect(r.channels[0].layerIndex).toBe(0);
    expect(r.channels[0].frames.length).toBeGreaterThan(0);
  });

  test("payload + humanReadableText pass through from encoder", () => {
    const r = barcodeToM0("Hello");
    expect(r.payload).toBe("Hello");
    expect(r.humanReadableText).toBe("Hello");
  });
});

describe("barcodeToM0 — option validation", () => {
  test("moduleWidthPx must be a positive integer", () => {
    expect(() => barcodeToM0("Hi", { moduleWidthPx: 0 })).toThrow(/positive integer/);
    expect(() => barcodeToM0("Hi", { moduleWidthPx: -1 })).toThrow(/positive integer/);
    expect(() => barcodeToM0("Hi", { moduleWidthPx: 1.5 })).toThrow(/positive integer/);
  });

  test("heightPx must be positive", () => {
    expect(() => barcodeToM0("Hi", { heightPx: 0 })).toThrow(/positive number/);
    expect(() => barcodeToM0("Hi", { heightPx: -10 })).toThrow(/positive number/);
  });

  test("humanReadable.heightPct must be in (0, 1)", () => {
    expect(() => barcodeToM0("Hi", { humanReadable: { mode: "carve", heightPct: 0 } }))
      .toThrow(/heightPct/);
    expect(() => barcodeToM0("Hi", { humanReadable: { mode: "carve", heightPct: 1 } }))
      .toThrow(/heightPct/);
    expect(() => barcodeToM0("Hi", { humanReadable: { mode: "carve", heightPct: -0.5 } }))
      .toThrow(/heightPct/);
  });

  test("humanReadable.heightPx must be positive", () => {
    expect(() => barcodeToM0("Hi", { humanReadable: { mode: "carve", heightPx: 0 } }))
      .toThrow(/heightPx/);
  });
});

describe("barcodeToM0 — bars channel", () => {
  test("bars.frames has one entry per dark bar", () => {
    const bars = barcodeToBars("Hello");
    const darkCount = bars.bars.filter((b) => b.ink === "dark").length;
    const r = barcodeToM0("Hello");
    expect(r.channels[0].frames).toHaveLength(darkCount);
  });

  test("each bar frame's pixel bounds line up with the encoder's positions", () => {
    const r = barcodeToM0("Hello", { moduleWidthPx: 3, heightPx: 60 });
    const bars = barcodeToBars("Hello");
    const darkBars = bars.bars.filter((b) => b.ink === "dark");
    // heightPx=60 / moduleWidthPx=3 → heightModules=20. Bar pixel height = 20*3 = 60.
    for (let i = 0; i < darkBars.length; i++) {
      const f = r.channels[0].frames[i];
      expect(f.bounds.x).toBe(darkBars[i].x * 3);
      expect(f.bounds.y).toBe(0);
      expect(f.bounds.width).toBe(darkBars[i].widthModules * 3);
      expect(f.bounds.height).toBe(60);
    }
  });

  test("bar labels follow barcode-bar-{i} format", () => {
    const r = barcodeToM0("Hello");
    for (let i = 0; i < r.channels[0].frames.length; i++) {
      const key = r.channels[0].frames[i].stableKey;
      expect(r.labels[key]).toBe(`barcode-bar-${i}`);
    }
  });
});

describe("barcodeToM0 — structural channels (opt-in)", () => {
  test("no channels enabled → only `bars` in channels[]", () => {
    const r = barcodeToM0("Hello");
    expect(r.channels.map((c) => c.channel)).toEqual(["bars"]);
  });

  test("quietZoneLeft enabled → adds a labeled anchor at the left quiet zone", () => {
    const r = barcodeToM0("Hello", { channels: { quietZoneLeft: true } });
    const ch = r.channelByRole.quietZoneLeft;
    expect(ch).toBeDefined();
    expect(ch!.frames).toHaveLength(1);
    expect(ch!.frames[0].bounds.x).toBe(0);
    expect(ch!.frames[0].bounds.width).toBe(r.quietZoneModules * 2);
    expect(r.labels[ch!.frames[0].stableKey]).toBe("barcode-quiet-zone-left");
  });

  test("quietZoneRight enabled → labeled anchor at the right quiet zone", () => {
    const r = barcodeToM0("Hello", { channels: { quietZoneRight: true } });
    const ch = r.channelByRole.quietZoneRight;
    expect(ch).toBeDefined();
    expect(ch!.frames).toHaveLength(1);
    const moduleWidthPx = 2;
    expect(ch!.frames[0].bounds.x).toBe(
      (r.modulesWide - r.quietZoneModules) * moduleWidthPx,
    );
  });

  test("startGuard enabled → 11-module anchor right after left quiet zone", () => {
    const r = barcodeToM0("Hello", { channels: { startGuard: true } });
    const ch = r.channelByRole.startGuard;
    expect(ch).toBeDefined();
    expect(ch!.frames[0].cellBounds).toEqual({
      row: 0,
      col: r.quietZoneModules,
      w: 11,
      h: 40,
    });
  });

  test("stopGuard enabled → 13-module anchor before right quiet zone", () => {
    const r = barcodeToM0("Hello", { channels: { stopGuard: true } });
    const ch = r.channelByRole.stopGuard;
    expect(ch).toBeDefined();
    expect(ch!.frames[0].cellBounds.w).toBe(13);
    expect(ch!.frames[0].cellBounds.col).toBe(
      r.modulesWide - r.quietZoneModules - 13,
    );
  });

  test("all 4 structural channels enabled → 5 entries in channels[] (bars + 4)", () => {
    const r = barcodeToM0("Hello", {
      channels: {
        quietZoneLeft: true,
        quietZoneRight: true,
        startGuard: true,
        stopGuard: true,
      },
    });
    expect(r.channels.map((c) => c.channel)).toEqual([
      "bars",
      "quietZoneLeft",
      "quietZoneRight",
      "startGuard",
      "stopGuard",
    ]);
  });
});

describe("barcodeToM0 — channels-on vs channels-off visual equivalence", () => {
  test("the rendered bar pattern is the same whether channels are on or off", () => {
    // We can't pixel-diff here, but we can verify: the canvas size and the
    // count + position of `1` paint frames in the bars channel must match.
    const off = barcodeToM0("Hello");
    const on = barcodeToM0("Hello", {
      channels: {
        quietZoneLeft: true,
        quietZoneRight: true,
        startGuard: true,
        stopGuard: true,
      },
    });
    expect(on.canvasW).toBe(off.canvasW);
    expect(on.canvasH).toBe(off.canvasH);
    expect(on.channelByRole.bars!.frames.length).toBe(off.channelByRole.bars!.frames.length);
    for (let i = 0; i < off.channelByRole.bars!.frames.length; i++) {
      expect(on.channelByRole.bars!.frames[i].bounds).toEqual(
        off.channelByRole.bars!.frames[i].bounds,
      );
    }
  });
});

describe("barcodeToM0 — HRI carve", () => {
  test("mode: none → no HRI frames, canvas height unchanged", () => {
    const r = barcodeToM0("Hello", { humanReadable: { mode: "none" } });
    expect(r.humanReadableFrames).toEqual([]);
    expect(r.canvasH).toBe(80);
  });

  test("mode: carve → canvas extends, HRI frame has stableKey", () => {
    const r = barcodeToM0("Hello", {
      humanReadable: { mode: "carve", heightPct: 0.15 },
    });
    expect(r.humanReadableFrames).toHaveLength(1);
    const frame = r.humanReadableFrames[0];
    expect(frame.stableKey).toBeDefined();
    expect(frame.text).toBe("Hello");
    // hriHeightModules = round(40*0.15) = 6 (because heightPx*pct/moduleWidthPx = 80*0.15/2 = 6).
    expect(frame.bounds.y).toBe(80);
    expect(frame.bounds.height).toBe(12); // 6 modules * 2 px = 12.
    expect(r.canvasH).toBe(92);
  });

  test("mode: bounds → canvas extends, HRI frame has bounds but NO stableKey", () => {
    const r = barcodeToM0("Hello", {
      humanReadable: { mode: "bounds", heightPct: 0.2 },
    });
    expect(r.humanReadableFrames).toHaveLength(1);
    const frame = r.humanReadableFrames[0];
    expect(frame.stableKey).toBeUndefined();
    expect(frame.text).toBe("Hello");
    // bounds mode still reserves space in the canvas.
    expect(r.canvasH).toBeGreaterThan(80);
  });

  test("absolute heightPx takes precedence over heightPct", () => {
    const r = barcodeToM0("Hello", {
      humanReadable: { mode: "carve", heightPx: 20, heightPct: 0.99 },
    });
    expect(r.humanReadableFrames[0].bounds.height).toBe(20);
    expect(r.canvasH).toBe(80 + 20);
  });

  test("mode: carve adds humanReadable to channels and labels its stableKey", () => {
    const r = barcodeToM0("Hello", { humanReadable: { mode: "carve" } });
    const hri = r.channelByRole.humanReadable;
    expect(hri).toBeDefined();
    expect(hri!.frames).toHaveLength(1);
    const key = r.humanReadableFrames[0].stableKey!;
    expect(r.labels[key]).toBe("barcode-hri-text");
    expect(hri!.frames[0].stableKey).toBe(key);
  });

  test("mode: bounds does NOT add humanReadable to channels (no anchor to label)", () => {
    const r = barcodeToM0("Hello", { humanReadable: { mode: "bounds" } });
    expect(r.channelByRole.humanReadable).toBeUndefined();
  });
});

describe("barcodeToM0 — m0 validity", () => {
  test("output m0 is a valid M0String per the DSL validator", () => {
    for (const text of ["A", "Hello", "PJJ123C", "1234", "M0SAIC"]) {
      const r = barcodeToM0(text);
      expect(isValidM0String(String(r.m0))).toBe(true);
    }
  });

  test("with all channels + HRI carve, m0 is still valid", () => {
    const r = barcodeToM0("Hello", {
      humanReadable: { mode: "carve" },
      channels: {
        quietZoneLeft: true,
        quietZoneRight: true,
        startGuard: true,
        stopGuard: true,
      },
    });
    expect(isValidM0String(String(r.m0))).toBe(true);
  });
});

describe("barcodeToM0 — determinism", () => {
  test("identical input → byte-identical m0 + bounds", () => {
    const a = barcodeToM0("M0SAIC", { humanReadable: { mode: "carve" } });
    const b = barcodeToM0("M0SAIC", { humanReadable: { mode: "carve" } });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.canvasW).toBe(b.canvasW);
    expect(a.canvasH).toBe(b.canvasH);
    expect(a.humanReadableFrames[0].bounds).toEqual(b.humanReadableFrames[0].bounds);
  });

  test("identical input across 100 runs → byte-identical m0", () => {
    const ref = String(barcodeToM0("Hello").m0);
    for (let i = 0; i < 100; i++) {
      expect(String(barcodeToM0("Hello").m0)).toBe(ref);
    }
  });
});

describe("barcodeToM0 — channel labels", () => {
  test("each enabled channel frame's stableKey is in labels", () => {
    const r = barcodeToM0("Hello", {
      humanReadable: { mode: "carve" },
      channels: {
        quietZoneLeft: true,
        quietZoneRight: true,
        startGuard: true,
        stopGuard: true,
      },
    });
    const overlayChannels = r.channels.filter((c) => c.channel !== "bars");
    for (const ch of overlayChannels) {
      for (const f of ch.frames) {
        expect(r.labels[f.stableKey]).toBeDefined();
      }
    }
  });
});

describe("barcodeToM0 — EAN-13 format", () => {
  test("default HRI mode for ean13 is carve (product-code convention)", () => {
    const r = barcodeToM0("5901234123457", { format: "ean13" });
    expect(r.format).toBe("ean13");
    expect(r.humanReadableFrames).toHaveLength(3);
    expect(r.humanReadableFrames.every((f) => f.stableKey)).toBe(true);
    expect(r.channelByRole.humanReadable).toBeDefined();
  });

  test("HRI frames carry leading/left/right labels", () => {
    const r = barcodeToM0("5901234123457", { format: "ean13" });
    const labelTexts = r.humanReadableFrames.map((f) => r.labels[f.stableKey!]);
    expect(labelTexts).toEqual([
      "barcode-hri-leading",
      "barcode-hri-left",
      "barcode-hri-right",
    ]);
  });

  test("HRI frame texts match the digit groups (1-6-6)", () => {
    const r = barcodeToM0("5901234123457", { format: "ean13" });
    expect(r.humanReadableFrames.map((f) => f.text)).toEqual([
      "5",
      "901234",
      "123457",
    ]);
  });

  test("HRI frame x positions are in canvas pixel coords", () => {
    const r = barcodeToM0("5901234123457", {
      format: "ean13",
      moduleWidthPx: 3,
    });
    const QZ_px = r.quietZoneModules * 3;
    expect(r.humanReadableFrames[0].bounds.x).toBe(0);
    expect(r.humanReadableFrames[0].bounds.width).toBe(QZ_px);
    expect(r.humanReadableFrames[1].bounds.x).toBe(QZ_px + 3 * 3);
    expect(r.humanReadableFrames[1].bounds.width).toBe(42 * 3);
  });

  test("explicit mode: none disables HRI even for ean13", () => {
    const r = barcodeToM0("5901234123457", {
      format: "ean13",
      humanReadable: { mode: "none" },
    });
    expect(r.humanReadableFrames).toEqual([]);
  });

  test("m0 is valid", () => {
    const r = barcodeToM0("5901234123457", { format: "ean13" });
    expect(isValidM0String(String(r.m0))).toBe(true);
  });

  test("12-digit input auto-checks", () => {
    const r = barcodeToM0("590123412345", { format: "ean13" });
    expect(r.payload).toBe("5901234123457");
  });
});

describe("barcodeToM0 — UPC-A format", () => {
  test("default HRI mode for upca is carve, producing 4 frames", () => {
    const r = barcodeToM0("036000291452", { format: "upca" });
    expect(r.format).toBe("upca");
    expect(r.humanReadableFrames).toHaveLength(4);
    expect(r.humanReadableFrames.every((f) => f.stableKey)).toBe(true);
  });

  test("HRI labels follow leading/left/right/trailing roles", () => {
    const r = barcodeToM0("036000291452", { format: "upca" });
    const labelTexts = r.humanReadableFrames.map((f) => r.labels[f.stableKey!]);
    expect(labelTexts).toEqual([
      "barcode-hri-leading",
      "barcode-hri-left",
      "barcode-hri-right",
      "barcode-hri-trailing",
    ]);
  });

  test("HRI frame texts match 1-5-5-1 grouping", () => {
    const r = barcodeToM0("036000291452", { format: "upca" });
    expect(r.humanReadableFrames.map((f) => f.text)).toEqual([
      "0",
      "36000",
      "29145",
      "2",
    ]);
  });

  test("m0 is valid", () => {
    const r = barcodeToM0("036000291452", { format: "upca" });
    expect(isValidM0String(String(r.m0))).toBe(true);
  });

  test("11-digit input auto-checks", () => {
    const r = barcodeToM0("03600029145", { format: "upca" });
    expect(r.payload).toBe("036000291452");
  });
});
