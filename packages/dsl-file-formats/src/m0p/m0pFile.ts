import { formatISO } from "../m0/serializeM0File";
import { toCanonicalM0String, type M0Label } from "@m0saic/dsl";
import type {
  M0pFile,
  M0pVariantEntry,
  M0pRegions,
  M0FileMeta,
  M0cDeriveImage,
  M0cFile,
} from "../types";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

/** Variant keys and region names: lowercase kebab, alphanumeric.
 *  Matches the convention documented in the .m0p design proposal. */
const KEY_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Validate a variant key or region name. Throws with a descriptive
 *  message when the input doesn't match the kebab-case rule. */
function assertValidKey(kind: "variant key" | "region name", k: string): void {
  if (!KEY_RE.test(k)) {
    throw new Error(
      `serializeM0pFile: invalid ${kind} "${k}" — must match ${KEY_RE} (lowercase kebab)`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────

export type SerializeM0pVariantInput = {
  size: { width: number; height: number };
  m0: string;
  meta?: M0FileMeta | null;
  labels?: Record<string, M0Label> | null;
  deriveImage?: M0cDeriveImage | null;
  /** Free-form per-variant JSON. Round-trips unchanged. */
  custom?: unknown | null;
  /** Optional per-variant override of pack-level fields. */
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
};

export function serializeM0pFile(opts: {
  variants: Record<string, SerializeM0pVariantInput>;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
  regions?: M0pRegions | null;
  /** Free-form pack-level JSON. Round-trips unchanged. */
  custom?: unknown | null;
}): string {
  const variantKeys = Object.keys(opts.variants);
  if (variantKeys.length === 0) {
    throw new Error("serializeM0pFile: variants must contain at least one entry.");
  }

  const created = opts.created ?? new Date();
  const packCreated = formatISO(created);
  const packApp = normalizeStringOrNull(opts.app);
  const packAppVersion = normalizeStringOrNull(opts.appVersion);
  const packMeta = normalizeMeta(opts.meta ?? null);
  const regions = normalizeRegions(opts.regions ?? null);

  // Sort variant keys for deterministic output. Same posture as .m0c labels.
  const sortedKeys = [...variantKeys].sort((a, b) => a.localeCompare(b));

  const variants: Record<string, M0pVariantEntry> = {};
  for (const key of sortedKeys) {
    assertValidKey("variant key", key);
    const v = opts.variants[key];
    variants[key] = normalizeVariantForSerialize(key, v, {
      packCreated,
      packApp,
      packAppVersion,
    });
  }

  const file: M0pFile = {
    format: "m0p",
    version: 1,
    created: packCreated,
    app: packApp,
    appVersion: packAppVersion,
    meta: packMeta,
    regions,
    custom: opts.custom ?? null,
    variants,
  };

  return JSON.stringify(file, null, 2) + "\n";
}

function normalizeVariantForSerialize(
  key: string,
  v: SerializeM0pVariantInput,
  pack: { packCreated: string; packApp: string | null; packAppVersion: string | null },
): M0pVariantEntry {
  if (!v) throw new Error(`serializeM0pFile: variant "${key}" is missing.`);

  const m0 = toCanonicalM0String(v.m0);
  if (!m0) {
    throw new Error(`serializeM0pFile: variant "${key}" has empty m0 payload.`);
  }

  if (!v.size) {
    throw new Error(`serializeM0pFile: variant "${key}" missing required size.`);
  }
  assertValidSize(key, v.size.width, v.size.height);

  const variant: M0pVariantEntry = {
    meta: normalizeMeta(v.meta ?? null),
    size: { width: v.size.width, height: v.size.height },
    m0,
    labels: normalizeLabels(v.labels ?? null),
    derive: normalizeDerive(v.deriveImage ?? null),
    custom: v.custom ?? null,
  };

  // Variant overrides only emit when they differ from the pack-level value.
  // Equal values collapse to absent (the variant inherits) so roundtripping
  // doesn't manufacture spurious overrides.
  if (v.created) {
    const variantCreated = formatISO(v.created);
    if (variantCreated !== pack.packCreated) variant.created = variantCreated;
  }
  if (v.app !== undefined) {
    const variantApp = normalizeStringOrNull(v.app);
    if (variantApp !== pack.packApp) variant.app = variantApp;
  }
  if (v.appVersion !== undefined) {
    const variantAppVersion = normalizeStringOrNull(v.appVersion);
    if (variantAppVersion !== pack.packAppVersion) variant.appVersion = variantAppVersion;
  }

  return variant;
}

function normalizeStringOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function normalizeMeta(meta: M0FileMeta | null): M0FileMeta | null {
  if (!meta) return null;
  const out: M0FileMeta = {};
  const order: (keyof M0FileMeta)[] = ["title", "author", "source", "note"];
  for (const k of order) {
    const v = meta[k];
    if (v != null) {
      const trimmed = v.trim();
      if (trimmed !== "") out[k] = trimmed;
    }
  }
  return Object.keys(out).length ? out : null;
}

function normalizeLabels(
  labels: Record<string, M0Label> | null,
): Record<string, M0Label> | null {
  if (!labels) return null;
  const out: Record<string, M0Label> = {};
  for (const [k, v] of Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (!v) continue;
    const text = (v.text ?? "").trim();
    if (!text) continue;
    const color = v.color?.trim();
    out[k] = color ? { text, color } : { text };
  }
  return Object.keys(out).length ? out : null;
}

function normalizeDerive(img: M0cDeriveImage | null): { image: M0cDeriveImage | null } {
  return { image: img ?? null };
}

function normalizeRegions(regions: M0pRegions | null): M0pRegions | null {
  if (!regions) return null;
  const sortedKeys = Object.keys(regions).sort((a, b) => a.localeCompare(b));
  if (sortedKeys.length === 0) return null;
  const out: M0pRegions = {};
  for (const key of sortedKeys) {
    assertValidKey("region name", key);
    const v = regions[key] ?? {};
    const entry: { description?: string; color?: string } = {};
    if (typeof v.description === "string") {
      const t = v.description.trim();
      if (t !== "") entry.description = t;
    }
    if (typeof v.color === "string") {
      const t = v.color.trim();
      if (t !== "") entry.color = t;
    }
    out[key] = entry;
  }
  return out;
}

function assertValidSize(variantKey: string, width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(
      `serializeM0pFile: variant "${variantKey}" size.width must be a positive integer.`,
    );
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(
      `serializeM0pFile: variant "${variantKey}" size.height must be a positive integer.`,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

export function parseM0pFile(jsonText: string): M0pFile {
  if (typeof jsonText !== "string") {
    throw new Error("parseM0pFile: input must be a string");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error("parseM0pFile: invalid JSON");
  }
  if (!isPlainObject(raw)) {
    throw new Error("parseM0pFile: expected JSON object");
  }
  const r = raw as Record<string, unknown>;

  if (r.format !== "m0p") {
    throw new Error(`parseM0pFile: expected format "m0p", got "${String(r.format)}"`);
  }
  if (r.version !== 1) {
    throw new Error(`parseM0pFile: expected version 1, got ${String(r.version)}`);
  }

  const created = typeof r.created === "string" ? r.created.trim() : "";
  if (!created) throw new Error("parseM0pFile: missing created timestamp");

  const app = parseStringOrNull(r.app);
  const appVersion = parseStringOrNull(r.appVersion);
  const meta = parseMetaOrNull(r.meta, "parseM0pFile");
  const regions = parseRegionsOrNull(r.regions);

  if (!isPlainObject(r.variants)) {
    throw new Error("parseM0pFile: variants must be an object map");
  }
  const rawVariants = r.variants as Record<string, unknown>;
  const variantKeys = Object.keys(rawVariants);
  if (variantKeys.length === 0) {
    throw new Error("parseM0pFile: variants must contain at least one entry");
  }

  const variants: Record<string, M0pVariantEntry> = {};
  for (const key of variantKeys) {
    if (!KEY_RE.test(key)) {
      throw new Error(
        `parseM0pFile: invalid variant key "${key}" — must match ${KEY_RE}`,
      );
    }
    variants[key] = parseVariantEntry(key, rawVariants[key]);
  }

  return {
    format: "m0p",
    version: 1,
    created,
    app,
    appVersion,
    meta,
    regions,
    custom: r.custom === undefined ? null : r.custom,
    variants,
  };
}

function parseVariantEntry(key: string, v: unknown): M0pVariantEntry {
  if (!isPlainObject(v)) {
    throw new Error(`parseM0pFile: variant "${key}" must be an object`);
  }
  const o = v as Record<string, unknown>;

  const m0Raw = typeof o.m0 === "string" ? o.m0.trim() : "";
  if (!m0Raw) {
    throw new Error(`parseM0pFile: variant "${key}" missing m0 payload`);
  }

  const size = parseSizeRequired(key, o.size);
  const meta = parseMetaOrNull(o.meta, `parseM0pFile: variant "${key}"`);
  const labels = parseLabelsOrNull(key, o.labels);
  const derive = parseDerive(key, o.derive);

  const entry: M0pVariantEntry = {
    meta,
    size,
    m0: m0Raw,
    labels,
    derive,
    custom: o.custom === undefined ? null : o.custom,
  };

  // Optional per-variant overrides. Validate when present.
  if (o.created !== undefined && o.created !== null) {
    if (typeof o.created !== "string" || o.created.trim() === "") {
      throw new Error(`parseM0pFile: variant "${key}" has invalid created override`);
    }
    entry.created = o.created.trim();
  }
  if (o.app !== undefined) entry.app = parseStringOrNull(o.app);
  if (o.appVersion !== undefined) entry.appVersion = parseStringOrNull(o.appVersion);

  return entry;
}

function parseStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseSizeRequired(
  variantKey: string,
  v: unknown,
): { width: number; height: number } {
  if (!isPlainObject(v)) {
    throw new Error(`parseM0pFile: variant "${variantKey}" missing required size`);
  }
  const width = (v as any).width;
  const height = (v as any).height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" size must be {width, height} positive integers`,
    );
  }
  return { width, height };
}

function parseMetaOrNull(v: unknown, ctx: string): M0FileMeta | null {
  if (v == null) return null;
  if (!isPlainObject(v)) throw new Error(`${ctx}: invalid meta (expected object or null)`);
  const metaObj = v as Record<string, unknown>;
  const meta: M0FileMeta = {};
  for (const key of ["title", "author", "source", "note"] as const) {
    const vv = metaObj[key];
    if (typeof vv === "string") {
      const t = vv.trim();
      if (t) meta[key] = t;
    }
  }
  return Object.keys(meta).length ? meta : null;
}

function parseLabelsOrNull(
  variantKey: string,
  v: unknown,
): Record<string, M0Label> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" labels must be an object map or null`,
    );
  }
  const labelsObj = v as Record<string, unknown>;
  const out: Record<string, M0Label> = {};
  for (const [k, vv] of Object.entries(labelsObj)) {
    if (!k) continue;
    if (!isPlainObject(vv)) continue;
    const textRaw = (vv as any).text;
    const text = typeof textRaw === "string" ? textRaw.trim() : "";
    if (!text) continue;
    const colorRaw = (vv as any).color;
    const color = typeof colorRaw === "string" ? colorRaw.trim() : undefined;
    out[k] = color ? { text, color } : { text };
  }
  return Object.keys(out).length ? out : null;
}

