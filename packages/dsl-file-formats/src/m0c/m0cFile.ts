import { formatISO } from "../m0/serializeM0File";
import { canonicalizeAndValidateM0 } from "../m0Validation";
import { normalizeAgentProse, normalizeCandidateContext } from "../agent";
import type {
  M0AgentMeta,
  M0cFile,
  M0cFill,
  M0cGold,
  M0cInset,
  M0FileMeta,
  M0cDeriveImage,
  M0cMaskEntry,
  M0cRankSet,
  M0cRankSetEntry,
  M0Label,
} from "../types";
import { encodeBackgroundImage } from "../derive";

/**
 * Easter-egg comment that, by convention, leads every `.m0g` (m0saic golden)
 * file before its JSON body. `parseM0cFile` tolerates leading `#` comment
 * lines, so this never breaks parsing.
 */
export const MOGGING_HEADER = "#mogging";

// ─────────────────────────────────────────────────────────────
// Serialize
// ─────────────────────────────────────────────────────────────

export function serializeM0cFile(opts: {
  m0: string;
  size?: { width: number; height: number } | null;
  created?: Date;
  app?: string | null;
  appVersion?: string | null;
  meta?: M0FileMeta | null;
  /**
   * Agent ↔ human annotations. Same shape as `.m0`'s `m0agent:*` header
   * block — stashed as a JSON object on the m0c record.
   */
  agent?: M0AgentMeta | null;
  labels?: Record<string /* stableKey */, M0Label> | null;
  /**
   * Convenience: pass an in-memory `M0cDeriveImage` here and the
   * serializer encodes it into the canonical `derive.background`
   * data-URI string. Equivalent to passing
   * `background: encodeBackgroundImage(img)`. Ignored when
   * `background` is also set.
   */
  deriveImage?: M0cDeriveImage | null;
  /**
   * Direct write-through of the `derive.background` slot — see the
   * JSDoc on `M0cFile.derive` for the documented forms (`data:image/…`,
   * `#rrggbb`, `#rrggbbaa`, or `null` for "no opinion").
   */
  background?: string | null;
  /**
   * Per-frame inline mask shapes keyed by stableKey. Same indexing primitive
   * as `labels` (both follow structural identity across DSL edits). Null
   * entries explicitly mean "no mask" (vs. absent = no opinion).
   */
  masks?: Record<string /* stableKey */, M0cMaskEntry | null> | null;
  /**
   * Per-frame rect-fill sidecar keyed by stableKey. Entries with neither
   * `color` nor `mediaRef` are silently dropped during normalization.
   */
  fill?: Record<string /* stableKey */, M0cFill> | null;
  /**
   * Per-frame insets keyed by stableKey — per-edge fractions (0..1) of each
   * frame's cell (the render-time box its source paints into). Same indexing
   * primitive as `labels` / `masks` / `fill`. All-zero entries (every edge 0)
   * are silently dropped during normalization — an inset is only meaningful
   * when an edge > 0.
   */
  insets?: Record<string /* stableKey */, M0cInset> | null;
  /**
   * Named rank sets, keyed by set name at the outer level and stableKey at
   * the inner level. Same indexing primitive as `labels` and `masks` —
   * structural identity, not positional. Inner null entries explicitly
   * mean "no rank in this set for this frame". Outer null on a set means
   * "this named set is intentionally empty".
   */
  rankSets?: Record<string /* stableKey */, M0cRankSet | null> | null;
  /**
   * Golden provenance. When present, the file is serialized as the `.m0g`
   * flavor: `format` becomes "m0g", the `gold` block is written, and a
   * `#mogging` easter-egg comment leads the output. Absent → ordinary `.m0c`.
   */
  gold?: M0cGold | null;
  /** Free-form JSON. Round-trips unchanged. */
  custom?: unknown | null;
}): string {
  const created = opts.created ?? new Date();

  const m0 = canonicalizeAndValidateM0(
    "serializeM0cFile",
    opts.m0,
    "serializeM0cFile: m0 layout string cannot be empty.",
  );

  const size = opts.size ?? null;
  if (size) assertValidSize(size.width, size.height);

  const app = opts.app ?? null;
  const appVersion = opts.appVersion ?? null;
  const meta = normalizeMeta(opts.meta ?? null);
  const agent = normalizeAgent(opts.agent ?? null);
  const labels = normalizeLabels(opts.labels ?? null);
  // Two input paths: explicit `background` string wins when present,
  // otherwise the `deriveImage` helper is encoded into the canonical
  // string. Either way the wire shape is a single nullable string.
  const derive = normalizeDerive(
    opts.background !== undefined
      ? opts.background
      : encodeBackgroundImage(opts.deriveImage ?? null),
  );
  const masks = normalizeMasks(opts.masks ?? null);
  const fill = normalizeFill(opts.fill ?? null);
  const insets = normalizeInsets(opts.insets ?? null);
  const rankSets = normalizeRankSets(opts.rankSets ?? null);

  const gold = opts.gold ?? null;
  const isGolden = gold != null;

  const file: M0cFile = {
    format: isGolden ? "m0g" : "m0c",
    version: 1,
    created: formatISO(created),
    app: app && app.trim() !== "" ? app.trim() : null,
    appVersion: appVersion && appVersion.trim() !== "" ? appVersion.trim() : null,
    meta,
    agent,
    // Golden provenance is written only for the .m0g flavor — keeps ordinary
    // .m0c output byte-identical (no `gold` key).
    ...(isGolden ? { gold } : {}),
    size,
    m0,
    labels,
    derive,
    masks,
    fill,
    insets,
    rankSets,
    custom: opts.custom ?? null,
  };

  const json = JSON.stringify(file, null, 2) + "\n";
  // `.m0g` convention: a #mogging easter-egg comment leads the golden file.
  return isGolden ? `${MOGGING_HEADER}\n${json}` : json;
}

