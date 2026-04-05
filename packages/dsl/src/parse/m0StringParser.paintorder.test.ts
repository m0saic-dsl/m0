/**
 * Paint order (stackOrder) tests for m0saic DSL parser.
 *
 * These tests lock down the critical paintOrder behavior:
 * - Zero-frame overlays defer until after their claimant
 * - Multiple zero overlays paint largest-first (smaller on top)
 * - Group overlays paint after their children
 * - Claimant overlays paint before deferred zero overlays
 *
 * DO NOT MODIFY without understanding the full implications.
 * These tests prevent regressions in the core rendering order.
 */

import { parseM0StringTestRunner } from "./m0StringParser";

test("paintOrder: overlay on 1 paints immediately after its parent (no donation overlap)", () => {
  const f = parseM0StringTestRunner("2(1{1},1)", 1080, 720, "PAINT");
  // logical is [baseL, overlayL, right]
  expect(f.map((x) => x.logicalOrder)).toEqual([0, 1, 2]);

  // paintOrder is [baseL, overlayL, right]
  expect(f.map((x) => x.stackOrder)).toEqual([1, 2, 3]);
});

test("paintOrder: overlay on 1 paints immediately after its parent: alternate method", () => {
  const [baseL, overlayL, right] = parseM0StringTestRunner(
    "2(1{1},1)",
    1080,
    720,
    "PAINT"
  ).filter((x) => !x.nullRender);

  expect(baseL.stackOrder).toBeLessThan(overlayL.stackOrder);
  expect(overlayL.stackOrder).toBeLessThan(right.stackOrder);
});

test("paintOrder: zero overlay deferred until claimant", () => {
  const r = parseM0StringTestRunner("2(0{1},1)", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );

  // rendered frames are [overlay, claimant] logically today
  expect(r.length).toBe(2);

  // whichever one covers full width is claimant (width 1080)
  const claimant = r.find((x) => x.width === 1080)!;
  const overlay = r.find((x) => x.width !== 1080)!;

  expect(claimant.stackOrder).toBeLessThan(overlay.stackOrder);
});

test("paintOrder: multiple zero overlays paint after claimant; smaller regions on top", () => {
  const r = parseM0StringTestRunner("3(0{1},0{1},1)", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );

  // claimant width 1080, overlays widths 360 and 720 (merged-so-far)
  const claimant = r.find((x) => x.width === 1080)!; // C
  const o1 = r.find((x) => x.width === 360)!; // A
  const o2 = r.find((x) => x.width === 720)!; // B

  // C, B, A
  // C < B
  expect(claimant.stackOrder).toBeLessThan(o2.stackOrder);
  // B < A
  expect(o2.stackOrder).toBeLessThan(o1.stackOrder);
});

test("paintOrder: group overlay paints last; zero overlay deferred to claimant", () => {
  const r = parseM0StringTestRunner("2(0{1},1){1}", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );

  expect(r.length).toBe(3);

  // Label by logical order (this is stable in your harness)
  const byL = new Map(r.map((fr) => [fr.logicalOrder, fr]));
  const A = byL.get(0)!; // 0{1} overlay
  const B = byL.get(1)!; // claimant 1
  const C = byL.get(2)!; // root/group overlay {1}

  // Expected paintOrder: B then A then C (BAC)
  expect(B.stackOrder).toBeLessThan(A.stackOrder);
  expect(A.stackOrder).toBeLessThan(C.stackOrder);
});

test("paintOrder: complex nested zeros + root overlay => E < D < C < B < A < G < F", () => {
  const r = parseM0StringTestRunner(
    "3(0{1},0{3(0{1},0{1},1)},1){2(0{1},1)}",
    1080,
    720,
    "PAINT"
  ).filter(x => !x.nullRender);

  expect(r.length).toBe(7);

  const byL = new Map(r.map((fr) => [fr.logicalOrder, fr]));
  const A = byL.get(0)!;
  const B = byL.get(1)!;
  const C = byL.get(2)!;
  const D = byL.get(3)!;
  const E = byL.get(4)!;
  const F = byL.get(5)!;
  const G = byL.get(6)!;

  // E D C B A G F
  expect(E.stackOrder).toBeLessThan(D.stackOrder);
  expect(D.stackOrder).toBeLessThan(C.stackOrder);
  expect(C.stackOrder).toBeLessThan(B.stackOrder);
  expect(B.stackOrder).toBeLessThan(A.stackOrder);
  expect(A.stackOrder).toBeLessThan(G.stackOrder);
  expect(G.stackOrder).toBeLessThan(F.stackOrder);
});

test("paintOrder: normal overlay paints immediately after parent (no donation)", () => {
  const r = parseM0StringTestRunner("3(1{1},1,1)", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );
  // logical: baseL, overlayL, mid, right
  expect(r.map((x) => x.logicalOrder)).toEqual([0, 1, 2, 3]);

  // paintOrder should preserve that (overlay right after parent)
  expect(r.map((x) => x.stackOrder)).toEqual([1, 2, 3, 4]);
});

