import type { StableKey } from "@m0saic/dsl";

/**
 * Per-frame label carried on `.m0c` (and per-variant `.m0p`).
 *
 * Canonical home: this file. Historically re-exported from `@m0saic/dsl`
 * (the dsl package keeps its own structurally-identical definition for
 * backwards compatibility), but no dsl-internal code reads it — labels are
 * a file-format concern, not a DSL-grammar concern.
 *
 * Fields:
 * - `text` is the human-readable label string (required).
 * - `color` is an OPTIONAL chip-tint hint for the inspector's label badge
 *   rendering. It is **NOT** the rectangle fill color — rect fill lives on
 *   the parallel top-level `fill` map. The semantic was narrowed when
 *   `fill` landed as a first-class slot; older fixtures that stuffed rect
 *   colors into `labels[k].color` may still parse cleanly but the value no
 *   longer drives the rect overlay.
 */
export type M0Label = { text: string; color?: string };

/**
 * Per-frame fill carried on `.m0c` (and per-variant `.m0p`), keyed by
 * stableKey at the parent's level.
 *
 * Promotes "what the rectangle is filled with" to a first-class slot —
 * previously the inspector treated `labels[k].color` as the rect fill,
 * conflating it with the label chip tint. They're now separate concerns:
 * `labels[k].color` tints the badge; `fill[k]` paints the rect.
 *
 * At least one of `color` or `mediaRef` must be present when an entry is
 * written. Empty objects are rejected by the normalizer / parser.
 *
 * - `color` is a CSS `#rrggbb` (or `#rrggbbaa`) hex string painted into
 *   the rect when the inspector's Fill toggle is on.
 * - `mediaRef` is a forward-compatible asset reference slot (file path or
 *   asset id resolvable via `@m0saic/platform`'s `resolveAsset`). Reserved
 *   shape only — no consumers wire it to rendering yet; templates that
 *   want a sample PNG in an avatar rect will read it once a future change
 *   lands the resolver hookup.
 */
export type M0cFill = {
  color?: string;
  mediaRef?: string;
};

// The agent annotation block's on-disk shapes live in `./agent` (this
// package owns the wire format). The typed work-session vocabulary
// (session refs, categories, evaluations) lives in `@m0saic/momo-types`,
// which depends on this package and narrows the loose `CandidateContext`
// into its typed refinement. This package never imports the protocol.

// ─────────────────────────────────────────────────────────────
// .m0 file format
// ─────────────────────────────────────────────────────────────

export type M0FileMeta = {
  title?: string;
  author?: string;
  source?: string;
  note?: string;
};

// ─────────────────────────────────────────────────────────────
// Agent annotation layer — canonical home: ./agent (this package)
// ─────────────────────────────────────────────────────────────
//
// The agent ↔ human annotation shapes (`M0AgentMeta`, `M0AgentResponse`,
// `M0AgentComment`, the loose `CandidateContext`) and the transport
// helpers (`mintAgentId`, `collapseAgentProse`, `normalizeAgentProse`,
// `normalizeCandidateContext`) are defined in `./agent` and re-exported
// here so the package surface is unchanged. `@m0saic/momo-types` re-exports
// them again with the typed `CandidateContext` refinement for agent-side
// consumers.
export {
  mintAgentId,
  collapseAgentProse,
  normalizeAgentProse,
  normalizeCandidateContext,
} from "./agent";
export type {
  CandidateContext,
  M0AgentMeta,
  M0AgentResponse,
  M0AgentComment,
} from "./agent";
import type { M0AgentMeta } from "./agent";

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
  /**
   * Agent ↔ human annotations carried in the `# m0agent:*` header block.
   * `null` when no annotation lines were present (or all were empty).
   */
  agent?: M0AgentMeta | null;
  size: { width: number; height: number } | null;
  /** Canonical m0 layout string. */
  m0: string;
};

// ─────────────────────────────────────────────────────────────
// .m0c file format
// ─────────────────────────────────────────────────────────────

