import type {
  M0cDeriveImage,
  M0cDeriveImageMime,
  M0cDeriveColor,
} from "./types";

/**
 * Helpers for the `M0cFile.derive.background` string payload — see the
 * JSDoc on `M0cFile.derive` in `types.ts` for the full list of known
 * forms. This module centralises the encode / parse / detect logic so
 * consumers don't have to read prefixes by hand.
 */

const DATA_URI_RE = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/;
const COLOR_HEX6_RE = /^#([0-9a-fA-F]{6})$/;
const COLOR_HEX8_RE = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/;

/** Construct the canonical `data:<mime>;base64,<b64>` payload for the
 *  image variant. Returns null when the caller passes null (lets the
 *  parser/serializer thread image-or-nothing without a branch). */
export function encodeBackgroundImage(
  img: M0cDeriveImage | null | undefined,
): string | null {
  if (!img) return null;
  return `data:${img.mime};base64,${img.b64}`;
}

/** Construct a CSS Level 4 hex string (`#rrggbb` when fully opaque,
 *  `#rrggbbaa` otherwise) from the in-memory color payload. Opacity is
 *  clamped to `[0, 1]`. Returns null for nullish input. */
export function encodeBackgroundColor(
  color: M0cDeriveColor | null | undefined,
): string | null {
  if (!color) return null;
  const hex = normalizeHex6(color.hex);
  if (!hex) return null;
  const clamped = Math.max(0, Math.min(1, color.opacity));
  if (clamped >= 1) return hex;
  const aa = Math.round(clamped * 255).toString(16).padStart(2, "0").toLowerCase();
  return `${hex}${aa}`;
}

/** Reverse of {@link encodeBackgroundImage}. Returns `null` for any
 *  payload that doesn't match the documented data-URI form (including
 *  `null` / empty / a color hex), so callers can chain on
 *  `parseBackgroundImage(bg) ?? parseBackgroundColor(bg)` without
 *  intermediate type guards. */
export function parseBackgroundImage(
  bg: string | null | undefined,
): M0cDeriveImage | null {
  if (!bg) return null;
  const match = DATA_URI_RE.exec(bg);
  if (!match) return null;
  const mime = (match[1] === "image/jpg" ? "image/jpeg" : match[1]) as M0cDeriveImageMime;
  const b64 = match[2];
  // Approximate decoded byte count — base64 carries 4 chars per 3
  // bytes, with `=` padding shaving 1 byte each. Sufficient for size
  // reporting in the UI; consumers needing exact bytes should decode.
  const padding = (b64.match(/=+$/)?.[0]?.length ?? 0);
  const bytes = Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
  return { mime, bytes, b64 };
}

/** Reverse of {@link encodeBackgroundColor}. Returns `null` when the
 *  payload isn't a `#rrggbb` or `#rrggbbaa` color. */
export function parseBackgroundColor(
  bg: string | null | undefined,
): M0cDeriveColor | null {
  if (!bg) return null;
  const m8 = COLOR_HEX8_RE.exec(bg);
  if (m8) {
    return {
      hex: `#${m8[1].toLowerCase()}`,
      opacity: parseInt(m8[2], 16) / 255,
    };
  }
  const m6 = COLOR_HEX6_RE.exec(bg);
  if (m6) {
    return { hex: `#${m6[1].toLowerCase()}`, opacity: 1 };
  }
  return null;
}

/** True when the payload encodes an embedded image (a `data:image/...`
 *  URI). False for color hex, null, and any unrecognised string. */
export function isImageBackground(bg: string | null | undefined): boolean {
  return typeof bg === "string" && DATA_URI_RE.test(bg);
}

/** True when the payload encodes a solid color (6- or 8-digit hex).
 *  False for data URIs, null, and any unrecognised string. */
export function isColorBackground(bg: string | null | undefined): boolean {
  return typeof bg === "string" && (COLOR_HEX6_RE.test(bg) || COLOR_HEX8_RE.test(bg));
}

/** Lower-case + 3-digit-expand a hex string to the canonical 6-digit
 *  form. Returns null when the input doesn't parse as a hex color. */
function normalizeHex6(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const m6 = /^#?([0-9a-fA-F]{6})$/.exec(trimmed);
  if (m6) return `#${m6[1].toLowerCase()}`;
  const m3 = /^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
  if (m3) return `#${(m3[1] + m3[1] + m3[2] + m3[2] + m3[3] + m3[3]).toLowerCase()}`;
  return null;
}
