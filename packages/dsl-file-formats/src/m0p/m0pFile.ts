import { formatISO } from "../m0/serializeM0File";
import { canonicalizeAndValidateM0 } from "../m0Validation";
import { encodeBackgroundImage } from "../derive";
import { normalizeAgent, parseAgentOrNull } from "../m0c/m0cFile";
import type {
  M0pFile,
  M0pVariantEntry,
  M0pRegions,
  M0FileMeta,
  M0AgentMeta,
  M0cDeriveImage,
  M0cFile,
  M0cFill,
  M0cInset,
  M0cMaskEntry,
  M0cRankSet,
  M0cRankSetEntry,
  M0Label,
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
  /** Convenience for image-flavored backgrounds — equivalent to
   *  `background: encodeBackgroundImage(img)`. Ignored when
   *  `background` is set explicitly. */
  deriveImage?: M0cDeriveImage | null;
  /** Direct write-through of the `derive.background` slot. See the
   *  JSDoc on `M0cFile.derive` for the documented payload forms
   *  (`data:image/…`, `#rrggbb`, `#rrggbbaa`, or `null`). */
  background?: string | null;
  /** Per-frame inline mask shapes keyed by stableKey. Same shape as M0cFile.masks. */
  masks?: Record<string, M0cMaskEntry | null> | null;
  /** Per-frame rect-fill sidecar keyed by stableKey. Same shape as M0cFile.fill. */
  fill?: Record<string, M0cFill> | null;
  /** Per-frame insets keyed by stableKey. Same shape as M0cFile.insets —
   *  per-edge fractions (0..1) of each frame's cell. All-zero entries dropped. */
  insets?: Record<string, M0cInset> | null;
  /** Named rank sets, keyed by set name then by stableKey. Same shape as
   *  M0cFile.rankSets. */
  rankSets?: Record<string, M0cRankSet | null> | null;
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
  /** Pack-level agent ↔ human annotations (sign-off note/question/response), mirroring `.m0c`. */
  agent?: M0AgentMeta | null;
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

  const packAgent = normalizeAgent(opts.agent ?? null);

  const file: M0pFile = {
    format: "m0p",
    version: 1,
    created: packCreated,
    app: packApp,
    appVersion: packAppVersion,
    meta: packMeta,
    // Pack-level agent emitted only when present — keeps agent-free packs
    // byte-identical.
    ...(packAgent ? { agent: packAgent } : {}),
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

  const m0 = canonicalizeAndValidateM0(
    `serializeM0pFile (variant "${key}")`,
    v.m0,
    `serializeM0pFile: variant "${key}" has empty m0 payload.`,
  );

  if (!v.size) {
    throw new Error(`serializeM0pFile: variant "${key}" missing required size.`);
  }
  assertValidSize(key, v.size.width, v.size.height);

  const variant: M0pVariantEntry = {
    meta: normalizeMeta(v.meta ?? null),
    size: { width: v.size.width, height: v.size.height },
    m0,
    labels: normalizeLabels(v.labels ?? null),
    derive: normalizeDerive(
      v.background !== undefined
        ? v.background
        : encodeBackgroundImage(v.deriveImage ?? null),
    ),
    masks: normalizeMasks(v.masks ?? null),
    fill: normalizeFill(v.fill ?? null),
    insets: normalizeInsets(v.insets ?? null),
    rankSets: normalizeRankSets(v.rankSets ?? null),
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

function normalizeDerive(bg: string | null | undefined): { background: string | null } {
  if (typeof bg !== "string") return { background: null };
  const trimmed = bg.trim();
  return { background: trimmed === "" ? null : trimmed };
}

function normalizeMasks(
  masks: Record<string, M0cMaskEntry | null> | null,
): Record<string, M0cMaskEntry | null> | null {
  // Mirror the .m0c implementation — same indexing semantics + same
  // null-vs-absent distinction (null = "explicitly no mask").
  if (!masks) return null;
  const out: Record<string, M0cMaskEntry | null> = {};
  for (const [k, v] of Object.entries(masks).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (v === null) {
      out[k] = null;
      continue;
    }
    if (!v || typeof v.localPath !== "string" || v.localPath.trim() === "") continue;
    const b = v.bounds;
    if (
      !b ||
      typeof b.x !== "number" ||
      typeof b.y !== "number" ||
      typeof b.width !== "number" ||
      typeof b.height !== "number"
    ) {
      continue;
    }
    out[k] = {
      localPath: v.localPath,
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
    };
  }
  return Object.keys(out).length ? out : null;
}

function normalizeFill(
  fill: Record<string, M0cFill> | null,
): Record<string, M0cFill> | null {
  // Mirror the .m0c implementation — entries lacking both `color` and
  // `mediaRef` are dropped (no meaningful payload).
  if (!fill) return null;
  const out: Record<string, M0cFill> = {};
  for (const [k, v] of Object.entries(fill).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (!v) continue;
    const color = typeof v.color === "string" ? v.color.trim() : "";
    const mediaRef = typeof v.mediaRef === "string" ? v.mediaRef.trim() : "";
    if (!color && !mediaRef) continue;
    const entry: M0cFill = {};
    if (color) entry.color = color;
    if (mediaRef) entry.mediaRef = mediaRef;
    out[k] = entry;
  }
  return Object.keys(out).length ? out : null;
}

/** The four inset edges, in canonical (serialized) order. */
const INSET_EDGES = ["top", "right", "bottom", "left"] as const;

function normalizeInsets(
  insets: Record<string, M0cInset> | null,
): Record<string, M0cInset> | null {
  // Mirror the .m0c implementation — per-edge finite fractions, all-zero
  // entries dropped (an inset is meaningful only when an edge > 0).
  if (!insets) return null;
  const out: Record<string, M0cInset> = {};
  for (const [k, v] of Object.entries(insets).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (!v || typeof v !== "object") continue;
    if (INSET_EDGES.some((e) => typeof v[e] !== "number" || !Number.isFinite(v[e]))) continue;
    if (INSET_EDGES.every((e) => v[e] === 0)) continue;
    out[k] = { top: v.top, right: v.right, bottom: v.bottom, left: v.left };
  }
  return Object.keys(out).length ? out : null;
}

function normalizeRankSets(
  rankSets: Record<string, M0cRankSet | null> | null,
): Record<string, M0cRankSet | null> | null {
  // Mirror the .m0c implementation — same outer-then-inner sort + same
  // null-vs-absent distinction (outer null = "set intentionally empty";
  // inner null = "this frame has no rank in this set").
  if (!rankSets) return null;
  const out: Record<string, M0cRankSet | null> = {};
  for (const [name, set] of Object.entries(rankSets).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!name) continue;
    if (set === null) {
      out[name] = null;
      continue;
    }
    const normalized = normalizeRankSet(set);
    if (normalized === null) continue;
    out[name] = normalized;
  }
  return Object.keys(out).length ? out : null;
}

function normalizeRankSet(set: M0cRankSet): M0cRankSet | null {
  if (!set || typeof set !== "object") return null;
  const mode = typeof set.mode === "string" && set.mode.trim() !== "" ? set.mode.trim() : undefined;
  const ranks: Record<string, M0cRankSetEntry | null> = {};
  const rawRanks = set.ranks;
  if (!rawRanks || typeof rawRanks !== "object" || Array.isArray(rawRanks)) {
    return null;
  }
  for (const [k, v] of Object.entries(rawRanks).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!k) continue;
    if (v === null) {
      ranks[k] = null;
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    ranks[k] = v;
  }
  if (Object.keys(ranks).length === 0) {
    if (mode === undefined) return null;
  }
  return mode !== undefined ? { mode, ranks } : { ranks };
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
  const agent = parseAgentOrNull(r.agent);
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
    ...(agent ? { agent } : {}),
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

  // Accept canonical OR pretty DSL on read, normalize to canonical, reject
  // invalid m0 — every parsed variant is canonical and renderable.
  const m0Raw = canonicalizeAndValidateM0(
    `parseM0pFile (variant "${key}")`,
    typeof o.m0 === "string" ? o.m0 : "",
    `parseM0pFile: variant "${key}" missing m0 payload`,
  );

  const size = parseSizeRequired(key, o.size);
  const meta = parseMetaOrNull(o.meta, `parseM0pFile: variant "${key}"`);
  const labels = parseLabelsOrNull(key, o.labels);
  const derive = parseDerive(key, o.derive);
  const masks = parseMasksOrNull(key, o.masks);
  const fill = parseFillOrNull(key, o.fill);
  const insets = parseInsetsOrNull(key, o.insets);
  const rankSets = parseRankSetsOrNull(key, o.rankSets);

  const entry: M0pVariantEntry = {
    meta,
    size,
    m0: m0Raw,
    labels,
    derive,
    masks,
    fill,
    insets,
    rankSets,
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

function parseDerive(variantKey: string, v: unknown): { background: string | null } {
  if (v == null) return { background: null };
  if (!isPlainObject(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" derive must be an object or null`,
    );
  }

  const backgroundRaw = (v as any).background;
  if (backgroundRaw === undefined || backgroundRaw === null) {
    return { background: null };
  }
  if (typeof backgroundRaw !== "string") {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" derive.background must be a string or null`,
    );
  }
  const trimmed = backgroundRaw.trim();
  return { background: trimmed === "" ? null : trimmed };
}

function parseMasksOrNull(
  variantKey: string,
  v: unknown,
): Record<string, M0cMaskEntry | null> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" masks must be an object map or null`,
    );
  }
  const masksObj = v as Record<string, unknown>;
  const out: Record<string, M0cMaskEntry | null> = {};
  for (const [k, vv] of Object.entries(masksObj)) {
    if (!k) continue;
    if (vv === null) {
      out[k] = null;
      continue;
    }
    if (!isPlainObject(vv)) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" masks["${k}"] must be an object or null`,
      );
    }
    const lp = (vv as any).localPath;
    if (typeof lp !== "string" || lp.trim() === "") {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" masks["${k}"].localPath must be a non-empty string`,
      );
    }
    const b = (vv as any).bounds;
    if (!isPlainObject(b)) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" masks["${k}"].bounds must be an object`,
      );
    }
    const bx = (b as any).x;
    const by = (b as any).y;
    const bw = (b as any).width;
    const bh = (b as any).height;
    if (
      typeof bx !== "number" ||
      typeof by !== "number" ||
      typeof bw !== "number" ||
      typeof bh !== "number" ||
      !Number.isFinite(bx) ||
      !Number.isFinite(by) ||
      !Number.isFinite(bw) ||
      !Number.isFinite(bh)
    ) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" masks["${k}"].bounds x/y/width/height must be finite numbers`,
      );
    }
    out[k] = { localPath: lp, bounds: { x: bx, y: by, width: bw, height: bh } };
  }
  return Object.keys(out).length ? out : null;
}

