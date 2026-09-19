/**
 * Barcode library — 1D scannable code support for the m0 DSL.
 *
 * Public surface:
 *   - Format dispatch: `barcodeToBars`, `barcodeToRects`, `barcodeToM0`,
 *     `barcodeToM0c`.
 *   - Per-format encoders: `code128Encode`, `ean13Encode`, `upcaEncode`.
 *   - Shared EAN/UPC helpers: `computeEan13CheckDigit`,
 *     `verifyEan13CheckDigit`.
 *   - Channel surface: `regionsForChannel`, `STRUCTURAL_CHANNEL_ORDER`.
 *
 * See `libraries/qr/` for the canonical convention this folder mirrors.
 */

export * from "./types";
export {
  autoPickCodeSet,
  CODE128_START,
  CODE128_STOP,
  code128Encode,
  type Code128EncodeOptions,
  type Code128Encoded,
  type Code128Set,
} from "./code128";
export {
  barcodeToBars,
  type BarcodeToBarsOptions,
} from "./barcodeToBars";
export {
  barcodeToRects,
  type BarcodeToRectsOptions,
} from "./barcodeToRects";
export {
  CODE128_GUARD_WIDTHS,
  regionsForChannel,
  STRUCTURAL_CHANNEL_ORDER,
  verifyGuardAlignment,
  type ChannelContext,
  type LabeledRegion,
  type StructuralChannel,
} from "./barcodeChannels";
export {
  ean13Encode,
  type Ean13Encoded,
} from "./ean13";
export {
  upcaEncode,
  type UpcaEncoded,
} from "./upca";
export {
  computeEan13CheckDigit,
  verifyEan13CheckDigit,
  EAN_INNER_MODULES,
} from "./eanShared";
export { barcodeToM0 } from "./barcodeToM0";
export {
  barcodeToM0c,
  type BarcodeToM0cOptions,
  type BarcodeToM0cResult,
} from "./barcodeToM0c";
