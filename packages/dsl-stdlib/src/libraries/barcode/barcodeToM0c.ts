/**
 * Text → labeled `.m0c` file string (the canonical m0+context format).
 *
 * Thin wrapper over `barcodeToM0` + `serializeM0cFile` from
 * `@m0saic/dsl-file-formats`. Every enabled overlay-channel frame ends up
 * labeled with its stable-key catalog entry (`barcode-bar-{i}`,
 * `barcode-quiet-zone-left`, `barcode-start-guard`, `barcode-stop-guard`,
 * `barcode-human-readable`), so dropping the file into the Layout editor
 * surfaces a navigable, labeled rectangle tree.
 *
 * Pairs with `barcodeToM0` (full struct) and `barcodeToBars` (raw bar
 * pattern).
 *
 * Mirrors `qr/qrToM0c.ts` exactly.
 *
 * @example
 *   // Template author: build, render to m0c, drag into Layout to inspect.
 *   const { m0c } = barcodeToM0c("M0SAIC", { humanReadable: { mode: "carve" } });
 *   writeFileSync("debug.m0c", m0c);
 */

import { serializeM0cFile } from "@m0saic/dsl-file-formats";
import type { M0Label } from "@m0saic/dsl-file-formats";
import { barcodeToM0 } from "./barcodeToM0";
import type { BarcodeToM0Options, BarcodeToM0Result } from "./types";

export type BarcodeToM0cOptions = BarcodeToM0Options & {
  /** Serialization metadata forwarded to the m0c file. */
  m0c?: {
    /** `app` field — identifies the generator. Default "barcodeToM0c". */
    app?: string;
    /** `appVersion` field. Default undefined. */
    appVersion?: string;
    /** Optional title for the m0c meta block. */
    title?: string;
    /** Optional author. */
    author?: string;
    /** Optional source (auto-set to the input text when omitted). */
    source?: string;
    /** Optional free-form note. */
    note?: string;
  };
};

export type BarcodeToM0cResult = BarcodeToM0Result & {
  /** Serialized `.m0c` JSON file contents (with trailing newline). */
  m0c: string;
};

export function barcodeToM0c(
  text: string,
  opts: BarcodeToM0cOptions = {},
): BarcodeToM0cResult {
  const { m0c: m0cMeta, ...barcodeOpts } = opts;
  const result = barcodeToM0(text, barcodeOpts);

  // Convert the labels map to the M0Label record shape expected by
  // serializeM0cFile (text + optional color).
  const labelsForM0c: Record<string, M0Label> = {};
  for (const [stableKey, labelText] of Object.entries(result.labels)) {
    labelsForM0c[stableKey] = { text: labelText };
  }

  const m0c = serializeM0cFile({
    m0: String(result.m0),
    size: { width: result.canvasW, height: result.canvasH },
    app: m0cMeta?.app ?? "barcodeToM0c",
    appVersion: m0cMeta?.appVersion,
    meta: {
      title: m0cMeta?.title,
      author: m0cMeta?.author,
      source: m0cMeta?.source ?? text,
      note: m0cMeta?.note,
    },
    labels: labelsForM0c,
  });

  return { ...result, m0c };
}