test("paintOrder: claimant normal overlay before deferred zero overlays", () => {
  const r = parseM0StringTestRunner("3(0{1},0{1},1{1})", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );
  const byL = new Map(r.map((fr) => [fr.logicalOrder, fr]));
  const z1 = byL.get(0)!; // first zero overlay render
  const z2 = byL.get(1)!; // second zero overlay render
  const claimant = byL.get(2)!; // claimant base
  const claimantOv = byL.get(3)!; // claimant overlay render

  expect(claimant.stackOrder).toBeLessThan(claimantOv.stackOrder);
  // deferred zeros must be after claimant overlay
  expect(claimantOv.stackOrder).toBeLessThan(z2.stackOrder);
  expect(z2.stackOrder).toBeLessThan(z1.stackOrder); // if you're doing largest->smallest on top
});

test("paintOrder: zero overlays are ordered per-claimant (left run independent of right run)", () => {
  const r = parseM0StringTestRunner(
    "2(3(0{1},0{1},1),3(0{1},0{1},1))",
    1080,
    720,
    "PAINT"
  ).filter((x) => !x.nullRender);

  expect(r.length).toBe(6);

  // Label A..F by logical order 0..5 (parse order of rendered frames)
  const byL = new Map(r.map((fr) => [fr.logicalOrder, fr]));
  const A = byL.get(0)!;
  const B = byL.get(1)!;
  const C = byL.get(2)!;
  const D = byL.get(3)!;
  const E = byL.get(4)!;
  const F = byL.get(5)!;

  // Sanity: claimants are the full-width-of-their-half tiles (540px each in this layout)
  expect(C.width).toBe(540);
  expect(F.width).toBe(540);

  // Expected paintOrder:
  // left:  claimant C, then larger EQUIV (B), then smaller (A)
  // right: claimant F, then larger (E), then smaller (D)
  const seq = [C, B, A, F, E, D].map((x) => x.stackOrder);
  expect(seq).toEqual([1, 2, 3, 4, 5, 6]);

  // (optional) readability assertions
  expect(C.stackOrder).toBeLessThan(B.stackOrder);
  expect(B.stackOrder).toBeLessThan(A.stackOrder);
  expect(A.stackOrder).toBeLessThan(F.stackOrder);
  expect(F.stackOrder).toBeLessThan(E.stackOrder);
  expect(E.stackOrder).toBeLessThan(D.stackOrder);
});

test("paintOrder: root base then inner children then inner group overlay (all 4 frames)", () => {
  const r = parseM0StringTestRunner("1{2(1,1){1}}", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );

  expect(r.length).toBe(4);

  const byL = new Map(r.map((fr) => [fr.logicalOrder, fr]));
  const R = byL.get(0)!; // root base '1'
  const A = byL.get(1)!; // inner left child
  const B = byL.get(2)!; // inner right child
  const C = byL.get(3)!; // inner group overlay {1}

  expect(R.stackOrder).toBeLessThan(A.stackOrder);
  expect(A.stackOrder).toBeLessThan(B.stackOrder);
  expect(B.stackOrder).toBeLessThan(C.stackOrder);
});

test("paintOrder: zero overlay defers when claimant is GROUP (after group's rendered children)", () => {
  const r = parseM0StringTestRunner("2(0{1},2(1,1))", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );

  // rendered: zero overlay + 2 group children
  expect(r.length).toBe(3);

  const byL = new Map(r.map((fr) => [fr.logicalOrder, fr]));
  const Z = byL.get(0)!; // 0{1} overlay
  const A = byL.get(1)!; // first child in group
  const B = byL.get(2)!; // second child in group

  expect(A.stackOrder).toBeLessThan(Z.stackOrder);
  expect(B.stackOrder).toBeLessThan(Z.stackOrder);
});

test("paintOrder: claimant overlay paints before deferred zero overlay", () => {
  const r = parseM0StringTestRunner("2(0{1},1{1})", 1080, 720, "PAINT").filter(
    (x) => !x.nullRender
  );
  expect(r.length).toBe(3);

  // Identify:
  // - claimant base is full width 1080
  // - claimant overlay is also 1080 but higher logical order than claimant
  // - zero overlay is 540
  const zeroOv = r.find((x) => x.width === 540)!;
  const full = r
    .filter((x) => x.width === 1080)
    .sort((a, b) => a.logicalOrder - b.logicalOrder);
  const claimant = full[0];
  const claimantOv = full[1];

  expect(claimant.stackOrder).toBeLessThan(claimantOv.stackOrder);
  expect(claimantOv.stackOrder).toBeLessThan(zeroOv.stackOrder);
});