export type M0cDeriveImageMime = "image/png" | "image/jpeg" | "image/webp";

/**
 * In-memory helper for constructing an image-flavored
 * `derive.background` payload. Held as a separate type so callers that
 * want to stash an image don't have to format the data-URI by hand;
 * use {@link encodeBackgroundImage} to flatten into the canonical
 * string shape the file actually serialises.
 */
export type M0cDeriveImage = {
  mime: M0cDeriveImageMime;
  bytes: number;
  b64: string;
};

/**
 * In-memory helper for the color-flavored `derive.background` payload.
 * Use {@link encodeBackgroundColor} to flatten into the canonical
 * string shape (`#rrggbb` or `#rrggbbaa`) the file serialises.
 */
export type M0cDeriveColor = {
  /** 6-digit hex string with the leading `#` (e.g. `"#ef7525"`). */
  hex: string;
  /** Alpha 0..1, defaulting to 1 (fully opaque) when omitted in a
   *  payload missing the optional `aa` suffix. */
  opacity: number;
};

/**
 * A single per-frame inline mask entry, keyed by stableKey in `M0cFile.masks`.
 *
 * Structurally identical to `MosaicMaskEntry` in `@m0saic/types` — duplicated
 * here as a local type to keep `@m0saic/dsl-file-formats` dep-free. Any change
 * to one must be reflected in the other.
 *
 * Field semantics:
 * - `localPath`: SVG path data in local coordinates (relative to `bounds`'s
 *   origin). The engine scales the path to the tile's actual render
 *   dimensions at clip-application time:
 *     `scaleX = tileRenderWidth / bounds.width`
 *     `scaleY = tileRenderHeight / bounds.height`
 * - `bounds`: design-space bounding box the path was authored against.
 */
export type M0cMaskEntry = {
  localPath: string;
  bounds: { x: number; y: number; width: number; height: number };
};

/**
 * Per-frame rank value carried in `M0cRankSet.ranks`. Sweep progress,
 * conventionally normalized to `[0..1]` — the format does not enforce a
 * range; the value round-trips unchanged. Templates that interpret a rank as
 * animation progress should clamp at the call site.
 */
export type M0cRankSetEntry = number;

/**
 * A single named rank set carried inline on an m0c (or m0p variant), keyed
 * by stableKey.
 *
 * Structurally identical to `MosaicRankSet` in `@m0saic/types` — duplicated
 * here as a local type to keep `@m0saic/dsl-file-formats` dep-free. Any
 * change to one must be reflected in the other (see `MIRRORED_TYPES.md`).
 *
 * Field semantics:
 * - `mode`: informational ordering hint (`"diag"` / `"cascade"` / `"radial"`
 *   / `"custom"` / any future label). Round-trips unchanged; consumers
 *   treat it as opaque metadata.
 * - `ranks`: per-frame rank values keyed by `StableKey`. Null entries
 *   explicitly mean "this frame has no rank in this set" (e.g. a sweep that
 *   intentionally skips some tiles); absent keys mean "no opinion" and let
 *   consumers default however they like.
 *
 * This replaces the sidecar `MosaicRankSetFile` (positional `ranks: number[]`)
 * for m0c-inline storage: `StableKey` keys survive structural edits (splits,
 * overlays) where positional indices do not.
 */
export type M0cRankSet = {
  mode?: string;
  /**
   * Per-frame rank, keyed by stableKey. Typed as plain `string` (with a
   * stableKey comment) rather than the branded `StableKey` so callers can
   * construct rank sets with the same ergonomics as `serializeM0cFile`'s
   * `masks` / `labels` input shapes (string-keyed, brand applied at the
   * parse boundary). The runtime shape is identical either way — JSON
   * keys are strings.
   */
  ranks: Record<string /* stableKey */, M0cRankSetEntry | null>;
};

