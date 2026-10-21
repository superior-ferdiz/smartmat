import {
  baseUnitOf,
  bestDisplayUnit,
  buildAliasIndex,
  DISPLAY_UNITS_FOR,
  isoDateSchema,
  itemNameSchema,
  linkedIngredientId,
  linkItem,
  parseQuantity,
  quantityNumber,
  shoppingTextSchema,
  type AddFromRecipeInput,
  type BaseUnit,
  type CategoryKey,
  type CreateShoppingItemInput,
  type DisplayUnit,
  type ExpiryKind,
  type IngredientResponse,
  type ItemResponse,
  type ShoppingItemResponse,
  type StockLineInput,
  type Suggestion,
} from '@smartmat/shared';
import type { FieldErrors } from '../forms/fieldErrors';

/*
 * Form logic for the shopping list (spec 06): what the fields hold while the user types (text), and how it
 * becomes an API body with the shared parsers – the same rules as on the server. Field names match the
 * API's, so a server error lands on the right field ("lines.0.locationId").
 */

/** Every unit a person can type a shopping amount in, in the order offered. */
export const SHOPPING_UNITS: readonly DisplayUnit[] = ['stk', 'g', 'kg', 'ml', 'dl', 'l'];

export interface AmountValues {
  amount: string;
  displayUnit: DisplayUnit;
}

/** A stored amount back to form text: (1500, 'g') → "1,5" kg. Nothing stored → empty, in `fallback`. */
export function amountValues(
  quantityBase: number | null,
  unit: BaseUnit | null,
  fallback: DisplayUnit = 'stk',
): AmountValues {
  if (quantityBase === null || unit === null) return { amount: '', displayUnit: fallback };
  const displayUnit = bestDisplayUnit(quantityBase, unit);
  return { amount: quantityNumber(quantityBase, displayUnit), displayUnit };
}

/** An optional amount: empty → null; otherwise whole base units with their base unit, or an error key. */
export function parseOptionalAmount(values: AmountValues): {
  error?: string;
  quantity: { quantityBase: number; unit: BaseUnit } | null;
} {
  if (values.amount.trim() === '') return { quantity: null };
  const parsed = parseQuantity(values.amount, values.displayUnit);
  if (!parsed.ok) return { error: parsed.error, quantity: null };
  return { quantity: { quantityBase: parsed.value, unit: baseUnitOf(values.displayUnit) } };
}

export interface LineFormValues extends AmountValues {
  text: string;
}

/** FR-SHOP-001: the quick-add form and the edit dialog. */
export function parseLineForm(values: LineFormValues): {
  errors: FieldErrors;
  input?: Omit<CreateShoppingItemInput, 'clientRequestId'>;
} {
  const errors: FieldErrors = {};
  const text = shoppingTextSchema.safeParse(values.text);
  if (!text.success) errors.text = text.error.issues[0]?.message ?? 'validation.unknown';
  const amount = parseOptionalAmount(values);
  if (amount.error) errors.quantity = amount.error;
  if (!text.success || amount.error) return { errors };
  return { errors, input: { text: text.data, quantity: amount.quantity } };
}

/* ---------- FR-SHOP-002: suggestions from a recipe ---------- */

export interface SuggestionValues extends AmountValues {
  selected: boolean;
}

export function suggestionValues(suggestion: Suggestion): SuggestionValues {
  return {
    selected: suggestion.selected,
    ...amountValues(
      suggestion.quantityBase,
      suggestion.baseUnit,
      DISPLAY_UNITS_FOR[suggestion.baseUnit][0] ?? 'stk',
    ),
  };
}

/** Only the ticked suggestions go to the API, each in the ingredient's base unit. */
export function parseSuggestions(
  suggestions: readonly Suggestion[],
  values: readonly SuggestionValues[],
): { errors: FieldErrors; input?: AddFromRecipeInput } {
  const errors: FieldErrors = {};
  const lines: AddFromRecipeInput['lines'] = [];
  suggestions.forEach((suggestion, i) => {
    const value = values[i];
    if (!value?.selected) return;
    const amount = parseOptionalAmount(value);
    if (amount.error) errors[`lines.${i}.quantityBase`] = amount.error;
    lines.push({
      ingredientId: suggestion.ingredientId,
      quantityBase: amount.quantity?.quantityBase ?? null,
    });
  });
  if (lines.length === 0) errors._form = 'validation.shopping.nothingSelected';
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, input: { lines } };
}