/**
 * Serialize a **m0saic golden** (`.m0g`) — a tried-and-true, signed-off layout.
 * Thin flavor over {@link serializeM0cFile}: requires a `gold` provenance block,
 * stamps `format: "m0g"`, and prepends the `#mogging` easter-egg comment. The
 * file is otherwise a normal `.m0c` (same shape, same parser).
 */
export function serializeM0gFile(
  opts: Parameters<typeof serializeM0cFile>[0] & { gold: M0cGold },
): string {
  return serializeM0cFile(opts);
}

/**
 * Normalize an `M0AgentMeta` for JSON serialization: drop empty prose,
 * empty region maps, and collapse the whole struct to `null` when nothing
 * is left. Matches the `.m0` parser/serializer contract so the field
 * round-trips across file format conversions.
 */
export function normalizeAgent(agent: M0AgentMeta | null | undefined): M0AgentMeta | null {
  if (!agent) return null;
  const out: M0AgentMeta = {};
  if (agent.id && agent.id.trim() !== "") {
    out.id = agent.id.trim();
  }
  if (agent.note && agent.note.trim() !== "") {
    out.note = normalizeAgentProse(agent.note);
  }
  if (agent.question && agent.question.trim() !== "") {
    out.question = normalizeAgentProse(agent.question);
  }
  if (agent.regions) {
    const regions: Record<string, string> = {};
    for (const [k, v] of Object.entries(agent.regions)) {
      if (typeof v === "string" && v.trim() !== "") regions[k] = v;
    }
    if (Object.keys(regions).length) out.regions = regions;
  }
  if (agent.context !== undefined) {
    const narrowedContext = normalizeCandidateContext(agent.context);
    if (narrowedContext !== undefined) out.context = narrowedContext;
  }
  if (agent.response && agent.response.body && agent.response.body.trim() !== "") {
    const r = agent.response;
    // `src` (render-provenance pointer) and `images` (b64 screenshot
    // attachments) pass through VERBATIM — no whitespace collapsing, no
    // trimming inside data-URIs.
    const images = Array.isArray(r.images)
      ? r.images.filter((s) => typeof s === "string" && s.length > 0)
      : [];
    out.response = {
      body: normalizeAgentProse(r.body),
      ...(r.from && r.from.trim() !== "" ? { from: r.from.trim() } : {}),
      ...(r.at && r.at.trim() !== "" ? { at: r.at.trim() } : {}),
      ...(r.src && r.src.trim() !== "" ? { src: r.src.trim() } : {}),
      ...(r.srcMosaic && r.srcMosaic.trim() !== "" ? { srcMosaic: r.srcMosaic.trim() } : {}),
      ...(images.length > 0 ? { images } : {}),
    };
  }
  if (agent.comments && Array.isArray(agent.comments) && agent.comments.length > 0) {
    const comments: { id?: string; body: string; from?: string; at?: string }[] = [];
    for (const c of agent.comments) {
      if (!c || typeof c.body !== "string" || c.body.trim() === "") continue;
      comments.push({
        ...(c.id && c.id.trim() !== "" ? { id: c.id.trim() } : {}),
        body: normalizeAgentProse(c.body),
        ...(c.from && c.from.trim() !== "" ? { from: c.from.trim() } : {}),
        ...(c.at && c.at.trim() !== "" ? { at: c.at.trim() } : {}),
      });
    }
    if (comments.length) out.comments = comments;
  }
  return Object.keys(out).length ? out : null;
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
  labels: Record<string, M0Label> | null
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
  if (!masks) return null;
  const out: Record<string, M0cMaskEntry | null> = {};
  // Sort keys for deterministic JSON output — same convention `labels` uses.
  for (const [k, v] of Object.entries(masks).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (v === null) {
      // Explicit null = "no mask"; round-trips through the file.
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
  if (!fill) return null;
  const out: Record<string, M0cFill> = {};
  // Sort keys for deterministic JSON output — same convention as labels / masks.
  for (const [k, v] of Object.entries(fill).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (!v) continue;
    const color = typeof v.color === "string" ? v.color.trim() : "";
    const mediaRef = typeof v.mediaRef === "string" ? v.mediaRef.trim() : "";
    // Empty objects are dropped: an entry must carry at least one of the two
    // fields to be meaningful. Mirrors the labels normalizer's drop-empty-text
    // policy.
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
  if (!insets) return null;
  const out: Record<string, M0cInset> = {};
  // Sort keys for deterministic JSON output — same convention as labels / masks / fill.
  for (const [k, v] of Object.entries(insets).sort(([a], [b]) => a.localeCompare(b))) {
    if (!k) continue;
    if (!v || typeof v !== "object") continue;
    // Every edge must be a finite number; malformed entries are dropped.
    if (INSET_EDGES.some((e) => typeof v[e] !== "number" || !Number.isFinite(v[e]))) continue;
    // All-zero entries carry no meaning (mirrors buildGeometryDecor's
    // only-when-an-edge>0 gate) — drop them.
    if (INSET_EDGES.every((e) => v[e] === 0)) continue;
    out[k] = { top: v.top, right: v.right, bottom: v.bottom, left: v.left };
  }
  return Object.keys(out).length ? out : null;
}

function normalizeRankSets(
  rankSets: Record<string, M0cRankSet | null> | null,
): Record<string, M0cRankSet | null> | null {
  if (!rankSets) return null;
  const out: Record<string, M0cRankSet | null> = {};
  // Sort outer set names for deterministic JSON output — same convention as
  // labels / masks key sorting. Inner per-stableKey sort happens in
  // normalizeRankSet.
  for (const [name, set] of Object.entries(rankSets).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!name) continue;
    if (set === null) {
      // Explicit null = "this named set is intentionally empty"; round-trips
      // through the file as such (distinct from key-absent = no opinion).
      out[name] = null;
      continue;
    }
    const normalized = normalizeRankSet(set);
    if (normalized === null) continue; // every inner entry was invalid
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
  // Sort inner stableKey keys for deterministic emission.
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
    // No usable per-frame entries — but if the mode was supplied we still
    // emit the (empty) set so the named intent round-trips. Treat as null
    // only when there's nothing at all to record.
    if (mode === undefined) return null;
  }
  return mode !== undefined ? { mode, ranks } : { ranks };
}

function assertValidSize(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error("serializeM0cFile: width must be a positive integer.");
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error("serializeM0cFile: height must be a positive integer.");
  }
}

// ─────────────────────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────────────────────

/**
 * Strip leading blank lines and `#…` comment lines (the `.m0g` #mogging easter
 * egg) so the JSON body can be parsed. Ordinary `.m0c` starts with `{`, so this
 * is a no-op for them.
 */
function stripLeadingHashComments(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === "" || t.startsWith("#")) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join("\n");
}

