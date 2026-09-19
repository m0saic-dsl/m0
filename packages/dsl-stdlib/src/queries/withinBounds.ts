import type { M0Rect } from "@m0saic/dsl";

/**
 * Returns `true` when `inner` is fully contained in `outer`.
 *
 * Containment, not intersection — every corner of `inner` must lie
 * inside `outer`. Edge-touching counts as contained (a child whose
 * right edge sits exactly on the parent's right edge is "in"). This
 * matches how m0 frames nest: a child rect never extends past its
 * parent's bounds, and exact-edge alignment is the common case.
 *
 * Used by `FrameQuery.within()` to filter walks down to frames
 * inside a named region (e.g. all render frames inside a QR eye's
 * logical-owner anchor).
 */
export function containedIn(inner: M0Rect, outer: M0Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
