import { parseM0cFile } from "@m0saic/dsl-file-formats";
import { qrToM0c } from "./qrToM0c";

describe("qrToM0c — basic structure", () => {
  test("returns valid m0c JSON that round-trips through parseM0cFile", () => {
    const result = qrToM0c("https://m0saic.io");
    expect(typeof result.m0c).toBe("string");
    expect(() => JSON.parse(result.m0c)).not.toThrow();
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.format).toBe("m0c");
    expect(parsed.version).toBe(1);
    expect(parsed.m0).toBe(String(result.m0));
  });

  test("m0c size matches result canvas dimensions", () => {
    const result = qrToM0c("https://m0saic.io");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.size).toEqual({
      width: result.canvasW,
      height: result.canvasH,
    });
  });

  test("default app field is qrToM0c", () => {
    const result = qrToM0c("https://m0saic.io");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.app).toBe("qrToM0c");
  });

  test("source defaults to the input url", () => {
    const result = qrToM0c("https://m0saic.io");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.meta?.source).toBe("https://m0saic.io");
  });
});

describe("qrToM0c — labels coverage", () => {
  test("no channels enabled → labels map empty (no overlay frames to label)", () => {
    const result = qrToM0c("https://m0saic.io");
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.labels).toBeNull();
  });

  test("eyes channel → 3 eye labels in m0c", () => {
    const result = qrToM0c("https://m0saic.io", { channels: { eyes: true } });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.labels).toBeDefined();
    const labelTexts = Object.values(parsed.labels!).map((l) => l.text).sort();
    // The quiet zone is already represented by null cells in the base
    // grid, so qrToM0 no longer emits a separate QZ overlay layer.
    expect(labelTexts).toEqual(["qr-eye-bl", "qr-eye-tl", "qr-eye-tr"]);
  });

  test("safeArea carve → qr-safe-area label present", () => {
    const result = qrToM0c("https://m0saic.io", {
      version: 6,
      safeArea: { mode: "carve", size: { width: 272, height: 272 } },
    });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.labels).toBeDefined();
    const labelTexts = Object.values(parsed.labels!).map((l) => l.text);
    expect(labelTexts).toContain("qr-safe-area");
  });

  test("pack: true → packed rects labeled qr-pack-{i}", () => {
    const result = qrToM0c("https://m0saic.io", { pack: true });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.labels).toBeDefined();
    const packLabels = Object.values(parsed.labels!)
      .map((l) => l.text)
      .filter((t) => t.startsWith("qr-pack-"));
    expect(packLabels.length).toBe(result.channelByRole.data!.frames.length);
    expect(packLabels.length).toBeGreaterThan(0);
  });

  test("multi-channel: every channel frame's stableKey is in the m0c labels", () => {
    const result = qrToM0c("https://m0saic.io", {
      channels: { eyes: true, timingPatterns: true, darkModule: true },
    });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.labels).toBeDefined();
    for (const ch of result.channels) {
      if (ch.channel === "data") continue; // data has no frames when pack off
      for (const frame of ch.frames) {
        expect(parsed.labels![frame.stableKey]).toBeDefined();
        expect(parsed.labels![frame.stableKey].text).toBe(
          result.labels[frame.stableKey],
        );
      }
    }
  });
});

describe("qrToM0c — meta forwarding", () => {
  test("title/author/note flow into the m0c meta block", () => {
    const result = qrToM0c("https://m0saic.io", {
      m0c: {
        title: "Test QR",
        author: "Tester",
        note: "for debugging",
      },
    });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.meta).toMatchObject({
      title: "Test QR",
      author: "Tester",
      note: "for debugging",
    });
  });

  test("app + appVersion overrides defaults", () => {
    const result = qrToM0c("https://m0saic.io", {
      m0c: { app: "MyApp", appVersion: "1.2.3" },
    });
    const parsed = parseM0cFile(result.m0c);
    expect(parsed.app).toBe("MyApp");
    expect(parsed.appVersion).toBe("1.2.3");
  });
});

describe("qrToM0c — determinism (modulo timestamp)", () => {
  test("same input produces identical m0 + identical labels", () => {
    const a = qrToM0c("https://m0saic.io", { channels: { eyes: true } });
    const b = qrToM0c("https://m0saic.io", { channels: { eyes: true } });
    // The m0 string itself is deterministic.
    expect(String(a.m0)).toBe(String(b.m0));
    // Labels are deterministic.
    expect(a.labels).toEqual(b.labels);
    // The .m0c file includes a `created` timestamp so the FULL string isn't
    // byte-identical across runs; that's expected.
    const parsedA = parseM0cFile(a.m0c);
    const parsedB = parseM0cFile(b.m0c);
    expect(parsedA.m0).toBe(parsedB.m0);
    expect(parsedA.labels).toEqual(parsedB.labels);
  });
});
