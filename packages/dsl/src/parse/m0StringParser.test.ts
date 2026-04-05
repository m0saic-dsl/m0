/* The tests in this file are all assuming LOGICAL ordering of m0 string!!! */
import {
  parseM0StringTestRunner,
} from "./m0StringParser";
import { isValidM0String, validateM0String } from "../validate/m0StringValidator";
import type { M0ValidationResult } from "../errors";

type ExpectedFrame = Partial<{
  id: number;
  width: number;
  height: number;
  x: number;
  y: number;
  nullRender: boolean;
  zeroFrame: boolean;
  logicalOrder: number;
  stackOrder: number;
  depth: number;
  isLogicalOwner: boolean;
}>;

const expectFrames = (actual: any[], expected: ExpectedFrame[]) => {
  expect(actual.length).toBe(expected.length);

  for (let i = 0; i < expected.length; i++) {
    const e = expected[i];
    const a = actual[i];

    // only assert keys you specify
    for (const k of Object.keys(e) as (keyof ExpectedFrame)[]) {
      expect(a[k]).toBe(e[k]);
    }
  }
};

function expectLogicalOrderToMatchArrayIndex(frames: any[]) {
  const rendered = frames.filter(f => !f.nullRender);
  rendered.forEach((f, i) => {
    expect(f.logicalOrder).toBe(i);
  });
}

function expectInvalidResult(res: M0ValidationResult) {
  expect(res.ok).toBe(false);
  if (!("error" in res)) throw new Error("Expected invalid result");
  return res.error;
}

