export type DeferredOverlayItem = {
  area: number;
  rootId: number;
};

export function sortDeferredOverlays(list: DeferredOverlayItem[]) {
  list.sort((a, b) => {
    const d = b.area - a.area; // largest -> smallest
    if (d !== 0) return d;
    return a.rootId - b.rootId; // deterministic tie-break
  });
}