/** Parse the `.m0g` `gold` provenance block. Scaffold — `criteria` is free-form. */
function parseGoldOrNull(v: unknown): M0cGold | null {
  if (!isPlainObject(v)) return null;
  const o = v as Record<string, unknown>;
  const gold: M0cGold = {};
  if (typeof o.promotedAt === "string") gold.promotedAt = o.promotedAt;
  if (typeof o.provenance === "string") gold.provenance = o.provenance;
  if ("criteria" in o) gold.criteria = o.criteria;
  return gold;
}

export function parseM0cFile(jsonText: string): M0cFile {
  if (typeof jsonText !== "string") {
    throw new Error("parseM0cFile: input must be a string");
  }

  let raw: unknown;
  try {
    // Tolerate leading `#` comment lines — the `.m0g` #mogging easter egg —
    // before the JSON body. Ordinary `.m0c` starts with `{`, so this is a
    // no-op for them.
    raw = JSON.parse(stripLeadingHashComments(jsonText));
  } catch {
    throw new Error("parseM0cFile: invalid JSON");
  }

  if (!isPlainObject(raw)) {
    throw new Error("parseM0cFile: expected JSON object");
  }

  const r = raw as Record<string, unknown>;

  if (r.format !== "m0c" && r.format !== "m0g") {
    throw new Error(
      `parseM0cFile: expected format "m0c" or "m0g", got "${String(r.format)}"`
    );
  }
  if (r.version !== 1) {
    throw new Error(
      `parseM0cFile: expected version 1, got ${String(r.version)}`
    );
  }

  const created = typeof r.created === "string" ? r.created.trim() : "";
  if (!created) throw new Error("parseM0cFile: missing created timestamp");

  // Accept canonical OR pretty DSL on read, but normalize to canonical and
  // reject invalid m0 — a file can carry pretty form, the parsed record never
  // does, and a corrupt layout fails here instead of silently round-tripping.
  const m0 = canonicalizeAndValidateM0(
    "parseM0cFile",
    typeof r.m0 === "string" ? r.m0 : "",
    "parseM0cFile: missing m0 payload",
  );

  const size = parseSizeOrNull(r.size);
  const app = parseStringOrNull(r.app);
  const appVersion = parseStringOrNull(r.appVersion);
  const meta = parseMetaOrNull(r.meta);
  const agent = parseAgentOrNull(r.agent);
  const gold = parseGoldOrNull(r.gold);
  const labels = parseLabelsOrNull(r.labels);
  const derive = parseDerive(r.derive);
  const masks = parseMasksOrNull(r.masks);
  const fill = parseFillOrNull(r.fill);
  const insets = parseInsetsOrNull(r.insets);
  const rankSets = parseRankSetsOrNull(r.rankSets);

  return {
    format: r.format as "m0c" | "m0g",
    version: 1,
    created,
    app,
    appVersion,
    meta,
    agent,
    ...(gold ? { gold } : {}),
    size,
    m0,
    labels,
    derive,
    masks,
    fill,
    insets,
    rankSets,
    custom: r.custom === undefined ? null : r.custom,
  };
}