function parseFillOrNull(
  variantKey: string,
  v: unknown,
): Record<string, M0cFill> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" fill must be an object map or null`,
    );
  }
  const fillObj = v as Record<string, unknown>;
  const out: Record<string, M0cFill> = {};
  for (const [k, vv] of Object.entries(fillObj)) {
    if (!k) continue;
    if (!isPlainObject(vv)) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" fill["${k}"] must be an object`,
      );
    }
    const colorRaw = (vv as any).color;
    const mediaRefRaw = (vv as any).mediaRef;
    const color = typeof colorRaw === "string" ? colorRaw.trim() : "";
    const mediaRef = typeof mediaRefRaw === "string" ? mediaRefRaw.trim() : "";
    if (!color && !mediaRef) continue;
    const entry: M0cFill = {};
    if (color) entry.color = color;
    if (mediaRef) entry.mediaRef = mediaRef;
    out[k] = entry;
  }
  return Object.keys(out).length ? out : null;
}

function parseInsetsOrNull(
  variantKey: string,
  v: unknown,
): Record<string, M0cInset> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" insets must be an object map or null`,
    );
  }
  const insetsObj = v as Record<string, unknown>;
  const out: Record<string, M0cInset> = {};
  for (const [k, vv] of Object.entries(insetsObj)) {
    if (!k) continue;
    if (!isPlainObject(vv)) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" insets["${k}"] must be an object`,
      );
    }
    const edges: Record<string, number> = {};
    for (const e of INSET_EDGES) {
      const raw = (vv as any)[e];
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new Error(
          `parseM0pFile: variant "${variantKey}" insets["${k}"].${e} must be a finite number`,
        );
      }
      edges[e] = raw;
    }
    if (INSET_EDGES.every((e) => edges[e] === 0)) continue;
    out[k] = { top: edges.top, right: edges.right, bottom: edges.bottom, left: edges.left };
  }
  return Object.keys(out).length ? out : null;
}

