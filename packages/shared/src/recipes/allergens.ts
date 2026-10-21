/*
 * FR-REC-004. The 14 allergens that must be declared under the Norwegian food information regulation
 * (matinformasjonsforskriften, based on EU 1169/2011). The order is the order the profile shows them in.
 *
 * The app never says that a recipe is free of an allergen: the data only says which allergens are
 * *registered* for the ingredients, and the user's products may contain others.
 */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'egg',
  'fish',
  'peanuts',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** The allergens in `registered` that the user has, in the fixed order above. */
export function allergenConflicts(
  registered: Iterable<Allergen>,
  userAllergens: readonly Allergen[],
): Allergen[] {
  const set = new Set(registered);
  return ALLERGENS.filter((a) => set.has(a) && userAllergens.includes(a));
}
