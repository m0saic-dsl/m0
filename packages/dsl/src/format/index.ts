export { toCanonicalM0String, toPrettyM0String } from "./m0StringFormat";
export { toCompactM0String, fromCompactM0String } from "./m0StringCompact";
// MAX_COMPACT_EXPANSION is the compact codec's own allocation bound (imported
// directly from "./m0StringCompact" by its tests), not part of the public API.
