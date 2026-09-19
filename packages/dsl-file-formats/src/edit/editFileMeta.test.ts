import { editFileMeta } from "./editFileMeta";
import { serializeM0File, parseM0File } from "../m0";
import { serializeM0cFile, parseM0cFile } from "../m0c";
import { serializeM0pFile, parseM0pFile } from "../m0p";

const FIXED_DATE = new Date("2026-06-23T00:00:00.000Z");
// 1×1 transparent PNG — a valid derive.background data URI.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

describe("editFileMeta", () => {
  it("patches meta + custom on a .m0c while preserving background / labels / m0", () => {
    const fixture = serializeM0cFile({
      m0: "2[F,F]",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      app: "test",
      appVersion: "0.0.0",
      meta: { title: "Hero" },
      background: PNG,
      custom: { intent: "draft", keep: true },
    });
    const before = parseM0cFile(fixture);
    expect(before.derive.background).toBe(PNG); // sanity: fixture really carries the image

    const out = editFileMeta(fixture, { meta: { title: "Hero", note: "master" }, custom: { intent: "ship" } });
    const after = parseM0cFile(out);

    // preserved
    expect(after.derive.background).toBe(PNG);
    expect(after.m0).toBe(before.m0);
    expect(after.labels).toEqual(before.labels);
    expect(after.size).toEqual(before.size);
    // merged
    expect(after.meta).toEqual({ title: "Hero", note: "master" });
    expect(after.custom).toEqual({ intent: "ship", keep: true });
  });

  it("preserves masks / fill / insets / rankSets when patching only meta", () => {
    const K1 = "k/1";
    const fixture = serializeM0cFile({
      m0: "2[F,F]",
      size: { width: 1920, height: 1080 },
      created: FIXED_DATE,
      masks: { [K1]: { localPath: "M 0 0 Z", bounds: { x: 0, y: 0, width: 10, height: 10 } } },
      fill: { [K1]: { color: "#ef7525" } },
      insets: { [K1]: { top: 0.02, right: 0.03, bottom: 0.02, left: 0.03 } },
      rankSets: { diag: { ranks: { [K1]: 0.5 } } },
    });
    const before = parseM0cFile(fixture);
    const after = parseM0cFile(editFileMeta(fixture, { meta: { title: "tweaked" } }));
    // Every per-frame sidecar survives an unrelated meta edit.
    expect(after.masks).toEqual(before.masks);
    expect(after.fill).toEqual(before.fill);
    expect(after.insets).toEqual({ [K1]: { top: 0.02, right: 0.03, bottom: 0.02, left: 0.03 } });
    expect(after.rankSets).toEqual(before.rankSets);
  });

  it("clears meta when patched with null", () => {
    const fixture = serializeM0cFile({ m0: "F", created: FIXED_DATE, app: "t", appVersion: "0", meta: { title: "x" }, background: PNG });
    const after = parseM0cFile(editFileMeta(fixture, { meta: null }));
    expect(after.meta).toBeNull();
    expect(after.derive.background).toBe(PNG); // still preserved
  });

  it("replaces custom wholesale when the patch is not a plain object", () => {
    const fixture = serializeM0cFile({ m0: "F", created: FIXED_DATE, app: "t", appVersion: "0", custom: { a: 1 } });
    const after = parseM0cFile(editFileMeta(fixture, { custom: [1, 2, 3] }));
    expect(after.custom).toEqual([1, 2, 3]);
  });

  it("patches meta on a .m0 (text DSL) losslessly", () => {
    const fixture = serializeM0File({ m0: "3[F,F,F]", size: { width: 100, height: 100 }, created: FIXED_DATE, app: "t", appVersion: "0", meta: { title: "a" } });
    const before = parseM0File(fixture);
    const after = parseM0File(editFileMeta(fixture, { meta: { note: "b" } }));
    expect(after.m0).toBe(before.m0); // preserved (canonical form)
    expect(after.meta).toEqual({ title: "a", note: "b" });
  });

  it("patches pack-level custom on a .m0p while preserving each variant's background", () => {
    const fixture = serializeM0pFile({
      created: FIXED_DATE,
      app: "test",
      appVersion: "0",
      meta: { title: "pack" },
      variants: {
        desktop: { size: { width: 1920, height: 1080 }, m0: "2[F,F]", background: PNG },
        mobile: { size: { width: 1080, height: 1920 }, m0: "2(F,F)", background: PNG },
      },
    });
    const out = editFileMeta(fixture, { custom: { designTokens: { primary: "#3fb950" } } });
    const after = parseM0pFile(out);

    expect(after.variants.desktop.derive?.background).toBe(PNG);
    expect(after.variants.mobile.derive?.background).toBe(PNG);
    expect((after.custom as { designTokens: { primary: string } }).designTokens.primary).toBe("#3fb950");
    expect(after.meta).toEqual({ title: "pack" }); // untouched
  });

  it("is idempotent under an empty patch (byte-stable round-trip)", () => {
    const fixture = serializeM0cFile({ m0: "2[F,F]", size: { width: 800, height: 600 }, created: FIXED_DATE, app: "t", appVersion: "0", meta: { title: "x" }, background: PNG, custom: { a: 1 } });
    expect(editFileMeta(fixture, {})).toBe(fixture);
  });
});