/**
 * A single per-frame **inset**, keyed by stableKey in `M0cFile.insets`.
 *
 * Each value is the fraction (0..1) of the frame's own cell that is shaved
 * off each of the four edges, giving the render-time box the frame's source
 * actually paints into. It is the **resolved projection** of a source's
 * `placement.inset` (`MosaicBoxFrac` — a `number | {x,y} | per-side` superset
 * in `@m0saic/types`) collapsed to the one canonical wire form: all four
 * edges present and explicit. The superset is resolved once, at the
 * extraction boundary (the app's `resolveBoxFrac`), so this format branch
 * stays free of the union and serialization stays byte-stable.
 *
 * The shape is byte-identical to ViewFrame's `insetBoxes` prop, so the cyan
 * inner-box painter consumes it without adaptation.
 *
 * # Semantics (why insets exist)
 *
 * Insets are how m0saic stores quantization-*hostile* layout without losing
 * precision: cells are quantized outward onto a coarse divisor lattice, and
 * a half-pixel-centered per-side fraction recovers the exact painted rect at
 * render time. See `placeInsetRects` / the feasibility handbook.
 *
 * - **Engine applies the inset FIRST** — before fit / padding / mask. It
 *   shrinks the destination rect that contain/cover then operate within.
 * - **Inset only SHRINKS** — it can never grow a rect past its cell, so it is
 *   non-clipping and leaf-scoped (a leaf frame's own paint box, never a
 *   parent's).
 * - **Half-pixel-centered.** Recovery fractions are conventionally
 *   `(n + 0.5) / dim`; the engine floors `frac * dim`, so at the authored
 *   canvas size the exact integer pixel comes back. At a DIFFERENT render
 *   size recovery degrades gracefully by ≤1px per edge — the value is
 *   resolution-agnostic but the pixel-exactness is authored-size-specific.
 *
 * # Why keyed by `StableKey` (not by frame index / sourceIndex)
 *
 * Same rationale as `labels` / `masks` / `fill` / `rankSets`: stableKey is
 * derived from structural traversal identity, so per-frame data survives
 * splits / overlay adds / repacks where positional indices do not — a split
 * derives child keys from the parent's; an overlay add inserts a fresh key
 * without disturbing siblings.
 *
 * Structurally a resolved projection of `MosaicBoxFrac` from `@m0saic/types`;
 * see `MIRRORED_TYPES.md`.
 */
export type M0cInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Golden-provenance block for `.m0g` files (m0saic goldens — "mogging"). A
 * tried-and-true, signed-off, crystallized layout. SCAFFOLD ONLY: the
 * qualification *criteria* are undecided, so `criteria` is intentionally
 * free-form for now. See the template build-closeout notes
 * (North star) for the corpus direction this feeds.
 */
export type M0cGold = {
  /** When the layout was crystallized to golden — UTC ISO 8601. */
  promotedAt?: string;
  /** Free-form provenance: source session / candidate, who signed off. */
  provenance?: string;
  /** Reserved for the (undecided) qualification criteria. */
  criteria?: unknown;
};

