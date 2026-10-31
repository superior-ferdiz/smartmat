/*
 * Receipt OCR (spec 08, ADR-0011). The worker only reads text from an image through this interface, so the tests
 * use a fake one and the app keeps working without OCR (NFR-REL-002). The image never leaves the server.
 */

/** One line of text as the engine read it, top to bottom. `confidence` is the mean word confidence, 0–100. */
export interface OcrLine {
  text: string;
  confidence: number;
}

export interface OcrText {
  lines: OcrLine[];
  /** Mean word confidence over the whole image, 0–100. */
  meanConfidence: number;
  /** Engine and model, stored with the extraction (for example "tesseract nor psm6 deskew"). */
  engine: string;
  /** How far the image was turned clockwise before it was read. */
  rotation: 0 | 90 | 180 | 270;
}

export const OCR_FAILURES = ['timeout', 'unavailable', 'invalidResponse', 'noText'] as const;
export type OcrFailure = (typeof OCR_FAILURES)[number];

export type OcrResult = { ok: true; text: OcrText } | { ok: false; failure: OcrFailure };

export interface OcrProvider {
  /** `image` is the stored JPEG (already rewritten without metadata, spec 08 FR-RCPT-002). */
  recognize(image: Buffer): Promise<OcrResult>;
}

/** Used when no OCR is set up (`OCR_PROVIDER=off`): every receipt fails with "unavailable". */
export const disabledOcrProvider: OcrProvider = {
  recognize: () => Promise.resolve({ ok: false, failure: 'unavailable' }),
};
