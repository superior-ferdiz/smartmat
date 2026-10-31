import type { BaseUnit } from '../quantity/quantity';
import { ALLERGENS, type Allergen } from './allergens';
import {
  SEED_UNITS,
  SEED_UNIT_KEYS,
  parseSeedAmount,
  seedQuantityBase,
  type SeedUnit,
} from './seed';

/*
 * A household's own recipes (ADR-0023, spec 16) and the "foods I do not tolerate" list (FR-ALG-001/002).
 * Pure rules shared by the form in the web app and the API, which checks everything again.
 */

/** Spec 16, decision 8. */
export const HOUSEHOLD_RECIPES_MAX = 200;
export const RECIPE_LINES_MAX = 40;
export const RECIPE_STEPS_MAX = 30;
export const AVOIDED_INGREDIENTS_MAX = 50;

export interface UnitIngredient {
  baseUnit: BaseUnit;
  conversions: readonly { unit: BaseUnit; unitQty: number; baseQty: number }[];
}

/** The units a line for this ingredient may be written in: its own base unit's, and those it has a conversion for. */
export function unitsFor(ingredient: UnitIngredient): SeedUnit[] {
  const bases = new Set<BaseUnit>([
    ingredient.baseUnit,
    ...ingredient.conversions.map((c) => c.unit),
  ]);
  return SEED_UNIT_KEYS.filter((unit) => bases.has(SEED_UNITS[unit].base));
}

export const LINE_QUANTITY_ERRORS = ['validation.recipe.amount', 'validation.recipe.unit'] as const;
export type LineQuantityError = (typeof LINE_QUANTITY_ERRORS)[number];

/**
 * FR-REC-008: the amount the user typed ("1,5" dl) in the ingredient's base unit, with the same rounding as the
 * seed files, or the i18n key of what is wrong.
 */
export function lineQuantityBase(
  amount: string,
  unit: SeedUnit,
  ingredient: UnitIngredient,
): number | LineQuantityError {
  if (!parseSeedAmount(amount)) return 'validation.recipe.amount';
  if (!unitsFor(ingredient).includes(unit)) return 'validation.recipe.unit';
  const value = seedQuantityBase(amount, unit, ingredient);
  // The only other refusals are "less than 1" and "too large": both are about the amount.
  return typeof value === 'number' ? value : 'validation.recipe.amount';
}

/** The line text when the user leaves it empty: "2 dl melk", or just "salt" without an amount. */
export function defaultLineText(
  ingredientName: string,
  amount: string | null,
  unit: SeedUnit | null,
): string {
  return amount && unit ? `${amount} ${unit} ${ingredientName}` : ingredientName;
}

/**
 * FR-ALG-002: the avoided ingredients a recipe contains, by name, in the order the list has them. Free-text lines
 * have no ingredient and never count.
 */
export function ingredientConflicts(
  ingredientIds: Iterable<string>,
  avoided: readonly { id: string; name: string }[],
): string[] {
  const set = new Set(ingredientIds);
  return avoided.filter((a) => set.has(a.id)).map((a) => a.name);
}

/** What one person (or the members who share) has registered: allergens and avoided ingredients. */
export interface DietProfile {
  allergens: readonly Allergen[];
  avoided: readonly { id: string; name: string }[];
}

/** Everything a recipe card or meal plan entry warns about (FR-REC-004, FR-HH-006, FR-ALG-002/003). */
export interface DietWarnings {
  allergenWarnings: Allergen[];
  householdAllergenWarnings: Allergen[];
  ingredientWarnings: string[];
  householdIngredientWarnings: string[];
}

export function dietWarnings(
  ingredients: readonly { id: string; allergens: readonly Allergen[] }[],
  own: DietProfile,
  household: DietProfile,
): DietWarnings {
  const registered = new Set(ingredients.flatMap((i) => i.allergens));
  const ids = ingredients.map((i) => i.id);
  return {
    allergenWarnings: ALLERGENS.filter((a) => registered.has(a) && own.allergens.includes(a)),
    householdAllergenWarnings: ALLERGENS.filter(
      (a) => registered.has(a) && household.allergens.includes(a),
    ),
    ingredientWarnings: ingredientConflicts(ids, own.avoided),
    householdIngredientWarnings: ingredientConflicts(ids, household.avoided),
  };
}