export type M0cFile = {
  /**
   * `"m0c"` for a working layout file; `"m0g"` for a **m0saic golden**
   * ("mogging") — a tried-and-true, signed-off layout. `.m0g` is a flavor of
   * `.m0c`: structurally identical (same shape, same parser) and additionally
   * carrying the {@link M0cGold} `gold` block. By convention `.m0g` files begin
   * with a `#mogging` easter-egg comment line before the JSON body (the parser
   * tolerates leading `#` comments).
   */
  format: "m0c" | "m0g";
  /** Literal 1. A new file format version requires a major package version bump. */
  version: 1;
  /** UTC ISO 8601 with milliseconds and trailing Z. See M0File.created. */
  created: string;
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;
  /** Agent ↔ human annotations (`m0agent:*` block on .m0; same shape stashed on .m0c / .m0p / .m0v JSON). `null` when no annotations were carried. */
  agent?: M0AgentMeta | null;

  /**
   * Golden provenance — present on `.m0g` (format "m0g") files; absent/null on
   * ordinary `.m0c`. Marks a layout crystallized into a tried-and-true golden.
   * Scaffold only — see {@link M0cGold}.
   */
  gold?: M0cGold | null;

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

  /**
   * Optional canvas-background sidecar carried with the layout.
   *
   * # Storage shape
   *
   * The wire format is a single nullable string slot — `null` means the
   * file is opinion-free (consumer applies its default) and a non-null
   * value is one of a small set of documented forms:
   *
   * - **Embedded image (data URI):**
   *   `data:image/(png|jpeg|webp);base64,<base64-payload>`
   *   The same shape an `<img src="…">` understands directly. Use
   *   {@link encodeBackgroundImage} / {@link parseBackgroundImage} to
   *   round-trip the `{ mime, bytes, b64 }` triple cleanly.
   *
   * - **Solid color (CSS Level 4 hex):**
   *   `#rrggbb` (fully opaque) or `#rrggbbaa` (with alpha in the
   *   trailing two hex digits — alpha runs 0x00 → fully transparent,
   *   0xff → fully opaque). Use {@link encodeBackgroundColor} /
   *   {@link parseBackgroundColor} to round-trip the `{ hex, opacity }`
   *   pair with 0..1 alpha.
   *
   * - **Empty / "no opinion":** `null` or absent. The consumer falls
   *   back to its own default (typically a theme color).
   *
   * # Why a string instead of a discriminated object?
   *
   * Keeps the on-disk shape stable as we add more flavors later (e.g.
   * gradients, dictionary asset references). New consumers detect the
   * form by inspecting the leading character — `d` for `data:`, `#`
   * for hex — without needing a versioned schema migration.
   */
  derive: { background: string | null };

  /**
   * Per-frame clipping-mask shapes keyed by stableKey.
   *
   * Same indexing primitive as `labels` — both are per-frame data that need
   * to follow the structural identity of a frame through DSL edits. A split
   * derives child keys deterministically from the parent's key; an overlay
   * add inserts a fresh key without disturbing siblings. Masks survive these
   * transformations the same way labels do.
   *
   * Each value is an inline `M0cMaskEntry` (`{ localPath, bounds }`) — the
   * mask shape carried directly in the file, not a reference into a
   * dictionary or asset manifest. The engine wraps it as
   * `{ kind: "inline-mask", ...entry }` per `MosaicSourceMask` from
   * `@m0saic/types` at render time.
   *
   * Null entries explicitly mean "this frame has no mask" (vs. an absent key
   * which means "no opinion"). Most files only carry entries for frames that
   * are actually masked; absent = full-rect tile, no mask applied.
   *
   * Originating source: the SVG → Mosaic wizard's masks.json, baked
   * per-frame into the m0c so the file is self-contained.
   */
  masks: Record<StableKey, M0cMaskEntry | null> | null;

  /**
   * Per-frame rect-fill sidecar keyed by stableKey. Same indexing primitive
   * as `labels` and `masks` — structural identity that survives DSL edits.
   *
   * Each entry carries an optional `color` (hex string painted into the rect
   * when the inspector's Fill toggle is on) and an optional `mediaRef`
   * (reserved slot for future asset-based fills). At least one of the two
   * must be present per entry.
   *
   * Conceptually parallel to `labels[k].color` but semantically distinct:
   * - `labels[k].color` tints the label CHIP badge (UI affordance for the
   *   inspector overlay).
   * - `fill[k]` paints the rect itself (a layout-review concern).
   *
   * Most files only carry entries for frames the author / agent wants to
   * highlight; absent keys mean "no opinion, use the inspector's uniform
   * Rects color."
   */
  fill: Record<StableKey, M0cFill> | null;

  /**
   * Per-frame **inset** sidecar keyed by stableKey. Same indexing primitive
   * as `labels` / `masks` / `fill` — structural identity that survives DSL
   * edits (splits, overlay adds, repacks).
   *
   * Each entry is an {@link M0cInset} (`{ top, right, bottom, left }`, per-edge
   * fractions 0..1 of the frame's own cell) — the render-time box the frame's
   * source actually paints into. Promotes the engine-only
   * `MosaicSource.placement.inset` concept to a first-class, stableKey-keyed,
   * editor-visible field, at parity with `masks` / `fill` / `rankSets`.
   *
   * The engine applies the inset FIRST (before fit / padding / mask) and it
   * only ever SHRINKS the rect. Half-pixel-centered fractions recover exact
   * pixels at the authored canvas size (≤1px drift at other sizes) — this is
   * how m0saic carries quantization-hostile layout without losing precision
   * (`placeInsetRects`). See {@link M0cInset} for the full semantics.
   *
   * Most files only carry entries for frames that actually inset; absent keys
   * mean "no inset". All-zero entries (every edge 0) are dropped by the
   * normalizer / parser — an inset is meaningful only when an edge > 0.
   */
  insets: Record<StableKey, M0cInset> | null;

  /**
   * Named rank sets carried inline on the m0c, keyed by friendly set name
   * (`"diag"`, `"cascade"`, `"radial"`, `"hero"`, `"custom"`, …) at the
   * outer level and by `StableKey` at the inner per-frame level.
   *
   * Same indexing primitive as `labels` and `masks` — every kind of per-
   * frame data on m0c follows structural identity rather than positional
   * order, so it survives splits / overlays / repacks cleanly.
   *
   * A rank value is conventionally a sweep progress in `[0..1]`, but the
   * format doesn't enforce a range: any finite number round-trips. Inner
   * null entries explicitly mean "this frame has no rank in this set"
   * (e.g. a sweep that intentionally skips some tiles); absent inner keys
   * mean "no opinion" and let consumers default however they like.
   *
   * Outer null on a set (`rankSets["foo"] = null`) round-trips as an
   * explicit "this named set is intentionally empty"; absent outer key
   * means the set doesn't exist for this layout.
   *
   * Originating source: the SVG → Mosaic wizard's `*_ranks.json`
   * sidecars, baked into the m0c so the file is self-contained.
   */
  rankSets: Record<string, M0cRankSet | null> | null;

  /** Free-form JSON. Same semantics as `M0pFile.custom` — templates
   *  and tooling stash structured data here (brand tokens, source
   *  asset URLs, copy variants, comments, anything the consuming
   *  code knows how to read). The format treats it as opaque: any
   *  JSON value round-trips unchanged. */
  custom: unknown | null;
};

