import { parseM0cFile } from "@m0saic/dsl-file-formats";
import { barcodeToM0c } from "./barcodeToM0c";

describe("barcodeToM0c — basic structure", () => {
  test("returns valid m0c JSON that round-trips through parseM0cFile", () => {
    const result = barcodeToM0c("Hello");
    expect(typeof result.m0c).toBe("string");
    expect(() => JSON.parse(result.m0c)).not.toThrow();
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.format).toBe("m0c");
    expect(parsed.version).toBe(1);
    expect(parsed.m0).toBe(String(result.m0));
  });

  test("m0c size matches result canvas dimensions", () => {
    const result = barcodeToM0c("Hello");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.size).toEqual({
      width: result.canvasW,
      height: result.canvasH,
    });
  });

  test("default app field is barcodeToM0c", () => {
    const result = barcodeToM0c("Hello");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.app).toBe("barcodeToM0c");
  });

  test("source defaults to the input text", () => {
    const result = barcodeToM0c("M0SAIC");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.meta?.source).toBe("M0SAIC");
  });
});

describe("barcodeToM0c — labels coverage", () => {
  test("no channels enabled → bars channel still labels each dark bar", () => {
    // The `bars` channel labels every dark bar as `barcode-bar-{i}`, so the
    // labels map is never empty for a non-degenerate barcode.
    const result = barcodeToM0c("Hello");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.labels).toBeDefined();
    const barLabels = Object.values(parsed.labels!)
      .map((l) => l.text)
      .filter((t) => t.startsWith("barcode-bar-"));
    expect(barLabels.length).toBe(result.channelByRole.bars!.frames.length);
    expect(barLabels.length).toBeGreaterThan(0);
  });

  test("quietZoneLeft channel → barcode-quiet-zone-left label present", () => {
    const result = barcodeToM0c("Hello", { channels: { quietZoneLeft: true } });
    const parsed = parseM0cFile(result.m0c);
    const labelTexts = Object.values(parsed.labels!).map((l) => l.text);
    expect(labelTexts).toContain("barcode-quiet-zone-left");
  });

  test("all 4 structural channels → each label present in m0c", () => {
    const result = barcodeToM0c("Hello", {
      channels: {
        quietZoneLeft: true,
        quietZoneRight: true,
        startGuard: true,
        stopGuard: true,
      },
    });
    const parsed = parseM0cFile(result.m0c);
    const labelTexts = Object.values(parsed.labels!).map((l) => l.text);
    for (const expected of [
      "barcode-quiet-zone-left",
      "barcode-quiet-zone-right",
      "barcode-start-guard",
      "barcode-stop-guard",
    ]) {
      expect(labelTexts).toContain(expected);
    }
  });

  test("humanReadable carve (Code 128) → barcode-hri-text label present", () => {
    const result = barcodeToM0c("Hello", { humanReadable: { mode: "carve" } });
    const parsed = parseM0cFile(result.m0c);
    const labelTexts = Object.values(parsed.labels!).map((l) => l.text);
    expect(labelTexts).toContain("barcode-hri-text");
  });

  test("humanReadable bounds → NO HRI splice-point label (bounds-only, no anchor)", () => {
    const result = barcodeToM0c("Hello", { humanReadable: { mode: "bounds" } });
    const parsed = parseM0cFile(result.m0c);
    const labelTexts = Object.values(parsed.labels!).map((l) => l.text);
    expect(labelTexts.some((t) => t.startsWith("barcode-hri-"))).toBe(false);
  });

  test("multi-channel: every channel frame's stableKey is in the m0c labels", () => {
    const result = barcodeToM0c("Hello", {
      humanReadable: { mode: "carve" },
      channels: {
        quietZoneLeft: true,
        startGuard: true,
        stopGuard: true,
      },
    });
    const parsed = parseM0cFile(result.m0c);
    for (const ch of result.channels) {
      for (const frame of ch.frames) {
        expect(parsed.labels![frame.stableKey]).toBeDefined();
        expect(parsed.labels![frame.stableKey].text).toBe(
          result.labels[frame.stableKey],
        );
      }
    }
  });
});

describe("barcodeToM0c — meta forwarding", () => {
  test("title/author/note flow into the m0c meta block", () => {
    const result = barcodeToM0c("Hello", {
      m0c: {
        title: "Test Barcode",
        author: "Tester",
        note: "for debugging",
      },
    });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.meta).toMatchObject({
      title: "Test Barcode",
      author: "Tester",
      note: "for debugging",
    });
  });

  test("app + appVersion overrides defaults", () => {
    const result = barcodeToM0c("Hello", {
      m0c: { app: "MyApp", appVersion: "1.2.3" },
    });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.app).toBe("MyApp");
    expect(parsed.appVersion).toBe("1.2.3");
  });

  test("explicit source overrides the input-text default", () => {
    const result = barcodeToM0c("Hello", { m0c: { source: "custom-source" } });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.meta?.source).toBe("custom-source");
  });
});

describe("barcodeToM0c — determinism (modulo timestamp)", () => {
  test("same input produces identical m0 + identical labels", () => {
    const a = barcodeToM0c("M0SAIC", { humanReadable: { mode: "carve" } });
    const b = barcodeToM0c("M0SAIC", { humanReadable: { mode: "carve" } });
    expect(String(a.m0)).toBe(String(b.m0));
    expect(a.labels).toEqual(b.labels);
    const parsedA = parseM0cFile(a.m0c);
    const parsedB = parseM0cFile(b.m0c);
    expect(parsedA.m0).toBe(parsedB.m0);
    expect(parsedA.labels).toEqual(parsedB.labels);
  });
});
