import {
  DISPLAY_UNITS_FOR,
  isoDateSchema,
  oreInputSchema,
  parseQuantity,
  type BaseUnit,
  type BatchInput,
  type DisplayUnit,
  type ExpiryKind,
} from '@smartmat/shared';
import type { FieldErrors } from '../forms/fieldErrors';

/** What the batch part of a form holds while the user types (all text, parsed on submit). */
export interface BatchFormValues {
  amount: string;
  displayUnit: DisplayUnit;
  locationId: string;
  expiryKind: ExpiryKind | '';
  expiryDate: string;
  price: string;
  purchasedOn: string;
}

export function emptyBatchValues(unit: BaseUnit, locationId = ''): BatchFormValues {
  return {
    amount: '',
    displayUnit: DISPLAY_UNITS_FOR[unit][0] ?? 'stk',
    locationId,
    expiryKind: '',
    expiryDate: '',
    price: '',
    purchasedOn: '',
  };
}

/** Field ids, in form order (for the error summary). */
export const BATCH_FIELD_IDS = {
  quantityBase: 'batch-amount',
  locationId: 'batch-location',
  'expiry.kind': 'batch-expiry-kind',
  'expiry.date': 'batch-expiry-date',
  priceOre: 'batch-price',
  purchasedOn: 'batch-purchased',
};

/**
 * Turns the form text into an API body with the shared parsers (same rules as the server), or field errors.
 * "1,5" kg → 1500 g, "24,90" kr → 2490 øre.
 */
export function parseBatchValues(values: BatchFormValues): {
  errors: FieldErrors;
  input?: BatchInput;
} {
  const errors: FieldErrors = {};
  const quantity = parseQuantity(values.amount, values.displayUnit);
  if (!quantity.ok) errors.quantityBase = quantity.error;
  if (!values.locationId) errors.locationId = 'validation.location.required';

  let expiry: BatchInput['expiry'] = null;
  if (values.expiryKind) {
    const date = isoDateSchema.safeParse(values.expiryDate);
    if (!values.expiryDate) errors['expiry.date'] = 'validation.expiry.dateRequired';
    else if (!date.success) errors['expiry.date'] = 'validation.date.invalid';
    else expiry = { kind: values.expiryKind, date: date.data };
  }

  let priceOre: number | null = null;
  if (values.price.trim()) {
    const price = oreInputSchema.safeParse(values.price);
    if (price.success) priceOre = price.data;
    else errors.priceOre = price.error.issues[0]?.message ?? 'validation.unknown';
  }

  let purchasedOn: string | null = null;
  if (values.purchasedOn) {
    const date = isoDateSchema.safeParse(values.purchasedOn);
    if (date.success) purchasedOn = date.data;
    else errors.purchasedOn = 'validation.date.invalid';
  }

  if (Object.keys(errors).length > 0 || !quantity.ok) return { errors };
  return {
    errors,
    input: {
      quantityBase: quantity.value,
      locationId: values.locationId,
      expiry,
      priceOre,
      purchasedOn,
    },
  };
}