/**
 * Read the `agent` slot from a parsed m0c JSON record. Same shape contract
 * as the `.m0` `m0agent:*` headers: drops empty prose, coerces region
 * values to strings, tolerates absent fields. Returns `null` when the
 * slot is missing or normalizes to empty.
 */
export function parseAgentOrNull(v: unknown): M0AgentMeta | null {
  if (v == null) return null;
  if (!isPlainObject(v)) return null;
  const r = v as Record<string, unknown>;
  const out: M0AgentMeta = {};

  const id = parseStringOrNull(r.id);
  if (id) out.id = id;
  const note = parseStringOrNull(r.note);
  if (note) out.note = note;
  const question = parseStringOrNull(r.question);
  if (question) out.question = question;

  if (isPlainObject(r.regions)) {
    const regions: Record<string, string> = {};
    for (const [k, rv] of Object.entries(r.regions as Record<string, unknown>)) {
      if (typeof rv === "string" && rv.trim() !== "") regions[k] = rv;
    }
    if (Object.keys(regions).length) out.regions = regions;
  }

  // Narrow the unknown JSON to the typed CandidateContext shape.
  // Unrecognized fields land in `extras` for round-trip safety; non-object
  // values get wrapped under `extras.raw`.
  if ("context" in r) {
    const narrowed = normalizeCandidateContext(r.context);
    if (narrowed !== undefined) out.context = narrowed;
  }

  if (isPlainObject(r.response)) {
    const resp = r.response as Record<string, unknown>;
    if (typeof resp.body === "string" && resp.body.trim() !== "") {
      const built: {
        body: string;
        from?: string;
        at?: string;
        src?: string;
        srcMosaic?: string;
        images?: string[];
      } = {
        body: resp.body,
      };
      if (typeof resp.from === "string" && resp.from.trim() !== "") {
        built.from = resp.from;
      }
      if (typeof resp.at === "string" && resp.at.trim() !== "") {
        built.at = resp.at;
      }
      if (typeof resp.src === "string" && resp.src.trim() !== "") {
        built.src = resp.src;
      }
      if (typeof resp.srcMosaic === "string" && resp.srcMosaic.trim() !== "") {
        built.srcMosaic = resp.srcMosaic;
      }
      if (Array.isArray(resp.images)) {
        const images = resp.images.filter(
          (s): s is string => typeof s === "string" && s.length > 0,
        );
        if (images.length > 0) built.images = images;
      }
      out.response = built;
    }
  }

  if (Array.isArray(r.comments)) {
    const comments: { id?: string; body: string; from?: string; at?: string }[] = [];
    for (const raw of r.comments) {
      if (!isPlainObject(raw)) continue;
      const c = raw as Record<string, unknown>;
      if (typeof c.body !== "string" || c.body.trim() === "") continue;
      const built: { id?: string; body: string; from?: string; at?: string } = { body: c.body };
      if (typeof c.id === "string" && c.id.trim() !== "") built.id = c.id;
      if (typeof c.from === "string" && c.from.trim() !== "") built.from = c.from;
      if (typeof c.at === "string" && c.at.trim() !== "") built.at = c.at;
      comments.push(built);
    }
    if (comments.length) out.comments = comments;
  }

  return Object.keys(out).length ? out : null;
}

function parseStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function parseSizeOrNull(v: unknown): { width: number; height: number } | null {
  if (v == null) return null;
  if (!isPlainObject(v)) return null;

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
    throw new Error("parseM0cFile: invalid size (expected {width,height} positive ints or null)");
  }

  return { width, height };
}

function parseMetaOrNull(v: unknown): M0FileMeta | null {
  if (v == null) return null;
  if (!isPlainObject(v)) throw new Error("parseM0cFile: invalid meta (expected object or null)");

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

function parseLabelsOrNull(v: unknown): Record<string, M0Label> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error("parseM0cFile: invalid labels (expected object map or null)");
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

function parseDerive(v: unknown): { background: string | null } {
  if (v == null) return { background: null };
  if (!isPlainObject(v)) throw new Error("parseM0cFile: invalid derive (expected object or null)");

  // String-form validation lives in the higher-level helpers
  // (`parseBackgroundImage` / `parseBackgroundColor`). We trust the
  // file to round-trip whatever it carried; downstream consumers
  // decide how to interpret unknown strings (defaults applied).
  const backgroundRaw = (v as any).background;
  if (backgroundRaw === undefined || backgroundRaw === null) {
    return { background: null };
  }
  if (typeof backgroundRaw !== "string") {
    throw new Error("parseM0cFile: invalid derive.background (expected string or null)");
  }
  const trimmed = backgroundRaw.trim();
  return { background: trimmed === "" ? null : trimmed };
}

function parseMasksOrNull(v: unknown): Record<string, M0cMaskEntry | null> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error("parseM0cFile: invalid masks (expected object map or null)");
  }

  const masksObj = v as Record<string, unknown>;
  const out: Record<string, M0cMaskEntry | null> = {};

  for (const [k, vv] of Object.entries(masksObj)) {
    if (!k) continue;
    if (vv === null) {
      // Round-trip explicit nulls — they mean "this frame has no mask"
      // (distinct from key-absent, which means "no opinion").
      out[k] = null;
      continue;
    }
    if (!isPlainObject(vv)) {
      throw new Error(`parseM0cFile: invalid masks["${k}"] (expected object or null)`);
    }

    const lp = (vv as any).localPath;
    if (typeof lp !== "string" || lp.trim() === "") {
      throw new Error(`parseM0cFile: invalid masks["${k}"].localPath (expected non-empty string)`);
    }

    const b = (vv as any).bounds;
    if (!isPlainObject(b)) {
      throw new Error(`parseM0cFile: invalid masks["${k}"].bounds (expected object)`);
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
        `parseM0cFile: invalid masks["${k}"].bounds (x/y/width/height must be finite numbers)`,
      );
    }

    out[k] = { localPath: lp, bounds: { x: bx, y: by, width: bw, height: bh } };
  }

  return Object.keys(out).length ? out : null;
}