// ─────────────────────────────────────────────────────────────
// .m0v file format — Mosaic Vocabulary (shared brand language)
// ─────────────────────────────────────────────────────────────

/**
 * `.m0v` is a **Mosaic Vocabulary** file — a team-level bundle of
 * named values that templates resolve at render time. The "v" stands
 * for vocabulary: the brand's shared language (output presets,
 * palette, typography, asset paths, ...) authored once and consumed
 * by every render against that brand.
 *
 * # Additive by design
 *
 * Every first-class slot on the file is **optional**. A vocabulary
 * may carry outputs only, assets only, both, neither (and lean on
 * `custom`), or any combination. Adding a new slot (e.g. palette,
 * typography) does not invalidate existing files. This is the same
 * "ratchet forwards" pattern used elsewhere in the format family:
 * once a `custom` shape stabilizes across multiple real `.m0v`
 * files, promote it to a first-class field — old files keep
 * parsing because every new slot is optional.
 *
 * # Concrete slots today
 *
 * - `outputs` — map of named {@link MosaicOutput} entries. The
 *   User-tier default layer of the rendering-model contract; the
 *   CLI loads a `.m0v` (when supplied via `--m0v <path>` or
 *   discovered by convention) and the named outputs supply default
 *   size / fps / codec / target / metadata for the run. CLI flags
 *   override within the same tier, and the merged result becomes
 *   user intent. Templates never read `.m0v` directly; they see
 *   `ctx.userIntent` + `ctx.output`. See
 *   the rendering-model contract, rule 8
 *   and rule 12.
 * - `assets` — map of named {@link MosaicAsset} entries. Merged into
 *   a `.mosaicx` doc's effective `assets` manifest at resolve time
 *   via the doc's `vocab` import list. Templates resolve
 *   `propsSchema.type: "media"` props by treating the value as an
 *   asset id and looking it up in `ctx.media[id]`.
 * - `custom` — free-form escape hatch for shapes not yet promoted
 *   (palette, typography, cue points, voice/tone keys, ...).
 *
 * # Future: broader vocabulary
 *
 * Brand palette (named `MosaicColor`s), typography (font stacks),
 * cue points, voice / tone keys — anything a team shares across
 * templates naturally lives in their vocabulary file. For now those
 * values ride in `custom`; once a shape stabilizes across multiple
 * real `.m0v` files we promote it to a first-class slot.
 *
 * Example use:
 *
 *   `brand.m0v` defines `outputs.desktop`, `outputs.mobile`,
 *   `outputs.alpha-master` — each entry is a {@link MosaicOutput}
 *   (size, fps, target, format, audio, color, container, metadata).
 *   It also declares `assets.companyLogo`, `assets.themeMusic` for
 *   templates to pull through `ctx.media`, and may stash
 *   `custom.palette = { primary: "#EF7525", ... }` for shapes not
 *   yet first-class.
 *
 * # Type-light by design
 *
 * Each first-class map is `Record<string, unknown>` at the format
 * layer. The file-format package validates only the envelope
 * (`format`, `version`, the standard header fields, and that any
 * provided maps are non-null objects). **Semantic validation** —
 * each entry conforms to `MosaicOutput` / `MosaicAsset`,
 * container/codec compatibility, asset-key slug shape, etc. —
 * happens at the `@m0saic/platform` loader.
 *
 * Same pattern as `M0cFile.custom`: the format guarantees the
 * envelope, the application guarantees the payload semantics. Keeps
 * `@m0saic/dsl-file-formats` from taking a hard dep on
 * `@m0saic/types` for the engine-y knobs.
 */
