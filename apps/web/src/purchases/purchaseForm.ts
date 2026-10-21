import {
  createPurchaseSchema,
  DISPLAY_UNITS_FOR,
  isoDateSchema,
  parseOre,
  parseQuantity,
  sumOre,
  type BaseUnit,
  type CategoryKey,
  type DisplayUnit,
  type ExpiryKind,
  type PurchaseLineInput,
  type PurchaseLineKind,
  type PurchaseResponse,
} from '@smartmat/shared';
import { fieldErrorsFromZod, type FieldErrors } from '../forms/fieldErrors';

/*
 * The purchase form (FR-BUD-001/002/005) while the user types: everything is text until it is sent.
 * Parsing uses the shared parsers and the shared schema, so the browser refuses exactly what the server
 * would refuse, and the error keys are the API's field names ("lines.0.amountOre"), so server errors land
 * on the right field too.
 */

export interface LineFormValues {
  /** React key; stays the same while lines are added and removed. */
  key: string;
  /** Set for a line that already exists (when correcting). */
  id?: string;
  description: string;
  kind: PurchaseLineKind;
  categoryKey: CategoryKey | '';
  amount: string;
  /** The item this line already put into the inventory (when correcting), or null. */
  linkedItemName: string | null;
  toInventory: boolean;
  /** '' = a new item named after the line. */
  itemId: string;
  /** For a new item. */
  unit: BaseUnit;
  quantity: string;
  displayUnit: DisplayUnit;
  locationId: string;
  expiryKind: ExpiryKind | '';
  expiryDate: string;
}

export const PURCHASE_MODES = ['lines', 'total'] as const;
export type PurchaseMode = (typeof PURCHASE_MODES)[number];

export interface PurchaseFormValues {
  storeName: string;
  purchasedOn: string;
  mode: PurchaseMode;
  total: string;
  lines: LineFormValues[];
}

/** What the form sends; the pages add clientRequestId (new) or removeUntouchedBatches (correcting). */
export interface PurchaseBody {
  storeName: string | null;
  purchasedOn: string;
  totalOre?: number;
  lines: PurchaseLineInput[];
}

let keyCounter = 0;
const newKey = () => `line-${++keyCounter}`;

export function emptyLine(locationId = ''): LineFormValues {
  return {
    key: newKey(),
    description: '',
    kind: 'food',
    categoryKey: '',
    amount: '',
    linkedItemName: null,
    toInventory: false,
    itemId: '',
    unit: 'stk',
    quantity: '',
    displayUnit: 'stk',
    locationId,
    expiryKind: '',
    expiryDate: '',
  };
}

export function emptyPurchase(today: string): PurchaseFormValues {
  return { storeName: '', purchasedOn: today, mode: 'lines', total: '', lines: [emptyLine()] };
}

/** 2490 → "24,90" for an input field (no "kr", no thousands separator). */
export function oreToInput(ore: number): string {
  const rest = ore % 100;
  return `${(ore - rest) / 100},${String(rest).padStart(2, '0')}`;
}

/** A saved purchase as form values, for correcting it. */
export function fromPurchase(purchase: PurchaseResponse): PurchaseFormValues {
  return {
    storeName: purchase.storeName ?? '',
    purchasedOn: purchase.purchasedOn,
    mode: purchase.lines.length > 0 ? 'lines' : 'total',
    total: purchase.lines.length > 0 ? '' : oreToInput(purchase.totalOre),
    lines: purchase.lines.map((line) => ({
      ...emptyLine(),
      id: line.id,
      description: line.description,
      kind: line.kind,
      categoryKey: line.categoryKey ?? '',
      amount: oreToInput(line.amountOre),
      linkedItemName: line.batch?.itemName ?? null,
    })),
  };
}