function parseRankSetsOrNull(
  variantKey: string,
  v: unknown,
): Record<string, M0cRankSet | null> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error(
      `parseM0pFile: variant "${variantKey}" rankSets must be an object map or null`,
    );
  }
  const setsObj = v as Record<string, unknown>;
  const out: Record<string, M0cRankSet | null> = {};

  for (const [name, raw] of Object.entries(setsObj)) {
    if (!name) continue;
    if (raw === null) {
      out[name] = null;
      continue;
    }
    if (!isPlainObject(raw)) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" rankSets["${name}"] must be an object or null`,
      );
    }
    const modeRaw = (raw as any).mode;
    const mode =
      modeRaw === undefined
        ? undefined
        : typeof modeRaw === "string"
        ? modeRaw
        : (() => {
            throw new Error(
              `parseM0pFile: variant "${variantKey}" rankSets["${name}"].mode must be a string or absent`,
            );
          })();
    const ranksRaw = (raw as any).ranks;
    if (!isPlainObject(ranksRaw) || Array.isArray(ranksRaw)) {
      throw new Error(
        `parseM0pFile: variant "${variantKey}" rankSets["${name}"].ranks must be an object map keyed by stableKey`,
      );
    }
    const ranks: Record<string, M0cRankSetEntry | null> = {};
    for (const [k, vv] of Object.entries(ranksRaw as Record<string, unknown>)) {
      if (!k) continue;
      if (vv === null) {
        ranks[k] = null;
        continue;
      }
      if (typeof vv !== "number" || !Number.isFinite(vv)) {
        throw new Error(
          `parseM0pFile: variant "${variantKey}" rankSets["${name}"].ranks["${k}"] must be a finite number or null`,
        );
      }
      ranks[k] = vv;
    }
    out[name] = mode !== undefined ? { mode, ranks } : { ranks };
  }

  return Object.keys(out).length ? out : null;
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
    // Agent annotations live on the variant — each variant in a pack can
    // carry its own iteration-loop notes (an agent might be reviewing a
    // single variant, not the whole pack).
    agent: f.agent ?? null,
    size: f.size,
    m0: f.m0,
    labels: f.labels,
    derive: f.derive,
    masks: f.masks,
    fill: f.fill,
    insets: f.insets,
    rankSets: f.rankSets,
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
    // Only the variant's OWN agent annotation passes through. The pack-level
    // agent (the closeout sign-off) is most relevant on the m0p pack view and
    // is NOT inherited onto each variant — that just duplicated the same block
    // across every extracted m0c.
    agent: entry.agent ?? null,
    size: entry.size,
    m0: entry.m0,
    labels: entry.labels,
    derive: entry.derive,
    masks: entry.masks,
    fill: entry.fill,
    insets: entry.insets,
    rankSets: entry.rankSets,
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
