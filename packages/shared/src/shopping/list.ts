import type { BaseUnit } from '../quantity/quantity';
import { MAX_QUANTITY_BASE } from '../quantity/quantity';
import { matchByName, type AliasIndex, type IngredientMatchMode } from '../recipes/matching';
import type { LineStatus } from '../recipes/scoring';

/*
 * Spec 06: the rules of the shopping list as pure functions, used by the API (merging, linking new items)
 * and by the web app (the suggestions in the recipe dialog, the order of the list).
 */

export interface ShoppingQuantity {
  quantityBase: number | null;
  unit: BaseUnit | null;
}

/**
 * FR-SHOP-002: what an open line's quantity becomes when a recipe adds to it. Amounts in the same unit are
 * added. A line without an amount stays without one ("melk" means "buy some"), and a line in another unit
 * keeps its amount: nothing is converted, so nothing is rounded. The recipe's share is shown under the line.
 */
export function mergeQuantity(
  existing: ShoppingQuantity,
  incoming: { quantityBase: number | null; unit: BaseUnit },
): ShoppingQuantity {
  if (existing.quantityBase === null || existing.unit === null) return existing;
  if (incoming.quantityBase === null || incoming.unit !== existing.unit) return existing;
  const sum = existing.quantityBase + incoming.quantityBase;
  // Above the largest allowed quantity the line keeps its amount rather than failing the whole request.
  return sum > MAX_QUANTITY_BASE ? existing : { quantityBase: sum, unit: existing.unit };
}

export const SUGGESTION_REASONS = [
  'missing',
  'notEnough',
  'unknownAmount',
  'staple',
  'optional',
  'onList',
] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];

export interface SuggestionSource {
  ingredientId: string;
  ingredientName: string;
  quantityBase: number | null;
  baseUnit: BaseUnit;
  optional: boolean;
  status: LineStatus;
  missingBase: number | null;
}

export interface Suggestion {
  ingredientId: string;
  ingredientName: string;
  /** Proposed amount in the ingredient's base unit (null = no amount). */
  quantityBase: number | null;
  baseUnit: BaseUnit;
  reason: SuggestionReason;
  /** Ticked in the dialog from the start. */
  selected: boolean;
}

/**
 * FR-SHOP-002: one suggestion per recipe ingredient that is not already covered. Only what is missing is
 * ticked; staples, optional ingredients, unknown amounts and ingredients already on the list are shown
 * unticked so the user decides (decision 3 in spec 06).
 */
export function suggestFromRecipe(
  lines: readonly SuggestionSource[],
  onList: ReadonlySet<string>,
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  for (const line of lines) {
    if (line.status === 'enough') continue;
    const quantityBase =
      line.status === 'notEnough'
        ? line.missingBase
        : line.status === 'unknownAmount'
          ? null
          : line.quantityBase;
    let reason: SuggestionReason;
    if (onList.has(line.ingredientId)) reason = 'onList';
    else if (line.status === 'staple') reason = 'staple';
    else if (line.optional) reason = 'optional';
    else reason = line.status;
    suggestions.push({
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      quantityBase,
      baseUnit: line.baseUnit,
      reason,
      selected: reason === 'missing' || reason === 'notEnough',
    });
  }
  return suggestions;
}

/** The ingredient a text matches on its own (spec 05 rules), or null when unmatched or ambiguous. */
export function textIngredientId(text: string, index: AliasIndex): string | null {
  const match = matchByName(text, index);
  return match.kind === 'matched' ? match.ingredientId : null;
}

export interface SortableShoppingItem {
  checked: boolean;
  checkedAt: string | null;
  createdAt: string;
}

/** Open lines first (oldest first, the order they were written), then checked ones (last checked first). */
export function sortShoppingItems<T extends SortableShoppingItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (a.checked) return (b.checkedAt ?? '').localeCompare(a.checkedAt ?? '');
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/**
 * FR-SHOP-003: how a new inventory item made from a shopping line is linked to the line's ingredient.
 * If its name already matches that ingredient by itself, the normal automatic link is kept; otherwise the
 * ingredient is set by hand, so the item matches the recipe again whatever the user called it.
 */
export function newItemIngredientLink(
  name: string,
  ingredientId: string | null,
  index: AliasIndex,
): { ingredientMatch: IngredientMatchMode; ingredientId: string | null } {
  if (ingredientId === null) return { ingredientMatch: 'auto', ingredientId: null };
  return textIngredientId(name, index) === ingredientId
    ? { ingredientMatch: 'auto', ingredientId: null }
    : { ingredientMatch: 'manual', ingredientId };
}
