/**
 * ============================================================================
 * Agent annotation layer — the on-disk shapes, owned by the file formats
 * ============================================================================
 *
 * An AI agent (or a human answering one) can carry an annotation block
 * alongside an m0saic artifact — `.m0` layouts, `.m0c` records, `.m0p`
 * packs. This module is the wire contract for that block: the shapes the
 * parsers emit and the serializers accept, plus the three pure helpers the
 * transports need (id minting, prose collapse / normalization, context
 * narrowing).
 *
 * It is deliberately vocabulary-free. The typed work-session vocabulary
 * (session refs, categories, evaluations, grades) lives in
 * `@m0saic/momo-types`, which DEPENDS ON this package and narrows the
 * loose `CandidateContext` below into its typed form. The file formats
 * never import the agent protocol — the language repo stays free of it.
 *
 * Two audiences in one struct:
 *
 * - `note` / `question` are HUMAN prose — what the writing side wants the
 *   reviewing human to look at or answer.
 * - `regions` / `context` are STRUCTURED data for a downstream agent —
 *   labeled layout nodes (by stableKey) and a JSON payload the agent can
 *   route on without re-deriving intent from prose.
 *
 * ## Transport
 *
 * - On `.m0` (line-based): emitted as `# m0agent:<key>: <value>` header
 *   lines by `serializeM0File`; extracted back by `parseM0File`. Prose
 *   collapses to one line; objects become single-line `JSON.stringify`.
 * - On `.m0c` / `.m0p` (JSON-based): stashed as an ordered JSON object on
 *   the file / variant record's `agent` slot. Richer structure tolerated.
 * - Conversion (`downgradeM0cToM0`, etc.): the struct is structurally
 *   identical across formats, so conversions round-trip without loss.
 * ============================================================================
 */

/**
 * Recognized top-level field names on {@link CandidateContext}. Used by
 * {@link normalizeCandidateContext} to decide what stays in its typed slot
 * vs. routes into `extras`. `@m0saic/momo-types` keeps its typed
 * `CandidateContext` in lockstep with this list — adding a field there
 * means adding its name here.
 */
const CANDIDATE_CONTEXT_KEYS = new Set<string>([
  "session",
  "candidate",
  "phase",
  "category",
  "intent",
  "layoutIntent",
  "regionAnnotations",
  "evaluation",
  "relation",
  "extras",
]);

/**
 * Structured payload for the next agent in the chain, as the file formats
 * see it: the recognized slot NAMES are fixed here, the slot VALUES are
 * opaque. `@m0saic/momo-types` exports the typed refinement (every slot
 * narrowed to its protocol type); that refinement is assignable to this
 * shape, so a typed context can always be handed to a serializer.
 */
export type CandidateContext = {
  /** Which session this candidate belongs to. */
  session?: unknown;
  /** Where in the iteration sequence this candidate sits. */
  candidate?: unknown;
  /** Explicit phase override. */
  phase?: unknown;
  /** What class of layout problem the session is solving. */
  category?: unknown;
  /** What the writing party is trying to accomplish on THIS candidate. */
  intent?: unknown;
  /** Structural kind of THIS candidate's geometry. */
  layoutIntent?: unknown;
  /** Richer per-region annotations, keyed by stableKey. */
  regionAnnotations?: Record<string, unknown>;
  /** Evaluation of THIS candidate. */
  evaluation?: unknown;
  /** Lineage to a previous candidate. */
  relation?: unknown;
  /**
   * Free-form escape hatch — anything not yet first-class. Also where the
   * normalizer parks JSON found in `context` that doesn't conform to the
   * other fields, so old files round-trip without loss.
   */
  extras?: Record<string, unknown>;
};

/**
 * Shallow-narrow an arbitrary value into a {@link CandidateContext}.
 *
 * - Non-object / null / array inputs → wrapped into `extras: { raw }` so
 *   the value survives a round-trip but doesn't masquerade as typed
 *   context. (`null` collapses to `undefined` instead — same as an empty
 *   value being absent.)
 * - Object inputs → recognized field names land in their slot verbatim
 *   (no inner-shape validation); unrecognized fields route into `extras`.
 * - Existing `extras` on the input merges with any newly-routed fields.
 * - Returns `undefined` when nothing survived (so the caller can omit
 *   `context` entirely rather than write `{}`).
 */