function parseDerive(variantKey: string, v: unknown): { image: M0cDeriveImage | null } {
  if (v == null) return { image: null };
  if (!isPlainObject(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" derive must be an object or null`,
    );
  }
  const image = (v as any).image;
  if (image == null) return { image: null };
  if (!isPlainObject(image)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" derive.image must be an object or null`,
    );
  }
  const mime = (image as any).mime;
  const bytes = (image as any).bytes;
  const b64 = (image as any).b64;
  if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
    throw new Error(`parseM0pFile: variant "${variantKey}" derive.image.mime invalid`);
  }
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    throw new Error(`parseM0pFile: variant "${variantKey}" derive.image.bytes invalid`);
  }
  if (typeof b64 !== "string" || b64.trim() === "") {
    throw new Error(`parseM0pFile: variant "${variantKey}" derive.image.b64 invalid`);
  }
  return { image: { mime, bytes, b64 } };
}

function parseRegionsOrNull(v: unknown): M0pRegions | null {
  if (v == null) return null;
  if (!isPlainObject(v)) {
    throw new Error("parseM0pFile: regions must be an object map or null");
  }
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  const out: M0pRegions = {};
  for (const key of keys) {
    if (!KEY_RE.test(key)) {
      throw new Error(
        `parseM0pFile: invalid region name "${key}" — must match ${KEY_RE}`,
      );
    }
    const value = obj[key];
    const entry: { description?: string; color?: string } = {};
    if (isPlainObject(value)) {
      const desc = (value as any).description;
      const color = (value as any).color;
      if (typeof desc === "string" && desc.trim()) entry.description = desc.trim();
      if (typeof color === "string" && color.trim()) entry.color = color.trim();
    }
    out[key] = entry;
  }
  return out;
}

