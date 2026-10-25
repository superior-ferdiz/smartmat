import type { IngredientResponse, ShoppingItemResponse } from '@smartmat/shared';

let counter = 0;
const uuid = () => `0199f0a0-0000-7000-8000-${String(++counter).padStart(12, '5')}`;

export function shoppingItem(
  text: string,
  overrides: Partial<ShoppingItemResponse> = {},
): ShoppingItemResponse {
  return {
    id: uuid(),
    text,
    ingredientId: null,
    quantityBase: null,
    unit: null,
    checked: false,
    checkedAt: null,
    createdAt: `2026-10-21T08:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    createdBy: { kind: 'member', displayName: 'Kari' },
    recipes: [],
    meals: [],
    ...overrides,
  };
}

export function ingredient(
  name: string,
  overrides: Partial<IngredientResponse> = {},
): IngredientResponse {
  return {
    id: uuid(),
    key: name.toLowerCase(),
    name,
    baseUnit: 'g',
    isStaple: false,
    categoryKey: null,
    aliases: [],
    ...overrides,
  };
}
