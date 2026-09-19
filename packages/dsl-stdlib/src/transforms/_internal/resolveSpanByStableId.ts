import { toCanonicalM0String } from "@m0saic/dsl";
import { findFirstFrame } from "../../queries/findFrames";
import { SAFE_PARSE_CANVAS } from "./constants";

/**
 * Canonicalize a m0 string, parse it for structural metadata, and resolve
 * a frame by its stableKey to extract the source span.
 *
 * Centralizes the lookup logic shared by all `*ByStableId` transform wrappers.
 *
 * @returns The canonical string and the resolved span.
 */
export function resolveSpanByStableId(
  opName: string,
  m0: string,
  stableKey: string,
): { canonical: string; span: { start: number; end: number } } {
  const canonical = toCanonicalM0String(m0);

  const target = findFirstFrame(
    canonical,
    (_, ctx) => String(ctx.stableKey) === stableKey,
    { width: SAFE_PARSE_CANVAS, height: SAFE_PARSE_CANVAS },
  );
  if (!target) {
    throw new Error(
      `${opName}: no node found with stableKey "${stableKey}"`,
    );
  }

  const span = target.meta.span;
  if (!span) {
    throw new Error(
      `${opName}: target node does not have a source span`,
    );
  }

  return { canonical, span };
}
