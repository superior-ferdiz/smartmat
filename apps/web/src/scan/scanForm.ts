import {
  bestDisplayUnit,
  itemNameSchema,
  quantityNumber,
  type BarcodeLookupResponse,
  type BaseUnit,
  type CategoryKey,
  type ConfirmScanInput,
  type ItemIngredientInput,
} from '@smartmat/shared';
import type { FieldErrors } from '../forms/fieldErrors';
import { emptyBatchValues, parseBatchValues, type BatchFormValues } from '../inventory/batchForm';

/*
 * FR-SCAN-002/-005: the confirmation form. Filled in from the lookup, always changed and confirmed by the user.
 * The date is never filled in (spec 07, decision 2).
 */

export const INGREDIENT_AUTO = 'auto';
export const INGREDIENT_NONE = 'none';

export interface ScanFormValues {
  /** A new batch on the item from last time, or a new item. */
  mode: ConfirmScanInput['mode'];
  name: string;
  categoryKey: CategoryKey | '';
  unit: BaseUnit;
  /** 'auto', 'none' or an ingredient id. */
  ingredient: string;
  batch: BatchFormValues;
}

/** The amount as text in the best display unit: 1500 g → "1,5" kg. */
function amountValues(unit: BaseUnit, quantityBase: number | null, locationId: string) {
  const values = emptyBatchValues(unit, locationId);
  if (quantityBase === null) return values;
  const displayUnit = bestDisplayUnit(quantityBase, unit);
  return { ...values, displayUnit, amount: quantityNumber(quantityBase, displayUnit) };
}

/**
 * The form as it starts. `locationIds` are the household's places in menu order: a remembered place that no
 * longer exists is replaced by the first one, as in "Legg til vare".
 */
export function initialScanValues(
  lookup: BarcodeLookupResponse,
  locationIds: readonly string[],
): ScanFormValues {
  const { suggestion, existingItem } = lookup;
  const unit = existingItem?.unit ?? suggestion.unit ?? 'stk';
  const locationId =
    suggestion.locationId && locationIds.includes(suggestion.locationId)
      ? suggestion.locationId
      : (locationIds[0] ?? '');
  // An amount in another unit than the item's (OFF said ml, the item is in pieces) is not offered.
  const quantity =
    suggestion.unit === null || suggestion.unit === unit ? suggestion.quantityBase : null;
  const batch: BatchFormValues = {
    ...amountValues(unit, quantity, locationId),
    expiryKind: suggestion.expiryKind ?? '',
  };
  const ingredient = suggestion.ingredient;
  return {
    mode: existingItem ? 'existingItem' : 'newItem',
    name: suggestion.name ?? '',
    categoryKey: suggestion.categoryKey ?? '',
    unit,
    ingredient:
      ingredient?.match === 'manual' && ingredient.ingredientId
        ? ingredient.ingredientId
        : (ingredient?.match ?? INGREDIENT_AUTO),
    batch,
  };
}

/** A different unit: the amount text is kept, the display unit follows the new base unit. */
export function withUnit(values: ScanFormValues, unit: BaseUnit): ScanFormValues {
  const batch = emptyBatchValues(unit, values.batch.locationId);
  return {
    ...values,
    unit,
    batch: { ...values.batch, displayUnit: batch.displayUnit },
  };
}

export function ingredientInput(value: string): ItemIngredientInput {
  if (value === INGREDIENT_AUTO) return { match: 'auto' };
  if (value === INGREDIENT_NONE) return { match: 'none' };
  return { match: 'manual', ingredientId: value };
}

/**
 * The API body, or field errors with the API's field names (so server errors land on the same fields).
 * Item fields are only checked for a new item.
 */
export function parseScanValues(
  values: ScanFormValues,
  clientRequestId: string,
  existingItemId: string | null,
): { errors: FieldErrors; input?: ConfirmScanInput } {
  const errors: FieldErrors = {};
  const batch = parseBatchValues(values.batch);
  for (const [field, key] of Object.entries(batch.errors)) errors[`batch.${field}`] = key;

  if (values.mode === 'existingItem' && existingItemId) {
    if (!batch.input) return { errors };
    return {
      errors,
      input: { mode: 'existingItem', clientRequestId, itemId: existingItemId, batch: batch.input },
    };
  }

  const name = itemNameSchema.safeParse(values.name);
  if (!name.success) errors.name = name.error.issues[0]?.message ?? 'validation.unknown';
  if (!values.categoryKey) errors.categoryKey = 'validation.category.required';
  if (Object.keys(errors).length > 0 || !batch.input || !values.categoryKey) return { errors };
  return {
    errors,
    input: {
      mode: 'newItem',
      clientRequestId,
      name: values.name,
      categoryKey: values.categoryKey,
      unit: values.unit,
      ingredient: ingredientInput(values.ingredient),
      batch: batch.input,
    },
  };
}