export function normalizeCandidateContext(
  raw: unknown,
): CandidateContext | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { extras: { raw } };
  }
  const input = raw as Record<string, unknown>;
  const out: CandidateContext = {};
  const extras: Record<string, unknown> = {};
  let hasExtras = false;
  let hasTyped = false;
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (k === "extras") {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        for (const [ek, ev] of Object.entries(v as Record<string, unknown>)) {
          if (ev !== undefined) {
            extras[ek] = ev;
            hasExtras = true;
          }
        }
      }
      continue;
    }
    if (CANDIDATE_CONTEXT_KEYS.has(k)) {
      (out as Record<string, unknown>)[k] = v;
      hasTyped = true;
    } else {
      extras[k] = v;
      hasExtras = true;
    }
  }
  if (hasExtras) out.extras = extras;
  return hasTyped || hasExtras ? out : undefined;
}

/** Annotation block — prose for the human, JSON for the next agent. */
export type M0AgentMeta = {
  /**
   * Optional stable identifier for the OP itself — a short hash that lets
   * other files, comments, or external systems link directly to this
   * post. Mosaic renders comments as URL-hash anchors (`#c-<id>`), so a
   * post id lets you deep-link the file's own discussion thread. Absent
   * by default; the writing party (or the UI on first comment) mints one
   * when cross-references become useful.
   */
  id?: string;
  /** Free-form prose for the human reviewer ("look at the spacing…"). */
  note?: string;
  /** Specific yes/no question the writing side wants answered. */
  question?: string;
  /**
   * Labels for layout regions, keyed by stableKey (the same identity
   * scheme `.m0c` uses for labels / masks / rank sets) where possible.
   * Values are short human-readable names (`"title-band"`, `"plot"`,
   * etc.). stableKey survives structural edits, so the annotation still
   * points at the right node after the human edits the layout and
   * bounces it back. Free-form keys are tolerated but won't survive
   * geometry edits.
   */
  regions?: Record<string, string>;
  /**
   * Structured payload for the next agent in the chain. The runtime
   * normalizer is permissive (route non-conforming JSON into `extras` so
   * old files keep round-tripping). See {@link CandidateContext}.
   */
  context?: CandidateContext;
  /**
   * The responding party's canonical reply — the "selected answer" that
   * downstream agents route on. Written back into the same file by the
   * reading party (see {@link M0AgentResponse} for party-agnostic notes).
   *
   * **Mental model — threaded post.** Each file is one post:
   *
   *   - `note` / `question` / `regions` / `context` — the OP's body
   *   - `response`                                   — the answer
   *   - `comments[]`                                 — the thread below
   *
   * The OP + response together form the canonical record of one design
   * exchange. {@link M0AgentMeta.comments} is the orbiting discussion:
   * anyone can add a comment, but the response slot stays structurally
   * separate so future agents have a single clear thing to read.
   * Iterating the geometry produces a NEW file (a new post), not a new
   * response on this one — the corpus of files is the conversation.
   */
  response?: M0AgentResponse;
  /**
   * Open comment thread orbiting the OP. Append-only by convention —
   * anyone (human, agent) can add a comment to share context, raise a
   * concern, link to a related candidate, or document a side observation
   * that doesn't merit a new file.
   *
   * Comments are **non-canonical**: they don't replace or override
   * {@link M0AgentMeta.response}. Future agents reading the file route on
   * the response slot; comments are for human review and provenance.
   *
   * Flat array (no nested replies). Order is chronological by `at` when
   * present; absent timestamps stay in insertion order.
   */
  comments?: M0AgentComment[];
};

/**
 * Structured response back to the writing side.
 *
 * The original use case is human-replies-to-agent (an agent emits an
 * ask, the human answers in File Details), but the response field is
 * **party-agnostic on purpose**: an entity speaking back can be another
 * agent — a brand-trained stylist, a design-review pass, an oncall
 * data-viz reviewer. Anything that can read the writing-side fields and
 * emit an opinion qualifies.
 *
 * `from` is the discriminator. Suggested values:
 *
 *   - `"human"` — generic human reviewer
 *   - `"human:<name>"` — named human
 *   - `"agent:claude"` — agent identified by model / runtime
 *   - `"agent:brand-x-stylist"` — agent identified by role
 *
 * Tooling routes on the prefix (`human` vs. `agent`); the suffix is for
 * provenance and the pattern-bank corpus that builds up over time.
 */
