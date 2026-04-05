import { toCanonicalM0String, parseM0StringToFullGraph } from "@m0saic/dsl";
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

  const frames = parseM0StringToFullGraph(
    canonical,
    SAFE_PARSE_CANVAS,
    SAFE_PARSE_CANVAS,
  );
  if (frames.length === 0) {
    throw new Error(
      `${opName}: failed to parse m0 string`,
    );
  }

  const target = frames.find(
    (f) => String(f.meta.stableKey) === stableKey,
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
