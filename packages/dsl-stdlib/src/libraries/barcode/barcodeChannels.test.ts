import { barcodeToBars } from "./barcodeToBars";
import {
  CODE128_GUARD_WIDTHS,
  regionsForChannel,
  STRUCTURAL_CHANNEL_ORDER,
  verifyGuardAlignment,
  type ChannelContext,
} from "./barcodeChannels";
import { code128Encode } from "./code128";

function ctxFor(text: string): ChannelContext {
  const bars = barcodeToBars(text);
  return {
    format: bars.format,
    innerModules: bars.modulesWide - 2 * bars.quietZoneModules,
    modulesWide: bars.modulesWide,
    quietZoneModules: bars.quietZoneModules,
    heightModules: 40,
  };
}

describe("regionsForChannel — quietZoneLeft / quietZoneRight", () => {
  test("left quiet zone spans (0, 0, QZ, heightModules)", () => {
    const ctx = ctxFor("Hello");
    const regions = regionsForChannel("quietZoneLeft", ctx);
    expect(regions).toHaveLength(1);
    expect(regions[0].region).toEqual({
      row: 0,
      col: 0,
      w: ctx.quietZoneModules,
      h: ctx.heightModules,
    });
    expect(regions[0].label).toBe("barcode-quiet-zone-left");
  });

  test("right quiet zone spans (modulesWide - QZ, 0, QZ, heightModules)", () => {
    const ctx = ctxFor("Hello");
    const regions = regionsForChannel("quietZoneRight", ctx);
    expect(regions).toHaveLength(1);
    expect(regions[0].region).toEqual({
      row: 0,
      col: ctx.modulesWide - ctx.quietZoneModules,
      w: ctx.quietZoneModules,
      h: ctx.heightModules,
    });
    expect(regions[0].label).toBe("barcode-quiet-zone-right");
  });

  test("quietZoneModules = 0 → no quiet-zone regions", () => {
    const bars = barcodeToBars("Hello", { quietZoneModules: 0 });
    const ctx: ChannelContext = {
      format: bars.format,
      innerModules: bars.modulesWide,
      modulesWide: bars.modulesWide,
      quietZoneModules: 0,
      heightModules: 40,
    };
    expect(regionsForChannel("quietZoneLeft", ctx)).toHaveLength(0);
    expect(regionsForChannel("quietZoneRight", ctx)).toHaveLength(0);
  });
});

describe("regionsForChannel — startGuard / stopGuard", () => {
  test("startGuard sits immediately right of the left quiet zone, 11 modules wide", () => {
    const ctx = ctxFor("Hello");
    const regions = regionsForChannel("startGuard", ctx);
    expect(regions).toHaveLength(1);
    expect(regions[0].region).toEqual({
      row: 0,
      col: ctx.quietZoneModules,
      w: CODE128_GUARD_WIDTHS.symbolModules, // 11
      h: ctx.heightModules,
    });
  });

  test("stopGuard sits immediately left of the right quiet zone, 13 modules wide", () => {
    const ctx = ctxFor("Hello");
    const regions = regionsForChannel("stopGuard", ctx);
    expect(regions).toHaveLength(1);
    expect(regions[0].region).toEqual({
      row: 0,
      col: ctx.modulesWide - ctx.quietZoneModules - CODE128_GUARD_WIDTHS.stopModules,
      w: CODE128_GUARD_WIDTHS.stopModules, // 13
      h: ctx.heightModules,
    });
  });
});

describe("STRUCTURAL_CHANNEL_ORDER", () => {
  test("contains all 4 structural channels in fixed order", () => {
    expect(STRUCTURAL_CHANNEL_ORDER).toEqual([
      "quietZoneLeft",
      "quietZoneRight",
      "startGuard",
      "stopGuard",
    ]);
  });
});

describe("verifyGuardAlignment", () => {
  test("agrees with the encoder for canonical inputs", () => {
    for (const text of ["A", "Hello", "PJJ123C", "00", "1234", "M0SAIC"]) {
      const bars = barcodeToBars(text);
      const encoded = code128Encode(text);
      expect(() => verifyGuardAlignment(bars, encoded)).not.toThrow();
    }
  });
});