export type M0AgentResponse = {
  /** Free-form prose body. */
  body: string;
  /** Party identifier. Default `"human"` when absent. */
  from?: string;
  /** UTC ISO 8601 timestamp of when the response was saved. */
  at?: string;
  /**
   * Provenance pointer to the rendered output this response judges —
   * typically the time-stamped sibling file the Run view just wrote
   * (`candidate-005.20260612-084403.mp4`). A `.mosaicx` is a recipe
   * whose pixels drift as the template source evolves; the response +
   * its `src` pin WHICH render the verdict was about.
   */
  src?: string;
  /**
   * Companion pointer to the fully RESOLVED `.mosaic` saved beside the
   * render (same basename) — the TRUE source of those exact pixels:
   * pure geometry + primitives, frozen at render time, immune to
   * template-source drift. Written when the renderer emitted the
   * sidecar.
   */
  srcMosaic?: string;
  /**
   * Optional screenshot attachments — base64 data-URIs
   * (`data:image/png;base64,…`). The reviewer's "I rendered, saw
   * something, screenshotted it" evidence, stored in the file itself
   * for self-contained provenance. Rich at the cost of file size; keep
   * crops small.
   */
  images?: string[];
};

/**
 * One entry in the OP-orbit comment thread (see
 * {@link M0AgentMeta.comments}). Structurally identical to
 * {@link M0AgentResponse}'s prose + provenance core on purpose — just
 * understood by the type system to be non-canonical commentary rather
 * than the selected answer.
 */
export type M0AgentComment = {
  /**
   * Stable identifier for direct linking. Short random hash minted at
   * post time (see {@link mintAgentId}). Mosaic renders each comment as
   * a `#c-<id>` URL-hash anchor so deep-links work natively; cross-file
   * references use the same id.
   *
   * Optional in the type to tolerate older files written before IDs
   * existed; new comments always get one minted.
   */
  id?: string;
  /** Free-form prose body. */
  body: string;
  /** Party identifier. Default `"human"` when absent. Same convention
   *  as {@link M0AgentResponse.from}. */
  from?: string;
  /** UTC ISO 8601 timestamp of when the comment was added. */
  at?: string;
};

/**
 * Mint a short stable identifier for the OP or a comment. Eight-character
 * hex / base36, collision-free for any realistic corpus of files and
 * threads. Uses `crypto.randomUUID()` when available, falls back to
 * `Math.random()` for environments without crypto.
 *
 * Convention: the same id is used wherever the comment surfaces — file
 * format, URL hash (`#c-<id>`), copy-link clipboard payload.
 */
export function mintAgentId(): string {
  const cryptoApi: { randomUUID?: () => string } | undefined =
    typeof globalThis !== "undefined" ? (globalThis as { crypto?: { randomUUID?: () => string } }).crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    // randomUUID is 32 hex chars after stripping dashes. Take 8 chars
    // (base16) — keyspace is 16^8 ≈ 4.3B, plenty for a single file.
    return cryptoApi.randomUUID().replace(/-/g, "").slice(0, 8);
  }
  // Fallback: Math.random in base36, two slices to fill the 8-char width.
  return (
    Math.random().toString(36).slice(2, 6) +
    Math.random().toString(36).slice(2, 6)
  );
}

/**
 * Collapse a prose value to a single line. Used by the line-based `.m0`
 * transport (where embedded newlines would split the value across
 * unrelated header lines); the same collapse is safe to apply on the
 * JSON transports for consistency.
 */
export function collapseAgentProse(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Normalize a prose value while PRESERVING line structure — the JSON
 * transports (`.m0c` / `.m0p`) can hold newlines, and the agent prose is
 * rendered as markdown, so lists / code blocks / tables / paragraphs must
 * survive serialization. Normalizes CRLF→LF, strips trailing whitespace on
 * each line, caps blank runs at a single blank line, and trims the ends.
 * Use this on the JSON path; use {@link collapseAgentProse} for the
 * line-based `.m0` transport where embedded newlines are not representable.
 */
export function normalizeAgentProse(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
