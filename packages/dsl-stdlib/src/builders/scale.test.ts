import { categoryCenters, formatTick, linearScale, niceNum, project } from "./scale";

describe("scale: niceNum (Chart.js Heckbert rule)", () => {
  it("rounds ranges up to 1/2/5/10 × 10^k", () => {
    expect(niceNum(980)).toBe(1000); // 9.8 → 10
    expect(niceNum(85)).toBe(100); // 8.5 → 10
    expect(niceNum(45)).toBe(50); // 4.5 → 5
    expect(niceNum(18)).toBe(20); // 1.8 → 2
    expect(niceNum(7)).toBe(10);
    expect(niceNum(1)).toBe(1);
  });

  it("accepts a custom `steps` set (bar-graph passes [1,2,2.5,5])", () => {
    // 0..120 over 5 spaces → rawStep 24 → 2.4 normalized
    expect(niceNum(24, [1, 2, 2.5, 5])).toBe(25); // 2.4 → 2.5
    expect(niceNum(24)).toBe(50); // default [1,2,5]: 2.4 → 5
    // default set unchanged
    expect(niceNum(2.4)).toBe(5);
    expect(niceNum(2.4, [1, 2, 2.5, 5])).toBe(2.5);
  });
});

describe("scale: linearScale matches Chart.js LinearScale", () => {
  it("0..9800 → step 1000, ticks 0..10000 (the m0saic renders series)", () => {
    const s = linearScale(0, 9800);
    expect(s.step).toBe(1000);
    expect(s.min).toBe(0);
    expect(s.max).toBe(10000);
    expect(s.ticks).toEqual([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]);
  });

  it("beginAtZero pulls a positive min down to 0", () => {
    expect(linearScale(1200, 9800).min).toBe(0);
  });

  it("respects maxTicks", () => {
    const s = linearScale(0, 85, { maxTicks: 6 });
    expect(s.ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });
});

describe("scale: projection + categories match Chart.js pixels", () => {
  it("projects y values into [bottom..top]", () => {
    // plot bottom=676, top=122 from the reference render
    expect(Math.round(project(0, 0, 10000, 676, 122))).toBe(676);
    expect(Math.round(project(10000, 0, 10000, 676, 122))).toBe(122);
  });

  it("category centers (offset=false) sit on the plot edges, evenly spaced", () => {
    // Chart.js logged: [67,306,546,785,1025,1264] for left=67 right=1264
    const xs = categoryCenters(6, 67, 1264, false).map(Math.round);
    expect(xs[0]).toBe(67);
    expect(xs[5]).toBe(1264);
    expect(xs).toEqual([67, 306, 546, 785, 1025, 1264]);
  });
});

describe("scale: formatTick", () => {
  it("uses thousands separators", () => {
    expect(formatTick(10000)).toBe("10,000");
    expect(formatTick(0)).toBe("0");
  });
});
