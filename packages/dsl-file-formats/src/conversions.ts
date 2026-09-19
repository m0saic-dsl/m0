import type {
  M0File,
  M0cFile,
  M0pFile,
  M0FileMeta,
  M0pRegions,
} from "./types";
import { bundleM0cIntoPack, extractVariantAsM0c } from "./m0p/m0pFile";

// ─────────────────────────────────────────────────────────────
// Cross-format conversions — pure object transforms (no I/O).
//
// Together with bundleM0cIntoPack / extractVariantAsM0c these close
// the 3×3 .m0 ↔ .m0c ↔ .m0p conversion matrix. Every direction has
// exactly one canonical entry point. "downgrade*" names mark the
// directions where data is intentionally dropped (labels, derive,
// regions, multi-variant siblings) so callers see the loss in code.
// ─────────────────────────────────────────────────────────────

/**
 * Upgrade an `.m0` file to `.m0c`. Lossless — `.m0c` is a strict
 * superset of `.m0`'s shape. Labels, derive image, masks, fill, insets, and
 * rank sets start as null.
 */
export function upgradeM0ToM0c(file: M0File): M0cFile {
  return {
    format: "m0c",
    version: 1,
    created: file.created,
    app: file.app,
    appVersion: file.appVersion,
    meta: file.meta,
    size: file.size,
    m0: file.m0,
    labels: null,
    derive: { background: null },
    masks: null,
    fill: null,
    insets: null,
    rankSets: null,
    custom: null,
  };
}

/**
 * Downgrade an `.m0c` file to `.m0`. **Lossy** — drops labels,
 * derive.background, masks, fill, insets, and rank sets. Use when handing the
 * layout to a renderer or wire format that doesn't need editor metadata.
 */
export function downgradeM0cToM0(file: M0cFile): M0File {
  return {
    version: 1,
    created: file.created,
    app: file.app,
    appVersion: file.appVersion,
    meta: file.meta,
    // Agent annotations carry across — the JSON shape on `.m0c` is the
    // same struct as the `m0agent:*` headers on `.m0`, so the downgrade
    // is lossless. The line-based form can't represent extra fields that
    // future m0c versions might add to the agent block; today there are
    // none.
    agent: file.agent ?? null,
    size: file.size,
    m0: file.m0,
  };
}

/**
 * Upgrade an `.m0` file straight to a one-variant `.m0p` pack.
 * Equivalent to `bundleM0cIntoPack({ key, file: upgradeM0ToM0c(file) })`
 * with the same pack-level overrides.
 *
 * Throws if the source `.m0` is missing `size` — pack variants require
 * an explicit canvas (the whole point of multi-canvas packs).
 */
export function upgradeM0ToPack(
  variant: { key: string; file: M0File },
  pack?: {
    meta?: M0FileMeta;
    regions?: M0pRegions;
    app?: string;
    appVersion?: string;
  },
): M0pFile {
  return bundleM0cIntoPack(
    { key: variant.key, file: upgradeM0ToM0c(variant.file) },
    pack,
  );
}

/**
 * Extract one variant from an `.m0p` pack as a standalone `.m0` file.
 * **Lossy** — drops the variant's labels, derive image, and every other
 * variant in the pack. Equivalent to
 * `downgradeM0cToM0(extractVariantAsM0c(pack, key))`.
 */
export function extractVariantAsM0(pack: M0pFile, key: string): M0File {
  return downgradeM0cToM0(extractVariantAsM0c(pack, key));
}