/** The running sum shown under the lines: only amounts that can be read; `complete` if all could. */
export function runningTotal(lines: readonly LineFormValues[]): {
  ore: number;
  complete: boolean;
} {
  const amounts = lines.map((line) => parseOre(line.amount));
  const valid = amounts.flatMap((a) => (a.ok && a.value >= 0 ? [a.value] : []));
  try {
    return { ore: sumOre(valid), complete: valid.length === lines.length };
  } catch {
    return { ore: 0, complete: false };
  }
}

/**
 * Turns the form into an API body, or field errors.
 * @param unitOfItem the unit of an existing item (to read "1,5 kg" in the item's own unit)
 */
export function parsePurchaseValues(
  values: PurchaseFormValues,
  unitOfItem: (itemId: string) => BaseUnit | undefined,
): { errors: FieldErrors; body?: PurchaseBody } {
  const errors: FieldErrors = {};
  const date = isoDateSchema.safeParse(values.purchasedOn);
  if (!values.purchasedOn) errors.purchasedOn = 'validation.purchase.dateRequired';
  else if (!date.success) errors.purchasedOn = 'validation.date.invalid';

  let totalOre: number | undefined;
  const lines: PurchaseLineInput[] = [];
  if (values.mode === 'total') {
    const total = parseOre(values.total);
    if (!total.ok) errors.totalOre = `validation.ore.${total.error}`;
    else if (total.value < 0) errors.totalOre = 'validation.ore.negative';
    else totalOre = total.value;
  } else {
    values.lines.forEach((line, index) => {
      const prefix = `lines.${index}`;
      const amount = parseOre(line.amount);
      if (!amount.ok) errors[`${prefix}.amountOre`] = `validation.ore.${amount.error}`;
      else if (amount.value < 0) errors[`${prefix}.amountOre`] = 'validation.ore.negative';

      let toInventory: PurchaseLineInput['toInventory'] = null;
      if (line.kind === 'food' && line.toInventory && !line.linkedItemName) {
        const unit = line.itemId ? unitOfItem(line.itemId) : line.unit;
        const displayUnit =
          unit && DISPLAY_UNITS_FOR[unit].includes(line.displayUnit)
            ? line.displayUnit
            : (DISPLAY_UNITS_FOR[unit ?? 'stk'][0] ?? 'stk');
        const quantity = parseQuantity(line.quantity, displayUnit);
        if (!quantity.ok) errors[`${prefix}.toInventory.quantityBase`] = quantity.error;
        if (!line.locationId) {
          errors[`${prefix}.toInventory.locationId`] = 'validation.location.required';
        }
        let expiry = null;
        if (line.expiryKind) {
          if (!line.expiryDate) {
            errors[`${prefix}.toInventory.expiry.date`] = 'validation.expiry.dateRequired';
          } else if (!isoDateSchema.safeParse(line.expiryDate).success) {
            errors[`${prefix}.toInventory.expiry.date`] = 'validation.date.invalid';
          } else {
            expiry = { kind: line.expiryKind, date: line.expiryDate };
          }
        }
        toInventory = {
          ...(line.itemId ? { itemId: line.itemId } : { unit: line.unit }),
          quantityBase: quantity.ok ? quantity.value : 0,
          locationId: line.locationId,
          expiry,
        };
      }
      lines.push({
        ...(line.id ? { id: line.id } : {}),
        description: line.description,
        kind: line.kind,
        categoryKey: line.kind === 'food' ? line.categoryKey || null : null,
        amountOre: amount.ok ? amount.value : 0,
        toInventory,
      });
    });
  }

  const body: PurchaseBody = {
    storeName: values.storeName.trim() || null,
    purchasedOn: values.purchasedOn,
    lines,
    ...(totalOre === undefined ? {} : { totalOre }),
  };
  // The rest (lengths, limits, category for food, lines-or-total) by the same schema as the server.
  const checked = createPurchaseSchema.safeParse(body);
  if (!checked.success) {
    for (const [field, key] of Object.entries(fieldErrorsFromZod(checked.error))) {
      errors[field] ??= key;
    }
  }
  return Object.keys(errors).length > 0 ? { errors } : { errors, body };
}
