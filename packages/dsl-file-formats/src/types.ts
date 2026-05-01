import type { M0Label, StableKey } from "@m0saic/dsl";

// ─────────────────────────────────────────────────────────────
// .m0 file format
// ─────────────────────────────────────────────────────────────

export type M0FileMeta = {
  title?: string;
  author?: string;
  source?: string;
  note?: string;
};

export type M0File = {
  /** Literal 1. A new file format version requires a major package version bump. */
  version: 1;
  /**
   * Creation timestamp.
   *
   * Serializer always writes UTC ISO 8601 with milliseconds and trailing Z:
   *   `2026-03-31T12:00:00.000Z`
   *
   * Parser accepts any ISO 8601 / parseable datetime string for compatibility.
   */
  created: string;
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;
  size: { width: number; height: number } | null;
  /** Canonical m0 layout string. */
  m0: string;
};

// ─────────────────────────────────────────────────────────────
// .m0c file format
// ─────────────────────────────────────────────────────────────

export type M0cDeriveImageMime = "image/png" | "image/jpeg" | "image/webp";

export type M0cDeriveImage = {
  mime: M0cDeriveImageMime;
  bytes: number;
  b64: string;
};

export type M0cFile = {
  format: "m0c";
  /** Literal 1. A new file format version requires a major package version bump. */
  version: 1;
  /** UTC ISO 8601 with milliseconds and trailing Z. See M0File.created. */
  created: string;
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;

  /** Canvas size the layout was authored/viewed at. */
  size: { width: number; height: number } | null;

  /** Canonical m0 layout string. */
  m0: string;

  /**
   * Canonical labeling model: stableKey → label.
   *
   * Survives structural edits (splits) because stableKey is derived from the
   * structural traversal identity, not string indices.
   */
  labels: Record<StableKey, M0Label> | null;

  derive: { image: M0cDeriveImage | null };

  /** Free-form JSON. Same semantics as `M0pFile.custom` — templates
   *  and tooling stash structured data here (brand tokens, source
   *  asset URLs, copy variants, comments, anything the consuming
   *  code knows how to read). The format treats it as opaque: any
   *  JSON value round-trips unchanged. */
  custom: unknown | null;
};

// ─────────────────────────────────────────────────────────────
// .m0p file format — multi-variant pack
// ─────────────────────────────────────────────────────────────

/**
 * Optional shared semantic-region registry. When present at the pack level,
 * declares the named regions every variant SHOULD provide a label for
 * (e.g. "headline", "hero", "logo", "cta"). Tools can lint variants against
 * this list; the format itself does not enforce the mapping.
 *
 * Each region key matches `^[a-z0-9][a-z0-9-]*$`. Values carry optional
 * descriptive metadata for tooling (description shown in pickers, default
 * color hint applied to label-text matches when the variant doesn't supply
 * its own color).
 */
export type M0pRegions = Record<string, {
  description?: string;
  color?: string;
}>;

/**
 * One variant inside an `.m0p` pack. Structurally a `.m0c`-shaped subset:
 * carries every variant-specific field (size, m0, labels, derive, meta) but
 * inherits pack-level fields (format, version, created, app, appVersion)
 * from the enclosing pack. A variant CAN override `created`/`app`/`appVersion`
 * if its design history legitimately differs (rare).
 */
export type M0pVariantEntry = {
  /** Per-variant metadata. Falls back to pack.meta when null. */
  meta: M0FileMeta | null;

  /** Canvas this variant was designed for. Required — variants without size
   *  are nonsensical (the whole point is multi-canvas). */
  size: { width: number; height: number };

  /** Canonical m0 layout string for this variant. */
  m0: string;

  /** StableKey-keyed label map. Same shape as M0cFile.labels. */
  labels: Record<StableKey, M0Label> | null;

  /** Optional thumbnail for this variant. Same shape as M0cFile.derive. */
  derive: { image: M0cDeriveImage | null };

  /** Free-form per-variant JSON. Templates and tooling can stash
   *  variant-specific structured data here — image-source pointers,
   *  per-platform copy, render hints. The format treats it as opaque:
   *  any JSON value (object, array, string, number, boolean, null)
   *  round-trips unchanged. */
  custom: unknown | null;

  /** Optional override of pack.created. Use when the variant's authoring
   *  history legitimately differs from the pack's. */
  created?: string;

  /** Optional override of pack.app/appVersion. Same rationale. */
  app?: string | null;
  appVersion?: string | null;
};

/**
 * `.m0p` (m0 Pack) file — bundles multiple coordinated `.m0c`-shaped layout
 * variants under one shared identity. Each variant is keyed by an id like
 * `"desktop"`, `"mobile"`, `"square"`, `"story"`. Pack-level metadata
 * identifies the campaign / set; pack-level `regions` declare the shared
 * semantic vocabulary; variant entries supply per-canvas DSLs.
 *
 * See `docs/proposals/2026-04-26-m0p-pack-format.md` for the full design.
 */
export type M0pFile = {
  format: "m0p";
  /** Literal 1. A new pack-format version requires a major package bump. */
  version: 1;
  /** UTC ISO 8601 with milliseconds and trailing Z. */
  created: string;
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;
  /** Optional shared semantic-region registry. */
  regions: M0pRegions | null;
  /** Free-form pack-level JSON. Use for brand data that all variants
   *  share — palette, typography, voice, source URLs, anything the
   *  consuming templates know how to read. The format treats it as
   *  opaque: any JSON value round-trips unchanged. */
  custom: unknown | null;
  /** Variants keyed by id (e.g. "desktop", "mobile", "story"). At least one. */
  variants: Record<string, M0pVariantEntry>;
};
