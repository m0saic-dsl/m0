import { barcodeToBars } from "./barcodeToBars";

describe("barcodeToBars — defaults", () => {
  test("default format is code128", () => {
    const r = barcodeToBars("Hello");
    expect(r.format).toBe("code128");
  });

  test("default Code 128 quiet zone is 10 modules per side", () => {
    const r = barcodeToBars("Hello");
    expect(r.quietZoneModules).toBe(10);
  });

  test("explicit quietZoneModules: 0 → raw bar pattern, no padding bars", () => {
    const r = barcodeToBars("Hello", { quietZoneModules: 0 });
    expect(r.quietZoneModules).toBe(0);
    // First bar is dark (start of Start B pattern).
    expect(r.bars[0].ink).toBe("dark");
    // Last bar is dark (final bar of Stop pattern).
    expect(r.bars[r.bars.length - 1].ink).toBe("dark");
  });

  test("rejects negative or non-integer quiet zone", () => {
    expect(() => barcodeToBars("hi", { quietZoneModules: -1 })).toThrow(
      /non-negative integer/,
    );
    expect(() => barcodeToBars("hi", { quietZoneModules: 1.5 })).toThrow(
      /non-negative integer/,
    );
  });
});

describe("barcodeToBars — layout invariants", () => {
  test("first and last bars are light quiet zones when quietZoneModules > 0", () => {
    const r = barcodeToBars("Hello");
    expect(r.bars[0]).toMatchObject({
      x: 0,
      widthModules: 10,
      ink: "light",
    });
    expect(r.bars[r.bars.length - 1]).toMatchObject({
      widthModules: 10,
      ink: "light",
    });
  });

  test("bars tile the canvas exactly with no gaps", () => {
    const r = barcodeToBars("Hello");
    let cursor = 0;
    for (const bar of r.bars) {
      expect(bar.x).toBe(cursor);
      cursor += bar.widthModules;
    }
    expect(cursor).toBe(r.modulesWide);
  });

  test("modulesWide = quietZone*2 + innerBarRegion", () => {
    const r = barcodeToBars("Hello", { quietZoneModules: 10 });
    const innerSum = r.bars
      .filter((b, i) => i !== 0 && i !== r.bars.length - 1)
      .reduce((acc, b) => acc + b.widthModules, 0);
    expect(r.modulesWide).toBe(10 + 10 + innerSum);
  });

  test("inner bars strictly alternate dark / light", () => {
    const r = barcodeToBars("Hello", { quietZoneModules: 10 });
    // bars[0] is the left quiet zone (light).
    // bars[1] is the first dark bar of Start B.
    // Then strictly alternating until the right quiet zone.
    let expectedInk: "dark" | "light" = "dark";
    for (let i = 1; i < r.bars.length - 1; i++) {
      expect(r.bars[i].ink).toBe(expectedInk);
      expectedInk = expectedInk === "dark" ? "light" : "dark";
    }
    // Right quiet zone (bars[last]) is light. Since the Stop ends in dark,
    // the alternation walks dark → light at the boundary, so the right quiet
    // zone follows naturally.
    expect(r.bars[r.bars.length - 1].ink).toBe("light");
  });

  test("inner-bar count matches encoder: 6*(symbols.length - 1) + 7", () => {
    const r = barcodeToBars("PJJ123C");
    // 9 symbols (Start + 7 data + checksum + Stop) → 6*9 + 1 extra Stop width
    // Actually: 6 widths per symbol for 9 symbols including Stop, but Stop
    // has 7 widths (1 extra). So innerBars = 6*(symbols.length - 1) + 7.
    const inner = r.bars.length - 2; // strip both quiet zones
    expect(inner).toBe(6 * (r.encodedSymbols.length - 1) + 7);
  });
});

