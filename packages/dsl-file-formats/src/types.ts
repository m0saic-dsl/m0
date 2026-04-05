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
};