describe("VFProfileValidator / mosaicStringValidator", () => {
  test("rejects '{{' token sequence in v0.1.0", () => {
    const res = validateM0String("1{{1}}");
    const err = expectInvalidResult(res);
    expect(err.code).toBe("TOKEN_RULE");
    expect(err.position).toBe(1);
  });

  test("allows trailing '}}' when from nested single-curly overlays", () => {
    const res = validateM0String("1{1{1}}");
    expect(res.ok).toBe(true);
  });

  test("rejects trailing passthrough regardless of overlay", () => {
    const bare = validateM0String("2(1,0)");
    const err1 = expectInvalidResult(bare);
    expect(err1.code).toBe("PASSTHROUGH_TO_NOTHING");
    expect(err1.position).toBe(4);

    const withOverlay = validateM0String("2(1,0{1})");
    const err2 = expectInvalidResult(withOverlay);
    expect(err2.code).toBe("PASSTHROUGH_TO_NOTHING");
    expect(err2.position).toBe(4);
  });

  // the O.G 2020 DSL test cases

  test("testBadCharacters", () => {
    const testStr = "2(1,1A)";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("testBadBalance", () => {
    const testStr = "2(1,1)]";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("testNonNumeric", () => {
    const testStr = "12,(1,1)";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("testIterative", () => {
    const testStr = "2[(1,1)]";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("testToken", () => {
    const testStr = "3(1,1,1,1)";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test2", () => {
    const testStr = "1";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test3", () => {
    const testStr = "1{1}";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test4", () => {
    const testStr = "1{1{1}}";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test5", () => {
    const testStr = "2(1{1,1},1)";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test6", () => {
    const testStr = "2(1,1{1,1})";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test7", () => {
    const testStr = "2(1{2[1,1]},1)";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test8", () => {
    const testStr = "1{2[1,1]}";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test9", () => {
    const testStr = "1{2[1,1]";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test10", () => {
    const testStr = "2(3[1,1,1],1)";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test11", () => {
    const testStr = "2(3[1,1],1)";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test12", () => {
    const testStr = "2(2[1,0{1}],1)";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test13", () => {
    const testStr = "2[2[1,0{2(1,1)}],1]";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test14", () => {
    const testStr = "2[2[1,0{10[1,1,1,1,1,1,1,1,1,1]}],1]";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test15", () => {
    const testStr = "2[2[1,0{10[1,1,1,1,1,1,1,1,1]}],1]";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test16", () => {
    const testStr = "10[-,-,0,0,0,0,0,0,0,-{10(1,1,1,1,1,1,1,1,1,1)}]";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test17", () => {
    const testStr = "3(0{2[1,-{2(1,1)}]},1,1)";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test18", () => {
    const testStr = "4(0,0{3[1,0,1{2(1,1)}]},2[-,1],1)";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test19", () => {
    const testStr = "-";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test20", () => {
    const testStr = "0";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test21", () => {
    const testStr = "2";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test22", () => {
    const testStr = "2()";
    expect(isValidM0String(testStr)).toBe(false);
  });

  test("test23", () => {
    const testStr = "2(1,1){4[-,1,-,-]}";
    expect(isValidM0String(testStr)).toBe(true);
  });

  test("test24", () => {
    const testStr = "1{2(1,1)}{3(1,1,1)}";
    expect(isValidM0String(testStr)).toBe(false);
  });

  //
  // Parse tests
  //

  test("testParse", () => {
    const testStr = "1";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(1);

    const f1 = f[0];
    expect(f1.height).toBe(720);
    expect(f1.width).toBe(1080);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);
    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testParse2", () => {
    const testStr = "2(1,1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(2);

    const f1 = f[0];
    expect(f1.height).toBe(720);
    expect(f1.width).toBe(540);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    const f2 = f[1];
    expect(f2.height).toBe(720);
    expect(f2.width).toBe(540);
    expect(f2.x).toBe(540);
    expect(f2.y).toBe(0);
    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testParse3", () => {
    const testStr = "2(1{1},1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(3);

    expectFrames(f, [
      {
        width: 540,
        height: 720,
        x: 0,
        y: 0,
        nullRender: false,
        zeroFrame: false,
        logicalOrder: 0,
        stackOrder: 1,
      },
      {
        width: 540,
        height: 720,
        x: 0,
        y: 0,
        nullRender: false,
        zeroFrame: false,
        logicalOrder: 1,
        stackOrder: 2,
      },
      {
        width: 540,
        height: 720,
        x: 540,
        y: 0,
        nullRender: false,
        zeroFrame: false,
        logicalOrder: 2,
        stackOrder: 3,
      },
    ]);
    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testParse4", () => {
    const testStr = "2(1{2[1,1]},1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(4);

    const f1 = f[0];
    expect(f1.height).toBe(720);
    expect(f1.width).toBe(540);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    const f2 = f[1];
    expect(f2.height).toBe(360);
    expect(f2.width).toBe(540);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(0);

    const f3 = f[2];
    expect(f3.height).toBe(360);
    expect(f3.width).toBe(540);
    expect(f3.x).toBe(0);
    expect(f3.y).toBe(360);

    const f4 = f[3];
    expect(f4.height).toBe(720);
    expect(f4.width).toBe(540);
    expect(f4.x).toBe(540);
    expect(f4.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testFractionalParse", () => {
    const testStr = "7(1,1,1,1,1,1,1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(7);

    const [f1, f2, f3, f4, f5, f6, f7] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(155);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(720);
    expect(f2.width).toBe(154);
    expect(f2.x).toBe(155);
    expect(f2.y).toBe(0);

    expect(f3.height).toBe(720);
    expect(f3.width).toBe(154);
    expect(f3.x).toBe(309);
    expect(f3.y).toBe(0);

    expect(f4.height).toBe(720);
    expect(f4.width).toBe(154);
    expect(f4.x).toBe(463);
    expect(f4.y).toBe(0);

    expect(f5.height).toBe(720);
    expect(f5.width).toBe(154);
    expect(f5.x).toBe(617);
    expect(f5.y).toBe(0);

    expect(f6.height).toBe(720);
    expect(f6.width).toBe(154);
    expect(f6.x).toBe(771);
    expect(f6.y).toBe(0);

    expect(f7.height).toBe(720);
    expect(f7.width).toBe(155);
    expect(f7.x).toBe(925);
    expect(f7.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testFractionalParse2", () => {
    const testStr = "7(0,0,0,0,1,1,1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(3);

    const [f1, f2, f3] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(771);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(720);
    expect(f2.width).toBe(154);
    expect(f2.x).toBe(771);
    expect(f2.y).toBe(0);

    expect(f3.height).toBe(720);
    expect(f3.width).toBe(155);
    expect(f3.x).toBe(925);
    expect(f3.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testFractionalParse3", () => {
    const testStr = "7(0{1},0{1},0,0,1,1,1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(5);

    const [f1, f2, f3, f4, f5] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(155);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(720);
    expect(f2.width).toBe(309);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(0);

    expect(f3.height).toBe(720);
    expect(f3.width).toBe(771);
    expect(f3.x).toBe(0);
    expect(f3.y).toBe(0);

    expect(f4.height).toBe(720);
    expect(f4.width).toBe(154);
    expect(f4.x).toBe(771);
    expect(f4.y).toBe(0);

    expect(f5.height).toBe(720);
    expect(f5.width).toBe(155);
    expect(f5.x).toBe(925);
    expect(f5.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testFractionalParse4", () => {
    const testStr = "7(1{1},1{1},-,-,-,-,-)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(4);

    const [f1, f2, f3, f4] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(155);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(720);
    expect(f2.width).toBe(155);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(0);

    expect(f3.height).toBe(720);
    expect(f3.width).toBe(154);
    expect(f3.x).toBe(155);
    expect(f3.y).toBe(0);

    expect(f4.height).toBe(720);
    expect(f4.width).toBe(154);
    expect(f4.x).toBe(155);
    expect(f4.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testFractionalParse5", () => {
    const testStr = "7(-,1,1,-,-,-,-)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(2);

    const [f1, f2] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(154);
    expect(f1.x).toBe(155);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(720);
    expect(f2.width).toBe(154);
    expect(f2.x).toBe(309);
    expect(f2.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testFractionalParse6", () => {
    const testStr = "7(-,2[1,1],2[1,1],1,-,-,-)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(5);

    const [f1, f2, f3, f4, f5] = f;

    expect(f1.height).toBe(360);
    expect(f1.width).toBe(154);
    expect(f1.x).toBe(155);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(360);
    expect(f2.width).toBe(154);
    expect(f2.x).toBe(155);
    expect(f2.y).toBe(360);

    expect(f3.height).toBe(360);
    expect(f3.width).toBe(154);
    expect(f3.x).toBe(309);
    expect(f3.y).toBe(0);

    expect(f4.height).toBe(360);
    expect(f4.width).toBe(154);
    expect(f4.x).toBe(309);
    expect(f4.y).toBe(360);

    expect(f5.height).toBe(720);
    expect(f5.width).toBe(154);
    expect(f5.x).toBe(463);
    expect(f5.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testA", () => {
    const testStr = "5(0,0,0,0,5[1,1,1,1,1])";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(5);

    const [f1, f2, f3, f4, f5] = f;

    expect(f1.height).toBe(144);
    expect(f1.width).toBe(1080);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(144);
    expect(f2.width).toBe(1080);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(144);

    expect(f3.height).toBe(144);
    expect(f3.width).toBe(1080);
    expect(f3.x).toBe(0);
    expect(f3.y).toBe(288);

    expect(f4.height).toBe(144);
    expect(f4.width).toBe(1080);
    expect(f4.x).toBe(0);
    expect(f4.y).toBe(432);

    expect(f5.height).toBe(144);
    expect(f5.width).toBe(1080);
    expect(f5.x).toBe(0);
    expect(f5.y).toBe(576);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testVRType", () => {
    const testStr = "5[-,0,0,2(4(2[1,1],0,1,2[1,1]),4(2[1,1],0,1,2[1,1])),-]";
    const f = parseM0StringTestRunner(testStr, 3840, 1920, "LOGICAL");
    expect(f.length).toBe(10);

    const [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10] = f;

    expect(f1.height).toBe(576);
    expect(f1.width).toBe(480);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(384);

    expect(f2.height).toBe(576);
    expect(f2.width).toBe(480);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(960);

    expect(f3.height).toBe(1152);
    expect(f3.width).toBe(960);
    expect(f3.x).toBe(480);
    expect(f3.y).toBe(384);

    expect(f4.height).toBe(576);
    expect(f4.width).toBe(480);
    expect(f4.x).toBe(1440);
    expect(f4.y).toBe(384);

    expect(f5.height).toBe(576);
    expect(f5.width).toBe(480);
    expect(f5.x).toBe(1440);
    expect(f5.y).toBe(960);

    expect(f6.height).toBe(576);
    expect(f6.width).toBe(480);
    expect(f6.x).toBe(1920);
    expect(f6.y).toBe(384);

    expect(f7.height).toBe(576);
    expect(f7.width).toBe(480);
    expect(f7.x).toBe(1920);
    expect(f7.y).toBe(960);

    expect(f8.height).toBe(1152);
    expect(f8.width).toBe(960);
    expect(f8.x).toBe(2400);
    expect(f8.y).toBe(384);

    expect(f9.height).toBe(576);
    expect(f9.width).toBe(480);
    expect(f9.x).toBe(3360);
    expect(f9.y).toBe(384);

    expect(f10.height).toBe(576);
    expect(f10.width).toBe(480);
    expect(f10.x).toBe(3360);
    expect(f10.y).toBe(960);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testObjectRenderOnTopOfNonPrimitive", () => {
    const testStr = "2(1,1){4[-,1,-,-]}";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(3);

    const [f1, f2, f3] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(540);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(720);
    expect(f2.width).toBe(540);
    expect(f2.x).toBe(540);
    expect(f2.y).toBe(0);

    expect(f3.height).toBe(180);
    expect(f3.width).toBe(1080);
    expect(f3.x).toBe(0);
    expect(f3.y).toBe(180);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testObjectRenderOnTopOfNonPrimitive2", () => {
    const testStr = "2(0,1){4[-,1,-,-]}";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(2);

    const [f1, f2] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(1080);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(180);
    expect(f2.width).toBe(1080);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(180);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testObjectRenderOnTopOfNonPrimitive3", () => {
    const testStr = "3(0,1,-){4[-,1,-,-]}";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(2);

    const [f1, f2] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(720);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(180);
    expect(f2.width).toBe(1080);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(180);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testObjectRenderOnTopOfNonPrimitive4", () => {
    const testStr = "3(0,1,-){4[-,1,-,-]}";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(2);

    const [f1, f2] = f;

    expect(f1.height).toBe(720);
    expect(f1.width).toBe(720);
    expect(f1.x).toBe(0);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(180);
    expect(f2.width).toBe(1080);
    expect(f2.x).toBe(0);
    expect(f2.y).toBe(180);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testObjectRenderOnTopOfNonPrimitive5", () => {
    const testStr = "3(-,2[1,1]{4[-,-,-,1]},1)";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(4);

    const [f1, f2, f3, f4] = f;

    expect(f1.height).toBe(360);
    expect(f1.width).toBe(360);
    expect(f1.x).toBe(360);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(360);
    expect(f2.width).toBe(360);
    expect(f2.x).toBe(360);
    expect(f2.y).toBe(360);

    expect(f3.height).toBe(180);
    expect(f3.width).toBe(360);
    expect(f3.x).toBe(360);
    expect(f3.y).toBe(540);

    expect(f4.height).toBe(720);
    expect(f4.width).toBe(360);
    expect(f4.x).toBe(720);
    expect(f4.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });

  test("testObjectRenderOnTopOfNonPrimitive6", () => {
    // NOTE: trailing bare 0 in overlay is now invalid (PASSTHROUGH_TO_NOTHING),
    // so changed {3(1,0,0)} → {1} to keep the overlay geometry test valid.
    const testStr = "3(-,2[1,1]{4[-,-,-,1]},1){1}";
    const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
    expect(f.length).toBe(5);

    const [f1, f2, f3, f4, f5] = f;

    expect(f1.height).toBe(360);
    expect(f1.width).toBe(360);
    expect(f1.x).toBe(360);
    expect(f1.y).toBe(0);

    expect(f2.height).toBe(360);
    expect(f2.width).toBe(360);
    expect(f2.x).toBe(360);
    expect(f2.y).toBe(360);

    expect(f3.height).toBe(180);
    expect(f3.width).toBe(360);
    expect(f3.x).toBe(360);
    expect(f3.y).toBe(540);

    expect(f4.height).toBe(720);
    expect(f4.width).toBe(360);
    expect(f4.x).toBe(720);
    expect(f4.y).toBe(0);

    // {1} overlay covers the full group rect
    expect(f5.height).toBe(720);
    expect(f5.width).toBe(1080);
    expect(f5.x).toBe(0);
    expect(f5.y).toBe(0);

    expectLogicalOrderToMatchArrayIndex(f);
  });
});

// AI additional tests
test("parseM0StringTestRunner returns empty array for invalid DSL", () => {
  const f = parseM0StringTestRunner("2(1,1A)", 1080, 720, "LOGICAL");
  expect(f).toEqual([]);
});

test("parseM0StringTestRunner handles empty string", () => {
  const f = parseM0StringTestRunner("", 1080, 720, "LOGICAL");
  expect(f).toEqual([]);
});

test("too many children for classifier", () => {
  const testStr = "2(1,1,1)"; // 2 expects 2 children, gets 3
  expect(isValidM0String(testStr)).toBe(false);
});

test("invalid primitive token '2' inside classifier", () => {
  const testStr = "2(2,1)"; // inner token '2' should be invalid primitive
  expect(isValidM0String(testStr)).toBe(false);
});

test("fractional vertical split hits height++ / height-- branches", () => {
  // 3 rows, height doesn't divide cleanly -> extraP > 0 with row = true
  const frames = parseM0StringTestRunner("3[1,1,1]", 1080, 721, "LOGICAL");
  expect(frames.length).toBe(3);
});

test("zero followed by hyphen hits zeroFlagHandled branch", () => {
  const frames = parseM0StringTestRunner("3(0,-,1)", 1080, 720, "LOGICAL");
  // just assert it parses without throwing and returns some frames
  expect(frames.length).toBe(1); // only the '1' is real (hyphen is nullRender)
});

test("overlay on fractional zero row hits overlay h++ path", () => {
  // 3 vertical rows, first is 0 with an overlay, height is fractional
  const frames = parseM0StringTestRunner("3[0{2(1,1)},1,1]", 1080, 721, "LOGICAL");
  expect(frames.length).toBe(4);
});

test("iterativeCheck fails when second token is not classifier or object open", () => {
  // first token '1', second token ',' → bad second token
  expect(isValidM0String("1,1")).toBe(false);
});

test("iterativeCheck fails on invalid token sequence inside classifier", () => {
  // sequence: 1 ( , 1 ) → ',' directly after '(' is illegal
  expect(isValidM0String("1(,1)")).toBe(false);
});

/* 2025 Code */
test("testSplitExceedsParentHeightThrowsOutFrames_smallValid", () => {
  // 3 rows requested, but parent height is only 2px -> runtime/logical invalid in this context
  const testStr = "3[1,1,1]";
  const f = parseM0StringTestRunner(testStr, 10, 2, "LOGICAL");
  expect(f).toEqual([]);
});

test("testSplitExceedsParentWidthThrowsOutFrames_smallValid", () => {
  // 3 cols requested, but parent width is only 2px
  const testStr = "3(1,1,1)";
  const f = parseM0StringTestRunner(testStr, 2, 10, "LOGICAL");
  expect(f).toEqual([]);
});

test("testNestedSplitExceedsInnerParentThrowsOutFrames_smallValid", () => {
  // Outer 2 rows on height=3 -> row heights are [2,1] (or [1,2] depending on splitEven policy)
  // First row is at most 2px tall, but inner asks for 3 rows -> invalid
  const testStr = "2[3[1,1,1],1]";
  const f = parseM0StringTestRunner(testStr, 10, 3, "LOGICAL");
  expect(f).toEqual([]);
});

/* AI Tests */

/* 2025 Legacy-semantics lock tests */

// 0 donates forward; first claimant (1) absorbs ALL prior 0 slots
test("legacy_zeroCarry_claimsIntoFirstOne_colSplit", () => {
  // width 1080, 7 cols => [155,154,154,154,154,154,155]
  // 0,0,1,... -> first 1 claims 155+154+154 = 463
  const testStr = "7(0,0,1,1,1,1,1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(5);

  const [a, b, c, d, e] = f;

  expect(a.width).toBe(463);
  expect(a.height).toBe(720);
  expect(a.x).toBe(0);
  expect(a.y).toBe(0);

  expect(b.width).toBe(154);
  expect(b.x).toBe(463);

  expect(c.width).toBe(154);
  expect(c.x).toBe(617);

  expect(d.width).toBe(154);
  expect(d.x).toBe(771);

  expect(e.width).toBe(155);
  expect(e.x).toBe(925);
});

// 0{...} overlays apply to MERGED region so far, not the individual 0-slot rect
test("legacy_zeroOverlay_targetsMergedRegionSoFar_colSplit", () => {
  const testStr = "7(0{1},0,1,1,1,1,1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");

  // frames:
  // overlay on merged-so-far after first 0 => 155 @ x=0
  // first 1 claims (155+154+154)=463 @ x=0
  // then [154,154,154,155]
  expect(f.length).toBe(6);

  const [o1, a, b, c, d, e] = f;

  expect(o1.width).toBe(155);
  expect(o1.height).toBe(720);
  expect(o1.x).toBe(0);
  expect(o1.y).toBe(0);

  expect(a.width).toBe(463);
  expect(a.x).toBe(0);

  expect(b.width).toBe(154);
  expect(b.x).toBe(463);

  expect(c.width).toBe(154);
  expect(c.x).toBe(617);

  expect(d.width).toBe(154);
  expect(d.x).toBe(771);

  expect(e.width).toBe(155);
  expect(e.x).toBe(925);
});

// multiple 0{...} in a run: overlays "grow" (155 then 309), then claimant absorbs rest (771)
test("legacy_zeroOverlay_growsAcrossRun_colSplit", () => {
  const testStr = "7(0{1},0{1},0,0,1,1,1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(5);

  const [f1, f2, f3, f4, f5] = f;

  expect(f1.width).toBe(155);
  expect(f1.x).toBe(0);

  expect(f2.width).toBe(309);
  expect(f2.x).toBe(0);

  expect(f3.width).toBe(771);
  expect(f3.x).toBe(0);

  expect(f4.width).toBe(154);
  expect(f4.x).toBe(771);

  expect(f5.width).toBe(155);
  expect(f5.x).toBe(925);
});

// Claimant can be '-' (it consumes space). Since parseM0StringTestRunner filters nullRender,
// only overlay frames should remain.
test("legacy_zeroCarry_claimedByHyphen_onlyOverlaySurvives", () => {
  const testStr = "3(0{1},0,-)";
  // width 1080, 3 cols => [360,360,360]
  // after first 0{1}: overlay on merged-so-far => 360 @ x=0
  // after second 0: carry=720
  // '-' claims 720+360=1080 but is nullRender -> filtered out
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(1);

  const [o1] = f;
  expect(o1.width).toBe(360);
  expect(o1.height).toBe(720);
  expect(o1.x).toBe(0);
  expect(o1.y).toBe(0);
});

// trailing 0-run with no claimant is dropped (no frames)
test("legacy_trailingZeroRun_dropsNoClaimant", () => {
  const testStr = "3(0,0,0)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f).toEqual([]);
});

// overlay on '-' renders on its own rect (even though '-' itself is filtered away)
test("legacy_overlayOnHyphen_rendersInHyphenRect", () => {
  const testStr = "2(-{1},1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  // '-' is filtered, but its overlay produces a frame in left half
  expect(f.length).toBe(2);

  const [o1, one] = f;

  expect(o1.width).toBe(540);
  expect(o1.height).toBe(720);
  expect(o1.x).toBe(0);
  expect(o1.y).toBe(0);

  expect(one.width).toBe(540);
  expect(one.x).toBe(540);
});

// overlay on 1 renders on same rect and does NOT affect split geometry
test("legacy_overlayOnOne_sameRect_noGeometryMutation", () => {
  const testStr = "2(1{1},1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(3);

  const [baseLeft, overlayLeft, right] = f;

  expect(baseLeft.width).toBe(540);
  expect(baseLeft.x).toBe(0);

  expect(overlayLeft.width).toBe(540);
  expect(overlayLeft.x).toBe(0);

  expect(right.width).toBe(540);
  expect(right.x).toBe(540);
});

// Row-split symmetric version of the 0{...} merged overlay behavior
test("legacy_zeroOverlay_targetsMergedRegionSoFar_rowSplit", () => {
  // height 720, 3 rows => [240,240,240]
  // first row 0{1} => overlay on merged-so-far => height 240 @ y=0
  // second row 0 => carry=480
  // third row 1 claims 480+240=720 @ y=0
  const testStr = "3[0{1},0,1]";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(2);

  const [o1, claim] = f;

  expect(o1.width).toBe(1080);
  expect(o1.height).toBe(240);
  expect(o1.x).toBe(0);
  expect(o1.y).toBe(0);

  expect(claim.width).toBe(1080);
  expect(claim.height).toBe(720);
  expect(claim.x).toBe(0);
  expect(claim.y).toBe(0);
});

// Nested: 0-run inside a child should merge within that child's rect, not leak to siblings
test("legacy_zeroCarry_isScopedToClassifier_childOnly", () => {
  // Left child is 2 cols inside 540 width => [270,270]
  // pattern: 2(0,1) => single claimant width 540 inside left half.
  // Right child is 1 => right half.
  const testStr = "2(2(0,1),1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(2);

  const [leftClaim, right] = f;

  expect(leftClaim.width).toBe(540);
  expect(leftClaim.height).toBe(720);
  expect(leftClaim.x).toBe(0);
  expect(leftClaim.y).toBe(0);

  expect(right.width).toBe(540);
  expect(right.x).toBe(540);
});

// Nested + overlay: 0{...} merged overlay is relative to the child rect
test("legacy_zeroOverlay_mergedRegionScopedToChild", () => {
  // Left half is 540 width, split into 3 => [180,180,180]
  // 3(0{1},0,1) within left half => overlay width 180 @ x=0, claim width 540 @ x=0
  const testStr = "2(3(0{1},0,1),1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");
  expect(f.length).toBe(3);

  const [o1, claim, right] = f;

  expect(o1.width).toBe(180);
  expect(o1.height).toBe(720);
  expect(o1.x).toBe(0);
  expect(o1.y).toBe(0);

  expect(claim.width).toBe(540);
  expect(claim.x).toBe(0);

  expect(right.width).toBe(540);
  expect(right.x).toBe(540);
});

// Runtime infeasible split: ensure parseM0StringTestRunner returns [] (catching SPLIT_EXCEEDS_AXIS)
test("runtime_infeasibleSplit_producesEmptyArray_notPartial", () => {
  // Outer is fine, inner infeasible should invalidate whole parse.
  const testStr = "2(1{3[1,1,1]},1)";
  const f = parseM0StringTestRunner(testStr, 10, 2, "LOGICAL"); // inner asks 3 rows in height <=2
  expect(f).toEqual([]);
});
test("legacy_zeroOverlay_multipleInRun_growsMonotonically_colSplit", () => {
  // 7 cols => [155,154,154,154,154,154,155]
  // after 1st 0{1}: 155
  // after 2nd 0{1}: 309
  // after 3rd 0{1}: 463
  // then final claimant 1 absorbs the rest (so total claim starts at 0 and is > 464)
  const testStr = "7(0{1},0{1},0{1},0,1,1,1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");

  // overlays: 155, 309, 463
  // claimant: absorbs carry (155+154+154+154) + its own (154) = 771
  // plus trailing [154,155]
  expect(f.length).toBe(6);

  const [o1, o2, o3, claim, tail1, tail2] = f;

  expect(o1.width).toBe(155);
  expect(o1.x).toBe(0);

  expect(o2.width).toBe(309);
  expect(o2.x).toBe(0);

  expect(o3.width).toBe(463);
  expect(o3.x).toBe(0);

  expect(claim.width).toBe(771);
  expect(claim.x).toBe(0);

  expect(tail1.width).toBe(154);
  expect(tail1.x).toBe(771);

  expect(tail2.width).toBe(155);
  expect(tail2.x).toBe(925);
});

test("legacy_zeroOverlay_stopsGrowingAfterRunEnds", () => {
  const testStr = "7(0{1},1,0{1},1,1,1,1)";
  const f = parseM0StringTestRunner(testStr, 1080, 720, "LOGICAL");

  expect(f.length).toBe(7);

  const [o1, c1, o2, c2, t1, t2, t3] = f;

  expect(o1.width).toBe(155);
  expect(o1.height).toBe(720);
  expect(o1.x).toBe(0);
  expect(o1.y).toBe(0);

  expect(c1.width).toBe(309);
  expect(c1.height).toBe(720);
  expect(c1.x).toBe(0);
  expect(c1.y).toBe(0);

  // new run starts at x=310 (3rd slice)
  expect(o2.width).toBe(154);
  expect(o2.height).toBe(720);
  expect(o2.x).toBe(309);
  expect(o2.y).toBe(0);

  expect(c2.width).toBe(308);
  expect(c2.height).toBe(720);
  expect(c2.x).toBe(309);
  expect(c2.y).toBe(0);

  expect(t1.width).toBe(154);
  expect(t1.x).toBe(617);

  expect(t2.width).toBe(154);
  expect(t2.x).toBe(771);

  expect(t3.width).toBe(155);
  expect(t3.x).toBe(925);
});

// ─────────────────────────────────────────────────────────────────────────────
// EditorFrame Tests (parseLeafFrames)
// ─────────────────────────────────────────────────────────────────────────────

import {
  parseM0StringToFullGraph,
  parseM0StringToRenderFrames,
} from "./m0StringParser";
import type { EditorFrame } from "../types";

/** Local helper: reproduces old leaf-only filter for test compat. */
function parseLeafFrames(s: string, w: number, h: number): EditorFrame[] {
  return parseM0StringToFullGraph(s, w, h).filter(
    (f) => f.kind !== "group" && !(f.kind === "root" && f.nullFrame)
  );
}

describe("EditorFrame parser (leaf-only via parseM0StringToFullGraph)", () => {
  describe("validation", () => {
    test("isValidM0String rejects bare hyphen", () => {
      expect(isValidM0String("-")).toBe(false);
    });

    test("isValidM0String accepts bare 1", () => {
      expect(isValidM0String("1")).toBe(true);
    });

    test("rejects empty string with enclosure", () => {
      expect(isValidM0String("2()")).toBe(false);
    });

    test("accepts empty string", () => {
      expect(isValidM0String("")).toBe(false);
    });
  });

  describe("canonicalization", () => {
    test("F is treated as 1", () => {
      const f = parseLeafFrames("2(F,F)", 100, 100);
      const tiles = f.filter((fr) => !fr.nullFrame);
      expect(tiles.length).toBe(2);
    });

    test("> is treated as 0", () => {
      const f = parseLeafFrames("2(>,1)", 100, 100);
      const zeros = f.filter((fr) => fr.passthroughFrame);
      expect(zeros.length).toBe(1);
    });

    test("whitespace is stripped", () => {
      const f1 = parseLeafFrames("2(1, 1)", 100, 100);
      const f2 = parseLeafFrames("2 ( 1 , 1 )", 100, 100);
      expect(f1.length).toBe(f2.length);
    });
  });

  describe("EditorFrame properties", () => {
    test("single tile has logicalIndex 0", () => {
      const f = parseLeafFrames("1", 1920, 1080);
      expect(f.length).toBe(1);
      expect(f[0].logicalIndex).toBe(0);
      expect(f[0].nullFrame).toBe(false);
      expect(f[0].passthroughFrame).toBe(false);
      expect(f[0].overlayDepth).toBe(0);
      expect(f[0].kind).toBe("root");
    });

    test("logicalIndex increments for each 1 tile", () => {
      const f = parseLeafFrames("3(1,1,1)", 900, 600);
      const tiles = f.filter((fr) => !fr.nullFrame);
      expect(tiles.map((fr) => fr.logicalIndex)).toEqual([0, 1, 2]);
    });

    test("passthrough frames are nullFrame with passthroughFrame flag", () => {
      const f = parseLeafFrames("3(0,0,1)", 900, 600);
      const zeros = f.filter((fr) => fr.passthroughFrame);
      expect(zeros.length).toBe(2);
      zeros.forEach((z) => {
        expect(z.nullFrame).toBe(true);
        expect(z.logicalIndex).toBeUndefined();
      });
    });

    test("null-render frames (hyphen) have no logicalIndex", () => {
      const f = parseLeafFrames("3(-,1,1)", 900, 600);
      const nulls = f.filter((fr) => fr.nullFrame && !fr.passthroughFrame);
      expect(nulls.length).toBe(1);
      expect(nulls[0].logicalIndex).toBeUndefined();
      expect(nulls[0].kind).toBe("null");
    });

    test("overlayDepth increases inside overlays", () => {
      const f = parseLeafFrames("1{1}", 100, 100);
      expect(f.length).toBe(2);
      expect(f[0].overlayDepth).toBe(0);
      expect(f[1].overlayDepth).toBe(1);
    });

    test("deeply nested overlays increment overlayDepth", () => {
      const f = parseLeafFrames("1{1{1{1}}}", 100, 100);
      expect(f.length).toBe(4);
      expect(f.map((fr) => fr.overlayDepth)).toEqual([0, 1, 2, 3]);
    });

    test("tiles have meta with M0NodeIdentity", () => {
      const f = parseLeafFrames("2(1,1)", 100, 100);
      const tiles = f.filter((fr) => !fr.nullFrame);
      expect(tiles[0].meta.kind).toBe("frame");
      expect(tiles[0].meta.stableKey).toBe("r/fc0");
      expect(tiles[1].meta.stableKey).toBe("r/fc1");
    });

    test("zero-frames have passthrough kind", () => {
      const f = parseLeafFrames("2(0,1)", 100, 100);
      const zero = f.find((fr) => fr.passthroughFrame)!;
      expect(zero.kind).toBe("passthrough");
    });
  });

  describe("isLogicalOwner flag", () => {
    test("hyphen with overlay is a logical null owner", () => {
      const f = parseLeafFrames("2(-{1},1)", 100, 100);
      const hyphen = f.find((fr) => fr.kind === "null");
      expect(hyphen).toBeDefined();
      expect(hyphen!.isLogicalOwner).toBe(true);
    });

    test("hyphen without overlay is not a logical owner", () => {
      const f = parseLeafFrames("2(-,1)", 100, 100);
      const hyphen = f.find((fr) => fr.kind === "null");
      expect(hyphen).toBeDefined();
      expect(hyphen!.isLogicalOwner).toBeFalsy();
    });
  });

  describe("geometry calculations", () => {
    test("row split divides height equally", () => {
      const f = parseLeafFrames("3[1,1,1]", 900, 600);
      const tiles = f.filter((fr) => !fr.nullFrame);

      expect(tiles[0]).toMatchObject({ width: 900, height: 200, x: 0, y: 0 });
      expect(tiles[1]).toMatchObject({ width: 900, height: 200, x: 0, y: 200 });
      expect(tiles[2]).toMatchObject({ width: 900, height: 200, x: 0, y: 400 });
    });

    test("column split divides width equally", () => {
      const f = parseLeafFrames("3(1,1,1)", 900, 600);
      const tiles = f.filter((fr) => !fr.nullFrame);

      expect(tiles[0]).toMatchObject({ width: 300, height: 600, x: 0, y: 0 });
      expect(tiles[1]).toMatchObject({ width: 300, height: 600, x: 300, y: 0 });
      expect(tiles[2]).toMatchObject({ width: 300, height: 600, x: 600, y: 0 });
    });

    test("fractional remainder distributed outside-in", () => {
      // 7 cols on 1080 width => [155,154,154,154,154,154,155]
      const f = parseLeafFrames("7(1,1,1,1,1,1,1)", 1080, 720);
      const tiles = f.filter((fr) => !fr.nullFrame);

      expect(tiles[0].width).toBe(155);
      expect(tiles[1].width).toBe(154);
      expect(tiles[2].width).toBe(154);
    });

    test("zero-frame claims space from claimant", () => {
      const f = parseLeafFrames("2(0,1)", 100, 100);
      const zero = f.find((fr) => fr.passthroughFrame)!;
      const tile = f.find((fr) => !fr.nullFrame)!;

      // Zero takes 50px, claimant absorbs both -> 100px total
      expect(zero.width).toBe(50);
      expect(tile.width).toBe(100); // absorbs zero's space
      expect(tile.x).toBe(0); // starts at zero's position
    });

    test("nested containers calculate geometry correctly", () => {
      const f = parseLeafFrames("2(2[1,1],2[1,1])", 1000, 1000);
      const tiles = f.filter((fr) => !fr.nullFrame);

      // Left container: 500px wide, 2 rows of 500px height each
      expect(tiles[0]).toMatchObject({ width: 500, height: 500, x: 0, y: 0 });
      expect(tiles[1]).toMatchObject({ width: 500, height: 500, x: 0, y: 500 });

      // Right container: same
      expect(tiles[2]).toMatchObject({ width: 500, height: 500, x: 500, y: 0 });
      expect(tiles[3]).toMatchObject({ width: 500, height: 500, x: 500, y: 500 });
    });
  });

  describe("overlay geometry", () => {
    test("overlay uses parent rect dimensions", () => {
      const f = parseLeafFrames("1{2(1,1)}", 1000, 1000);
      const tiles = f.filter((fr) => !fr.nullFrame);

      // Root tile is 1000x1000 at overlay depth 0
      expect(tiles[0]).toMatchObject({
        width: 1000,
        height: 1000,
        x: 0,
        y: 0,
        overlayDepth: 0,
      });
      // Overlay splits into 2 cols (engine adds container depth)
      expect(tiles[1]).toMatchObject({ width: 500, height: 1000, x: 0, y: 0 });
      expect(tiles[2]).toMatchObject({ width: 500, height: 1000, x: 500, y: 0 });
    });

    test("container overlay uses container rect", () => {
      const f = parseLeafFrames("2(1,1){1}", 1000, 1000);
      const tiles = f.filter((fr) => !fr.nullFrame);

      // Container children at depth 1 (inside root group)
      expect(tiles[0]).toMatchObject({ width: 500, height: 1000, x: 0, y: 0 });
      expect(tiles[1]).toMatchObject({ width: 500, height: 1000, x: 500, y: 0 });

      // Overlay covers entire container (1000x1000)
      expect(tiles[2]).toMatchObject({ width: 1000, height: 1000, x: 0, y: 0 });
    });
  });

  describe("edge cases", () => {
    test("empty string returns empty array", () => {
      const f = parseLeafFrames("", 100, 100);
      expect(f).toEqual([]);
    });

    test("invalid string returns empty array", () => {
      const f = parseLeafFrames("invalid!", 100, 100);
      expect(f).toEqual([]);
    });

    test("bare hyphen returns empty (rejected by strict validator)", () => {
      const f = parseLeafFrames("-", 100, 100);
      expect(f).toEqual([]);
    });

    test("very deep nesting works", () => {
      const f = parseLeafFrames("1{1{1{1{1{1}}}}}", 100, 100);
      expect(f.length).toBe(6);
      expect(f[5].overlayDepth).toBe(5);
    });

    test("large split count", () => {
      const f = parseLeafFrames("10(1,1,1,1,1,1,1,1,1,1)", 1000, 100);
      const tiles = f.filter((fr) => !fr.nullFrame);
      expect(tiles.length).toBe(10);
      expect(tiles.map((fr) => fr.width)).toEqual([100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    });

    test("infeasible splits return empty array", () => {
      // 3 splits in 2px produces 0-size third frame → engine rejects
      const f = parseLeafFrames("3(1,1,1)", 2, 100);
      expect(f).toEqual([]);
    });
  });

  describe("editor frames include all leaf types", () => {
    test("includes zero-frames", () => {
      const f = parseLeafFrames("2(0,1)", 100, 100);
      expect(f.some((fr) => fr.passthroughFrame)).toBe(true);
    });

    test("includes null-render frames", () => {
      const f = parseLeafFrames("2(-,1)", 100, 100);
      expect(f.some((fr) => fr.nullFrame && !fr.passthroughFrame)).toBe(true);
    });

    test("leaf filter excludes group containers", () => {
      const f = parseLeafFrames("2(1,1)", 100, 100);
      expect(f.every((fr) => fr.kind !== "group")).toBe(true);
      // Full graph includes the root container (nullFrame root)
      const full = parseM0StringToFullGraph("2(1,1)", 100, 100);
      expect(full.some((fr) => fr.kind === "root" && fr.nullFrame)).toBe(true);
      expect(full.length).toBeGreaterThan(f.length);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RenderFrame Tests (parseM0StringToRenderFrames)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseM0StringToRenderFrames", () => {
  test("returns only rendered frames", () => {
    const f = parseM0StringToRenderFrames("3(0,1,1)", 900, 600);
    expect(f.length).toBe(2); // 0 is filtered out
  });

  test("RenderFrame has correct properties", () => {
    const f = parseM0StringToRenderFrames("2(1,1)", 1000, 500);

    expect(f[0]).toMatchObject({
      width: 500,
      height: 500,
      x: 0,
      y: 0,
      paintOrder: 0,
      logicalIndex: 0,
    });

    expect(f[1]).toMatchObject({
      width: 500,
      height: 500,
      x: 500,
      y: 0,
      paintOrder: 1,
      logicalIndex: 1,
    });
  });

  test("paintOrder is sequential for rendered frames (0-based, back-to-front)", () => {
    const f = parseM0StringToRenderFrames("4(1,1,1,1)", 400, 100);
    expect(f.map((fr) => fr.paintOrder)).toEqual([0, 1, 2, 3]);
  });

  test("logicalIndex matches array position", () => {
    const f = parseM0StringToRenderFrames("3[1,1,1]", 100, 300);
    expect(f.map((fr) => fr.logicalIndex)).toEqual([0, 1, 2]);
  });

  test("empty string returns empty array", () => {
    const f = parseM0StringToRenderFrames("", 100, 100);
    expect(f).toEqual([]);
  });

  test("invalid string returns empty array", () => {
    const f = parseM0StringToRenderFrames("bad!", 100, 100);
    expect(f).toEqual([]);
  });

  test("nested overlays produce correct RenderFrames", () => {
    const f = parseM0StringToRenderFrames("1{1}", 100, 100);
    expect(f.length).toBe(2);
    expect(f[0]).toMatchObject({ width: 100, height: 100, x: 0, y: 0 });
    expect(f[1]).toMatchObject({ width: 100, height: 100, x: 0, y: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zero-frame overlay stackOrder tests (critical for correct paint order)
// ─────────────────────────────────────────────────────────────────────────────

describe("zero-frame overlay stackOrder", () => {
  /**
   * Zero-frame overlays must paint AFTER the claimant that absorbs their space.
   * This is the key behavior that differentiates 0{...} from 1{...}.
   *
   * For 0{...}: claimant painted first (back), zero-overlay on top
   * For 1{...}: base tile painted first (back), overlay on top (same behavior)
   */

  test("zero-run-basic: 2(0{2[-,1]},1) - claimant paints before zero-overlay", () => {
    // 2(0{2[-,1]},1): zero-frame with overlay, then claimant
    // Claimant (1) should paint FIRST (stackOrder 1)
    // Zero-overlay tile should paint AFTER (stackOrder 2)
    const frames = parseM0StringTestRunner("2(0{2[-,1]},1)", 1024, 1024, "PAINT");

    expect(frames.length).toBe(2);

    // Find frames by their geometry - claimant is full width, overlay is partial
    const claimant = frames.find((f) => f.width === 1024);
    const overlay = frames.find((f) => f.width === 512);

    expect(claimant).toBeDefined();
    expect(overlay).toBeDefined();

    // Claimant must have LOWER stackOrder (paints first, in back)
    expect(claimant!.stackOrder).toBeLessThan(overlay!.stackOrder);
    expect(claimant!.stackOrder).toBe(1);
    expect(overlay!.stackOrder).toBe(2);
  });

  test("zero-run-multiple: 3(0{2[-,1]},0{2[1,-]},1) - claimant before both zero-overlays", () => {
    // Two zero-frames with overlays, then claimant
    // Claimant should paint first, then both zero-overlays
    const frames = parseM0StringTestRunner("3(0{2[-,1]},0{2[1,-]},1)", 1024, 1024, "PAINT");

    expect(frames.length).toBe(3);

    // Claimant is full width (all 3 columns absorbed)
    const claimant = frames.find((f) => f.width === 1024);
    // Zero-overlays are partial width
    const overlays = frames.filter((f) => f.width < 1024);

    expect(claimant).toBeDefined();
    expect(overlays.length).toBe(2);

    // Claimant has lowest stackOrder
    expect(claimant!.stackOrder).toBe(1);

    // Both overlays have higher stackOrder
    for (const ov of overlays) {
      expect(ov.stackOrder).toBeGreaterThan(claimant!.stackOrder);
    }

    // Overlays paint in their logical order (first zero's overlay, then second zero's)
    const sorted = overlays.sort((a, b) => a.stackOrder - b.stackOrder);
    expect(sorted[0].stackOrder).toBe(2);
    expect(sorted[1].stackOrder).toBe(3);
  });

  test("overlay-on-left: 2(1{2[-,1]},1) - regular overlay after its base tile", () => {
    // Regular overlay (1{...}) - base tile first, overlay second, sibling third
    const frames = parseM0StringTestRunner("2(1{2[-,1]},1)", 1024, 1024, "PAINT");

    expect(frames.length).toBe(3);

    // Base tile is left half (512px wide)
    // Overlay is same position, bottom half
    // Sibling is right half (512px wide)

    const baseTile = frames.find((f) => f.width === 512 && f.height === 1024);
    const overlay = frames.find((f) => f.width === 512 && f.height === 512);
    const sibling = frames.find(
      (f) => f.width === 512 && f.height === 1024 && f.x === 512
    );

    expect(baseTile).toBeDefined();
    expect(overlay).toBeDefined();
    expect(sibling).toBeDefined();

    // Base tile paints first, then its overlay, then sibling
    expect(baseTile!.stackOrder).toBeLessThan(overlay!.stackOrder);
    expect(overlay!.stackOrder).toBeLessThan(sibling!.stackOrder);
  });

  test("group-overlay: 2(1,1){2[-,1]} - children before group overlay", () => {
    // Container with 2 children and a group overlay
    // Children paint first, then group overlay
    const frames = parseM0StringTestRunner("2(1,1){2[-,1]}", 1024, 1024, "PAINT");

    expect(frames.length).toBe(3);

    // Two children are 512px wide each
    // Group overlay covers full width, bottom half
    const children = frames.filter((f) => f.width === 512);
    const groupOverlay = frames.find((f) => f.width === 1024);

    expect(children.length).toBe(2);
    expect(groupOverlay).toBeDefined();

    // Both children have lower stackOrder than group overlay
    for (const child of children) {
      expect(child.stackOrder).toBeLessThan(groupOverlay!.stackOrder);
    }
  });
});