describe("barcodeToBars — payload + HRI passthrough", () => {
  test("payload mirrors input verbatim", () => {
    expect(barcodeToBars("Hello").payload).toBe("Hello");
    expect(barcodeToBars("1234").payload).toBe("1234");
  });

  test("humanReadableText is the raw input for Code 128", () => {
    expect(barcodeToBars("Hello").humanReadableText).toBe("Hello");
    expect(barcodeToBars("1234").humanReadableText).toBe("1234");
  });
});

describe("barcodeToBars — determinism", () => {
  test("same input twice → byte-identical output", () => {
    const a = barcodeToBars("M0SAIC");
    const b = barcodeToBars("M0SAIC");
    expect(a.modulesWide).toBe(b.modulesWide);
    expect(a.quietZoneModules).toBe(b.quietZoneModules);
    expect(a.encodedSymbols).toEqual(b.encodedSymbols);
    expect(a.bars.length).toBe(b.bars.length);
    for (let i = 0; i < a.bars.length; i++) {
      expect(a.bars[i].x).toBe(b.bars[i].x);
      expect(a.bars[i].widthModules).toBe(b.bars[i].widthModules);
      expect(a.bars[i].ink).toBe(b.bars[i].ink);
    }
  });
});

describe("barcodeToBars — Code 128 HRI layout", () => {
  test("hriFrames is a single role:text frame spanning the inner bar region", () => {
    const r = barcodeToBars("Hello");
    expect(r.hriFrames).toHaveLength(1);
    expect(r.hriFrames[0].role).toBe("text");
    expect(r.hriFrames[0].text).toBe("Hello");
    expect(r.hriFrames[0].x).toBe(r.quietZoneModules);
    expect(r.hriFrames[0].w).toBe(r.modulesWide - 2 * r.quietZoneModules);
  });
});

describe("barcodeToBars — EAN-13", () => {
  test("format ean13 produces 95-module inner + 9-module default quiet zones", () => {
    const r = barcodeToBars("5901234123457", { format: "ean13" });
    expect(r.format).toBe("ean13");
    expect(r.quietZoneModules).toBe(9);
    expect(r.modulesWide).toBe(95 + 18);
  });

  test("12-digit input → check digit auto-appended into payload", () => {
    const r = barcodeToBars("590123412345", { format: "ean13" });
    expect(r.payload).toBe("5901234123457");
  });

  test("encodedSymbols are the 13 individual digit values", () => {
    const r = barcodeToBars("5901234123457", { format: "ean13" });
    expect(r.encodedSymbols).toEqual([5, 9, 0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 7]);
  });

  test("hriFrames has 3 entries: leading / left / right", () => {
    const r = barcodeToBars("5901234123457", { format: "ean13" });
    expect(r.hriFrames).toHaveLength(3);
    expect(r.hriFrames.map((f) => f.role)).toEqual(["leading", "left", "right"]);
    expect(r.hriFrames[0].text).toBe("5");
    expect(r.hriFrames[1].text).toBe("901234");
    expect(r.hriFrames[2].text).toBe("123457");
  });

  test("hriFrames x positions: leading@0, left@QZ+3, right@QZ+50", () => {
    const r = barcodeToBars("5901234123457", { format: "ean13" });
    const QZ = r.quietZoneModules;
    expect(r.hriFrames[0].x).toBe(0);
    expect(r.hriFrames[0].w).toBe(QZ);
    expect(r.hriFrames[1].x).toBe(QZ + 3);
    expect(r.hriFrames[1].w).toBe(42);
    expect(r.hriFrames[2].x).toBe(QZ + 50);
    expect(r.hriFrames[2].w).toBe(42);
  });

  test("humanReadableText is space-separated digit groups", () => {
    const r = barcodeToBars("5901234123457", { format: "ean13" });
    expect(r.humanReadableText).toBe("5 901234 123457");
  });
});

