import type { ParsedReceiptLineResponse, ReceiptSuggestion } from '@smartmat/shared';
import { emptyLine, oreToInput, type PurchaseFormValues } from '../purchases/purchaseForm';

/*
 * From what the receipt reader suggested to the purchase form (spec 08 FR-RCPT-005). Everything stays editable:
 * the form is the ordinary purchase form, and the server checks it by the same rules.
 */

export interface ReceiptFormStart {
  values: PurchaseFormValues;
  /** The parsed line behind each form line (by the form line's key), for the "check this" notes. */
  parsedByKey: Map<string, ParsedReceiptLineResponse>;
  /** The date could not be read: the form starts with today's date, and the page says so. */
  dateGuessed: boolean;
}

export function fromSuggestion(
  suggestion: ReceiptSuggestion,
  today: string,
  locationId = '',
): ReceiptFormStart {
  const parsedByKey = new Map<string, ParsedReceiptLineResponse>();
  const base = {
    storeName: suggestion.storeName ?? '',
    purchasedOn: suggestion.purchasedOn ?? today,
  };
  const dateGuessed = suggestion.purchasedOn === null;

  // ADR-0017: by default only store, date and total. The lines only when the server shows them.
  if (!suggestion.linesShown || suggestion.lines.length === 0) {
    return {
      values: {
        ...base,
        mode: 'total',
        total: suggestion.totalOre === null ? '' : oreToInput(suggestion.totalOre),
        lines: [emptyLine(locationId)],
      },
      parsedByKey,
      dateGuessed,
    };
  }

  const lines = suggestion.lines.map((parsed) => {
    const line = {
      ...emptyLine(locationId),
      description: parsed.description,
      kind: parsed.suggestedKind,
      amount: parsed.amountOre === null ? '' : oreToInput(parsed.amountOre),
    };
    // A weight or a count on the receipt fills in the quantity if the line goes into the inventory.
    if (parsed.weightG)
      Object.assign(line, { unit: 'g', displayUnit: 'g', quantity: String(parsed.weightG) });
    else if (parsed.count)
      Object.assign(line, { unit: 'stk', displayUnit: 'stk', quantity: String(parsed.count) });
    parsedByKey.set(line.key, parsed);
    return line;
  });
  return { values: { ...base, mode: 'lines', total: '', lines }, parsedByKey, dateGuessed };
}

/** Why a line is marked "check this" (spec 08); the page turns each flag into a sentence. */
export function lineFlags(parsed: ParsedReceiptLineResponse | undefined) {
  return parsed?.flags ?? [];
}

/** Below this the whole reading is shown as "low confidence" (spec 08). */
export const LOW_MEAN_CONFIDENCE = 60;

export const SHRINK_MAX_SIDE = 3000;

/**
 * Makes the photo smaller in the browser before it is sent, when the browser can: less to upload on a phone, and
 * drawing it on a canvas leaves the camera's EXIF (with the position) behind. The server removes it anyway
 * (FR-RCPT-002); this is only an extra. Returns the original file when anything is missing or fails.
 */
export async function shrinkImage(file: File, maxSide = SHRINK_MAX_SIDE): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