/* ---------- FR-SHOP-003: checked lines into the inventory ---------- */

/** `target` is an inventory item id, or NEW_ITEM for a new item. */
export const NEW_ITEM = 'new';

export interface StockValues extends AmountValues {
  shoppingItemId: string;
  target: string;
  name: string;
  categoryKey: CategoryKey;
  unit: BaseUnit;
  locationId: string;
  expiryKind: ExpiryKind | '';
  expiryDate: string;
}

/** Inventory items linked to the line's ingredient first (most likely the right one), then the rest. */
export function itemChoices(
  line: Pick<ShoppingItemResponse, 'ingredientId'>,
  items: readonly ItemResponse[],
  ingredients: readonly IngredientResponse[],
): { linked: ItemResponse[]; others: ItemResponse[] } {
  if (!line.ingredientId) return { linked: [], others: [...items] };
  const index = buildAliasIndex(ingredients);
  const linked = items.filter(
    (item) => linkedIngredientId(linkItem(item, index)) === line.ingredientId,
  );
  return { linked, others: items.filter((item) => !linked.includes(item)) };
}

/** The unit of the item the line goes to. */
export function targetUnit(values: StockValues, items: readonly ItemResponse[]): BaseUnit {
  if (values.target === NEW_ITEM) return values.unit;
  return items.find((i) => i.id === values.target)?.unit ?? values.unit;
}

/**
 * The dialog's first guess for one line: an item linked to the same ingredient if there is one, otherwise a
 * new item named like the line, in the ingredient's category. The amount is filled in when its unit fits.
 */
export function initialStockValues(
  line: ShoppingItemResponse,
  items: readonly ItemResponse[],
  ingredients: readonly IngredientResponse[],
  locationId: string,
): StockValues {
  const ingredient = ingredients.find((i) => i.id === line.ingredientId);
  const linked = itemChoices(line, items, ingredients).linked[0];
  const unit: BaseUnit = linked?.unit ?? line.unit ?? ingredient?.baseUnit ?? 'stk';
  const amount =
    line.unit === unit
      ? amountValues(line.quantityBase, line.unit)
      : { amount: '', displayUnit: DISPLAY_UNITS_FOR[unit][0] ?? 'stk' };
  return {
    shoppingItemId: line.id,
    target: linked?.id ?? NEW_ITEM,
    name: line.text,
    categoryKey: ingredient?.categoryKey ?? 'other',
    unit,
    ...amount,
    locationId,
    expiryKind: '',
    expiryDate: '',
  };
}

export function parseStockValues(
  values: readonly StockValues[],
  items: readonly ItemResponse[],
): { errors: FieldErrors; input?: { lines: StockLineInput[] } } {
  const errors: FieldErrors = {};
  const lines: StockLineInput[] = [];
  values.forEach((value, i) => {
    const field = (name: string) => `lines.${i}.${name}`;
    const unit = targetUnit(value, items);
    const quantity = parseQuantity(
      value.amount,
      DISPLAY_UNITS_FOR[unit].includes(value.displayUnit)
        ? value.displayUnit
        : (DISPLAY_UNITS_FOR[unit][0] ?? 'stk'),
    );
    if (!quantity.ok) errors[field('quantityBase')] = quantity.error;
    if (!value.locationId) errors[field('locationId')] = 'validation.location.required';
    const name = itemNameSchema.safeParse(value.name);
    if (value.target === NEW_ITEM && !name.success)
      errors[field('target.name')] = name.error.issues[0]?.message ?? 'validation.unknown';

    let expiry: StockLineInput['expiry'] = null;
    if (value.expiryKind) {
      const date = isoDateSchema.safeParse(value.expiryDate);
      if (!value.expiryDate) errors[field('expiry.date')] = 'validation.expiry.dateRequired';
      else if (!date.success) errors[field('expiry.date')] = 'validation.date.invalid';
      else expiry = { kind: value.expiryKind, date: date.data };
    }
    if (!quantity.ok) return;
    lines.push({
      shoppingItemId: value.shoppingItemId,
      target:
        value.target === NEW_ITEM
          ? { kind: 'new', name: name.data ?? value.name, categoryKey: value.categoryKey, unit }
          : { kind: 'existing', itemId: value.target },
      quantityBase: quantity.value,
      locationId: value.locationId,
      expiry,
    });
  });
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, input: { lines } };
}