describe("barcodeToBars — UPC-A", () => {
  test("format upca produces 95-module inner + 9-module default quiet zones", () => {
    const r = barcodeToBars("036000291452", { format: "upca" });
    expect(r.format).toBe("upca");
    expect(r.quietZoneModules).toBe(9);
    expect(r.modulesWide).toBe(95 + 18);
  });

  test("11-digit input → check digit auto-appended into payload (12 digits)", () => {
    const r = barcodeToBars("03600029145", { format: "upca" });
    expect(r.payload).toBe("036000291452");
  });

  test("encodedSymbols are the 12 UPC-A digit values (NOT 13)", () => {
    const r = barcodeToBars("036000291452", { format: "upca" });
    expect(r.encodedSymbols).toEqual([0, 3, 6, 0, 0, 0, 2, 9, 1, 4, 5, 2]);
  });

  test("hriFrames has 4 entries: leading / left / right / trailing (1-5-5-1)", () => {
    const r = barcodeToBars("036000291452", { format: "upca" });
    expect(r.hriFrames).toHaveLength(4);
    expect(r.hriFrames.map((f) => f.role)).toEqual([
      "leading",
      "left",
      "right",
      "trailing",
    ]);
    expect(r.hriFrames[0].text).toBe("0");
    expect(r.hriFrames[1].text).toBe("36000");
    expect(r.hriFrames[2].text).toBe("29145");
    expect(r.hriFrames[3].text).toBe("2");
  });

  test("hriFrames x positions match 1-5-5-1 grouping under bars", () => {
    const r = barcodeToBars("036000291452", { format: "upca" });
    const QZ = r.quietZoneModules;
    // Leading: in left quiet zone.
    expect(r.hriFrames[0].x).toBe(0);
    expect(r.hriFrames[0].w).toBe(QZ);
    // Left 5 digits: skip first L-code (modules QZ+3 to QZ+10), then 5 L-codes
    // covering modules QZ+10 to QZ+45.
    expect(r.hriFrames[1].x).toBe(QZ + 10);
    expect(r.hriFrames[1].w).toBe(35);
    // Right 5 digits: start at QZ+50 (post-center-guard), span 35 modules.
    expect(r.hriFrames[2].x).toBe(QZ + 50);
    expect(r.hriFrames[2].w).toBe(35);
    // Trailing: in right quiet zone, after end guard (modules QZ+95).
    expect(r.hriFrames[3].x).toBe(QZ + 95);
    expect(r.hriFrames[3].w).toBe(QZ);
  });

  test("bar pattern is byte-identical to ean13Encode('0' + upcaPayload)", () => {
    const upcaBars = barcodeToBars("036000291452", { format: "upca" });
    const eanBars = barcodeToBars("0036000291452", { format: "ean13" });
    // Strip leading/trailing quiet zones, compare the inner bar pattern.
    const upcaInner = upcaBars.bars.filter(
      (_, i) => i !== 0 && i !== upcaBars.bars.length - 1,
    );
    const eanInner = eanBars.bars.filter(
      (_, i) => i !== 0 && i !== eanBars.bars.length - 1,
    );
    expect(upcaInner.length).toBe(eanInner.length);
    for (let i = 0; i < upcaInner.length; i++) {
      expect(upcaInner[i].widthModules).toBe(eanInner[i].widthModules);
      expect(upcaInner[i].ink).toBe(eanInner[i].ink);
    }
  });
});

describe("barcodeToBars — format-specific defaults", () => {
  test("code128 default quiet zone is 10", () => {
    expect(barcodeToBars("Hello").quietZoneModules).toBe(10);
  });

  test("ean13 default quiet zone is 9", () => {
    expect(barcodeToBars("5901234123457", { format: "ean13" }).quietZoneModules).toBe(9);
  });

  test("upca default quiet zone is 9", () => {
    expect(barcodeToBars("036000291452", { format: "upca" }).quietZoneModules).toBe(9);
  });

  test("explicit quietZoneModules overrides per-format default", () => {
    const r = barcodeToBars("5901234123457", { format: "ean13", quietZoneModules: 0 });
    expect(r.quietZoneModules).toBe(0);
    expect(r.modulesWide).toBe(95);
  });
});
