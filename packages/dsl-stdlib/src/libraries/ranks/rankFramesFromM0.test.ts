import { rankFramesFromM0 } from "./rankFramesFromM0";

describe("rankFramesFromM0", () => {
  test("2×2 grid `2[2(F,F),2(F,F)]` produces 4 rank frames in document order", () => {
    const frames = rankFramesFromM0("2[2(F,F),2(F,F)]", { canvasW: 100, canvasH: 100 });
    expect(frames).toHaveLength(4);
    // Each frame must carry x/y/width/height + logicalIndex.
    for (let i = 0; i < frames.length; i++) {
      expect(frames[i].logicalIndex).toBe(i);
      expect(frames[i].width).toBeGreaterThan(0);
      expect(frames[i].height).toBeGreaterThan(0);
    }
  });

  test("default canvas (1920×1080) when no opts supplied", () => {
    const frames = rankFramesFromM0("2[F,F]");
    // 1-column row split with 2 vertical frames, each 1920×540 at default canvas.
    expect(frames).toHaveLength(2);
    expect(frames[0].x).toBe(0);
    expect(frames[1].x).toBe(0);
  });

  test("frames-only m0 (no overlays) returns just the rendered cells", () => {
    const frames = rankFramesFromM0("3(F,-,F)", { canvasW: 300, canvasH: 100 });
    // The middle cell is a `-` null — not rendered.
    expect(frames).toHaveLength(2);
  });
});
