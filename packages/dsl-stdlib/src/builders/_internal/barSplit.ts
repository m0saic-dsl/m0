/**
 * Shared helpers for building bar+frame DSL splits.
 *
 * Used by aspectFit and placeRect to emit `-` bars around a `1` frame.
 */

import type { M0String } from "@m0saic/dsl";
import { weightedTokens } from "../weightedTokens";
import { container } from "../container";
import type { ContainerAxis } from "../container";

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function gcdOfArray(arr: number[]): number {
  let result = arr[0];
  for (let i = 1; i < arr.length; i++) {
    result = gcd(result, arr[i]);
  }
  return result;
}

/**
 * Build a single-axis weighted split: bars (as `-`) around a claimant.
 *
 * GCD-reduces the segment weights for compact DSL output.
 * Pixel-exact: total weight always divides the root dimension evenly.
 */
export function buildSingleAxisSplit(
  beforeBar: number,
  frameDim: number,
  afterBar: number,
  axis: ContainerAxis,
  claimant = "1",
): { m0: M0String; totalWeight: number } {
  const segments: number[] = [];
  const claimants: string[] = [];

  if (beforeBar > 0) {
    segments.push(beforeBar);
    claimants.push("-");
  }
  segments.push(frameDim);
  claimants.push(claimant);
  if (afterBar > 0) {
    segments.push(afterBar);
    claimants.push("-");
  }

  const d = gcdOfArray(segments);
  const reduced = segments.map((s) => s / d);

  const tokens: string[] = [];
  for (let i = 0; i < reduced.length; i++) {
    tokens.push(...weightedTokens(reduced[i], claimants[i]));
  }

  return { m0: container(tokens, axis), totalWeight: tokens.length };
}

/**
 * Build a two-axis nested split for bars on both axes.
 *
 * Structure: `outerRow[ topBar, innerCol( leftBar, claimant, rightBar ), bottomBar ]`
 *
 * Each axis is GCD-reduced independently for compact output.
 */
export function buildNestedSplit(
  topBar: number,
  bottomBar: number,
  leftBar: number,
  rightBar: number,
  frameW: number,
  frameH: number,
  claimant = "1",
): { m0: M0String; totalWeight: number } {
  // Inner: horizontal split for left bar + frame + right bar
  const hSegments: number[] = [];
  const hClaimants: string[] = [];

  if (leftBar > 0) {
    hSegments.push(leftBar);
    hClaimants.push("-");
  }
  hSegments.push(frameW);
  hClaimants.push(claimant);
  if (rightBar > 0) {
    hSegments.push(rightBar);
    hClaimants.push("-");
  }

  const dH = gcdOfArray(hSegments);
  const reducedH = hSegments.map((s) => s / dH);

  const innerTokens: string[] = [];
  for (let i = 0; i < reducedH.length; i++) {
    innerTokens.push(...weightedTokens(reducedH[i], hClaimants[i]));
  }
  const innerExpr = container(innerTokens, "col");

  // Outer: vertical split for top bar + middle row + bottom bar
  const vSegments: number[] = [];
  const vClaimants: string[] = [];

  if (topBar > 0) {
    vSegments.push(topBar);
    vClaimants.push("-");
  }
  vSegments.push(frameH);
  vClaimants.push(innerExpr as string);
  if (bottomBar > 0) {
    vSegments.push(bottomBar);
    vClaimants.push("-");
  }

  const dV = gcdOfArray(vSegments);
  const reducedV = vSegments.map((s) => s / dV);

  const outerTokens: string[] = [];
  for (let i = 0; i < reducedV.length; i++) {
    outerTokens.push(...weightedTokens(reducedV[i], vClaimants[i]));
  }

  return {
    m0: container(outerTokens, "row"),
    totalWeight: outerTokens.length,
  };
}