function isPlainObject(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

// ─────────────────────────────────────────────────────────────
// Conversion helpers — bridge .m0c ↔ .m0p
// ─────────────────────────────────────────────────────────────

/**
 * Bundle a single `.m0c`-shaped file into a new pack with one variant.
 * Pure object transform — no I/O. The variant carries the m0c's size,
 * m0 payload, labels, derive, and meta. Pack-level created/app/appVersion
 * inherit from the input.
 */
export function bundleM0cIntoPack(
  variant: { key: string; file: M0cFile },
  pack?: { meta?: M0FileMeta; regions?: M0pRegions; app?: string; appVersion?: string },
): M0pFile {
  if (!KEY_RE.test(variant.key)) {
    throw new Error(
      `bundleM0cIntoPack: invalid variant key "${variant.key}" — must match ${KEY_RE}`,
    );
  }
  const f = variant.file;
  if (!f.size) {
    throw new Error(
      `bundleM0cIntoPack: source m0c is missing size — variants require explicit canvas dims`,
    );
  }

  const packApp = pack?.app ?? f.app ?? null;
  const packAppVersion = pack?.appVersion ?? f.appVersion ?? null;

  const entry: M0pVariantEntry = {
    meta: f.meta,
    size: f.size,
    m0: f.m0,
    labels: f.labels,
    derive: f.derive,
    custom: f.custom ?? null,
  };

  return {
    format: "m0p",
    version: 1,
    created: f.created,
    app: packApp,
    appVersion: packAppVersion,
    meta: pack?.meta ?? null,
    regions: pack?.regions ?? null,
    custom: null,
    variants: { [variant.key]: entry },
  };
}

/**
 * Extract one variant from a pack as a standalone `.m0c` file. Pack-level
 * fields (created, app, appVersion) are inlined unless the variant carries
 * its own override. Pure object transform — no I/O.
 */
export function extractVariantAsM0c(pack: M0pFile, key: string): M0cFile {
  const entry = pack.variants[key];
  if (!entry) {
    throw new Error(`extractVariantAsM0c: variant "${key}" not found in pack`);
  }
  return {
    format: "m0c",
    version: 1,
    created: entry.created ?? pack.created,
    app: entry.app !== undefined ? entry.app : pack.app,
    appVersion: entry.appVersion !== undefined ? entry.appVersion : pack.appVersion,
    meta: entry.meta ?? pack.meta,
    size: entry.size,
    m0: entry.m0,
    labels: entry.labels,
    derive: entry.derive,
    custom: entry.custom ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Discovery helpers
// ─────────────────────────────────────────────────────────────

/** Returns variant keys in alphabetical order. */
export function listVariantKeys(pack: M0pFile): string[] {
  return Object.keys(pack.variants).sort((a, b) => a.localeCompare(b));
}

/** Look up a variant by key. Returns null when absent. */
export function getVariant(pack: M0pFile, key: string): M0pVariantEntry | null {
  return pack.variants[key] ?? null;
}

/**
 * Find the variant whose canvas dimensions match `(width, height)` exactly.
 * Returns `null` when no variant matches. Useful for renderers picking the
 * right variant based on `ctx.target`.
 */
export function findVariantBySize(
  pack: M0pFile,
  width: number,
  height: number,
): { key: string; entry: M0pVariantEntry } | null {
  for (const key of listVariantKeys(pack)) {
    const entry = pack.variants[key];
    if (entry.size.width === width && entry.size.height === height) {
      return { key, entry };
    }
  }
  return null;
}