function parseFillOrNull(v: unknown): Record<string, M0cFill> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error("parseM0cFile: invalid fill (expected object map or null)");
  }
  const fillObj = v as Record<string, unknown>;
  const out: Record<string, M0cFill> = {};
  for (const [k, vv] of Object.entries(fillObj)) {
    if (!k) continue;
    if (!isPlainObject(vv)) {
      throw new Error(`parseM0cFile: invalid fill["${k}"] (expected object)`);
    }
    const colorRaw = (vv as any).color;
    const mediaRefRaw = (vv as any).mediaRef;
    const color = typeof colorRaw === "string" ? colorRaw.trim() : "";
    const mediaRef = typeof mediaRefRaw === "string" ? mediaRefRaw.trim() : "";
    // Entries with neither field carry no meaning — drop silently to mirror
    // the labels parser's drop-empty-text policy.
    if (!color && !mediaRef) continue;
    const entry: M0cFill = {};
    if (color) entry.color = color;
    if (mediaRef) entry.mediaRef = mediaRef;
    out[k] = entry;
  }
  return Object.keys(out).length ? out : null;
}

function parseInsetsOrNull(v: unknown): Record<string, M0cInset> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error("parseM0cFile: invalid insets (expected object map or null)");
  }
  const insetsObj = v as Record<string, unknown>;
  const out: Record<string, M0cInset> = {};
  for (const [k, vv] of Object.entries(insetsObj)) {
    if (!k) continue;
    if (!isPlainObject(vv)) {
      throw new Error(`parseM0cFile: invalid insets["${k}"] (expected object)`);
    }
    const edges: Record<string, number> = {};
    for (const e of INSET_EDGES) {
      const raw = (vv as any)[e];
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        throw new Error(
          `parseM0cFile: invalid insets["${k}"].${e} (expected finite number)`,
        );
      }
      edges[e] = raw;
    }
    // Silently drop well-formed all-zero entries — they carry no meaning.
    if (INSET_EDGES.every((e) => edges[e] === 0)) continue;
    out[k] = { top: edges.top, right: edges.right, bottom: edges.bottom, left: edges.left };
  }
  return Object.keys(out).length ? out : null;
}

function parseRankSetsOrNull(
  v: unknown,
): Record<string, M0cRankSet | null> | null {
  if (v == null) return null;
  if (!isPlainObject(v) || Array.isArray(v)) {
    throw new Error("parseM0cFile: invalid rankSets (expected object map or null)");
  }
  const setsObj = v as Record<string, unknown>;
  const out: Record<string, M0cRankSet | null> = {};

  for (const [name, raw] of Object.entries(setsObj)) {
    if (!name) continue;
    if (raw === null) {
      // Explicit "this set is intentionally empty" — round-trip it.
      out[name] = null;
      continue;
    }
    if (!isPlainObject(raw)) {
      throw new Error(
        `parseM0cFile: invalid rankSets["${name}"] (expected object or null)`,
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
              `parseM0cFile: invalid rankSets["${name}"].mode (expected string or absent)`,
            );
          })();

    const ranksRaw = (raw as any).ranks;
    if (!isPlainObject(ranksRaw) || Array.isArray(ranksRaw)) {
      throw new Error(
        `parseM0cFile: invalid rankSets["${name}"].ranks (expected object map keyed by stableKey)`,
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
          `parseM0cFile: invalid rankSets["${name}"].ranks["${k}"] (expected finite number or null)`,
        );
      }
      ranks[k] = vv;
    }

    out[name] = mode !== undefined ? { mode, ranks } : { ranks };
  }

  return Object.keys(out).length ? out : null;
}

function isPlainObject(x: unknown): x is Record<string, any> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