export type M0vFile = {
  format: "m0v";
  /** Literal 1. A new file format version requires a major package version bump. */
  version: 1;
  /** UTC ISO 8601 with milliseconds and trailing Z. See {@link M0File.created}. */
  created: string;
  app: string | null;
  appVersion: string | null;
  meta: M0FileMeta | null;
  /** Agent ↔ human annotations (`m0agent:*` block on .m0; same shape stashed on .m0c / .m0p / .m0v JSON). `null` when no annotations were carried. */
  agent?: M0AgentMeta | null;
  /**
   * Brand-shared output map. Keys are friendly slugs (e.g. `"desktop"`,
   * `"mobile"`, `"alpha-master"`) — the file-format layer does not
   * validate key shape; the platform loader does.
   *
   * Each value should conform to `MosaicOutput` from `@m0saic/types`
   * — but the format layer treats entries as opaque JSON. The
   * platform loader validates them.
   *
   * Omitted (rather than empty object) when the vocab carries no
   * output presets. A vocab with assets only is a valid file.
   */
  outputs?: Record<string, unknown>;
  /**
   * Brand-shared asset map. Keys are friendly asset ids (slugs:
   * `^[a-z0-9][a-z0-9_-]*$` by platform convention) and values
   * should conform to `MosaicAsset` from `@m0saic/types` (typically
   * `{ kind: "file", path, mediaType }` for shared media bundles).
   *
   * Templates resolve a `propsSchema.type: "media"` prop by treating
   * the value as an asset id and looking it up in `ctx.media[id]`.
   * Vocabularies declared here are merged into a `.mosaicx`'s
   * effective `doc.assets` at resolve time via the doc's `vocab`
   * import list — `MosaicXDocument.vocab: string[]` enumerates the
   * `.m0v` files to load. Doc-local assets override vocab assets on
   * key collision (most-specific layer wins).
   *
   * Treated as opaque JSON at the format layer — same convention as
   * `outputs`. The platform loader validates each entry against the
   * `MosaicAsset` shape.
   *
   * Omitted (rather than empty object) when the vocab carries no
   * assets, to match how an `outputs`-only `.m0v` looks today.
   */
  assets?: Record<string, unknown>;
  /**
   * Free-form JSON escape hatch for vocabulary fields not yet
   * promoted to first-class slots — brand palette, typography, cue
   * points, etc. Same semantics as `M0cFile.custom`: round-trips
   * unchanged, no schema enforcement. Promote popular shapes to
   * top-level fields once they stabilize.
   *
   * Note: shared **asset paths** previously rode here; they now have
   * a first-class `assets` field above. Reading custom.assets is no
   * longer how the platform discovers shared media.
   */
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
  /** Agent ↔ human annotations (`m0agent:*` block on .m0; same shape stashed on .m0c / .m0p / .m0v JSON). `null` when no annotations were carried. */
  agent?: M0AgentMeta | null;

  /** Canvas this variant was designed for. Required — variants without size
   *  are nonsensical (the whole point is multi-canvas). */
  size: { width: number; height: number };

  /** Canonical m0 layout string for this variant. */
  m0: string;

  /** StableKey-keyed label map. Same shape as M0cFile.labels. */
  labels: Record<StableKey, M0Label> | null;

  /** Optional thumbnail for this variant. Same shape as M0cFile.derive. */
  /**
   * Optional canvas-background sidecar carried with the layout.
   *
   * # Storage shape
   *
   * The wire format is a single nullable string slot — `null` means the
   * file is opinion-free (consumer applies its default) and a non-null
   * value is one of a small set of documented forms:
   *
   * - **Embedded image (data URI):**
   *   `data:image/(png|jpeg|webp);base64,<base64-payload>`
   *   The same shape an `<img src="…">` understands directly. Use
   *   {@link encodeBackgroundImage} / {@link parseBackgroundImage} to
   *   round-trip the `{ mime, bytes, b64 }` triple cleanly.
   *
   * - **Solid color (CSS Level 4 hex):**
   *   `#rrggbb` (fully opaque) or `#rrggbbaa` (with alpha in the
   *   trailing two hex digits — alpha runs 0x00 → fully transparent,
   *   0xff → fully opaque). Use {@link encodeBackgroundColor} /
   *   {@link parseBackgroundColor} to round-trip the `{ hex, opacity }`
   *   pair with 0..1 alpha.
   *
   * - **Empty / "no opinion":** `null` or absent. The consumer falls
   *   back to its own default (typically a theme color).
   *
   * # Why a string instead of a discriminated object?
   *
   * Keeps the on-disk shape stable as we add more flavors later (e.g.
   * gradients, dictionary asset references). New consumers detect the
   * form by inspecting the leading character — `d` for `data:`, `#`
   * for hex — without needing a versioned schema migration.
   */
  derive: { background: string | null };

  /** Per-frame inline masks keyed by stableKey. Same shape as M0cFile.masks. */
  masks: Record<StableKey, M0cMaskEntry | null> | null;

  /** Per-frame rect-fill sidecar keyed by stableKey. Same shape as M0cFile.fill. */
  fill: Record<StableKey, M0cFill> | null;

  /** Per-frame inset sidecar keyed by stableKey. Same shape as M0cFile.insets —
   *  per-edge fractions (0..1) of each frame's cell, the render-time box its
   *  source paints into. */
  insets: Record<StableKey, M0cInset> | null;

  /** Named rank sets keyed by set name then by stableKey. Same shape as
   *  M0cFile.rankSets. Variants in the same pack typically carry their
   *  own per-canvas rank sweeps — the diagonal that looks right on
   *  desktop is not the same set of indices that looks right on mobile. */
  rankSets: Record<string, M0cRankSet | null> | null;

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
  /** Agent ↔ human annotations (`m0agent:*` block on .m0; same shape stashed on .m0c / .m0p / .m0v JSON). `null` when no annotations were carried. */
  agent?: M0AgentMeta | null;
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
