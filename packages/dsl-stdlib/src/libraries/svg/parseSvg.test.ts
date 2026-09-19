import fs from "fs";
import path from "path";
import { parseSvg } from "./parseSvg";

const EXAMPLES_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "__fixtures__",
  "svg",
);

describe("parseSvg", () => {
  test("extracts viewBox + paths from a real production asset (mlogo_v2)", () => {
    const svg = fs.readFileSync(
      path.join(EXAMPLES_DIR, "mlogo_v2", "01-normalized.svg"),
      "utf-8",
    );
    const parsed = parseSvg(svg);
    expect(parsed.viewBox).toEqual({ x: 0, y: 0, width: 272, height: 272 });
    // mlogo_v2 has 33 path elements.
    expect(parsed.paths).toHaveLength(33);
    expect(parsed.paths[0].d).toMatch(/^M19\.7296 0\.010376/);
  });

  test("handles missing viewBox by returning null", () => {
    const parsed = parseSvg(`<svg><path d="M0 0 L10 10"/></svg>`);
    expect(parsed.viewBox).toBeNull();
    expect(parsed.paths).toHaveLength(1);
    expect(parsed.paths[0].d).toBe("M0 0 L10 10");
  });

  test("parses both quote styles in viewBox attribute", () => {
    expect(parseSvg(`<svg viewBox="0 0 10 20"></svg>`).viewBox).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 20,
    });
    expect(parseSvg(`<svg viewBox='1 2 30 40'></svg>`).viewBox).toEqual({
      x: 1,
      y: 2,
      width: 30,
      height: 40,
    });
  });

  test("skips paths without a `d` attribute", () => {
    const svg = `<svg viewBox="0 0 10 10"><path id="x"/><path d="M0 0L1 1"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths).toHaveLength(1);
    expect(parsed.paths[0].d).toBe("M0 0L1 1");
  });

  test("resolves fill/stroke from both attribute and inline style", () => {
    const svg = `<svg><path d="M0 0" fill="#abc"/><path d="M1 1" style="fill: red; stroke: #000"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths[0].style.fill).toBe("#abc");
    expect(parsed.paths[0].style.stroke).toBeNull();
    expect(parsed.paths[1].style.fill).toBe("red");
    expect(parsed.paths[1].style.stroke).toBe("#000");
  });

  test("attribute fill wins over inline style fill (current resolveStyle behavior)", () => {
    const svg = `<svg><path d="M0 0" fill="#abc" style="fill: red"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths[0].style.fill).toBe("#abc");
  });

  test("returns no paths for an empty svg", () => {
    expect(parseSvg(`<svg></svg>`).paths).toHaveLength(0);
  });

  test("throws on non-string input", () => {
    // @ts-expect-error -- runtime guard
    expect(() => parseSvg(null)).toThrow(/string/);
  });

  test("extracts <rect> elements as synthetic-d paths", () => {
    const svg = `<svg viewBox="0 0 100 100"><rect x="10" y="20" width="30" height="40"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths).toHaveLength(1);
    expect(parsed.paths[0].d).toBe("M10,20H40V60H10Z");
  });

  test("rect with default x/y (0,0) parses", () => {
    const parsed = parseSvg(`<svg><rect width="5" height="7"/></svg>`);
    expect(parsed.paths).toHaveLength(1);
    expect(parsed.paths[0].d).toBe("M0,0H5V7H0Z");
  });

  test("rect with missing/zero/negative dims is skipped", () => {
    const parsed = parseSvg(
      `<svg><rect x="0" y="0"/><rect width="0" height="5"/><rect width="-3" height="5"/></svg>`,
    );
    expect(parsed.paths).toHaveLength(0);
  });

  test("background rect (≥99% of viewBox area) is filtered", () => {
    const svg = `<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="black"/><rect x="10" y="10" width="20" height="20" fill="red"/></svg>`;
    const parsed = parseSvg(svg);
    // Background rect skipped; foreground rect kept.
    expect(parsed.paths).toHaveLength(1);
    expect(parsed.paths[0].d).toBe("M10,10H30V30H10Z");
  });

  test("rect filling 90% of viewBox is kept (not background)", () => {
    const svg = `<svg viewBox="0 0 100 100"><rect x="5" y="5" width="85" height="85"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths).toHaveLength(1);
  });

  test("no background filter when viewBox is missing", () => {
    // Without a viewBox there's no area baseline; keep every rect.
    const svg = `<svg><rect width="999" height="999"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths).toHaveLength(1);
  });

  test("mixed <path> + <rect> preserves document order", () => {
    const svg = `<svg viewBox="0 0 10 10"><rect x="0" y="0" width="1" height="1"/><path d="M2 2L3 3"/><rect x="4" y="4" width="1" height="1"/></svg>`;
    const parsed = parseSvg(svg);
    expect(parsed.paths).toHaveLength(3);
    expect(parsed.paths[0].d).toBe("M0,0H1V1H0Z");
    expect(parsed.paths[1].d).toBe("M2 2L3 3");
    expect(parsed.paths[2].d).toBe("M4,4H5V5H4Z");
  });
});
