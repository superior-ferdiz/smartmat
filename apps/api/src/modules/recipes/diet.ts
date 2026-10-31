import { ALLERGENS, type Allergen, type DietProfile } from '@smartmat/shared';
import type { RecipeRepo } from './repo';

/*
 * What the recipe list, a recipe and the meal plan warn about (FR-REC-004, FR-HH-006, spec 16 FR-ALG-002):
 * the user's own allergens and avoided ingredients, and what other current members share with the household
 * (opt-in, `share_allergens`), minus the user's own. Never says whose.
 */

export interface SharedDiet {
  sharedAllergens(
    householdId: string,
    userId: string,
    own: readonly Allergen[],
  ): Promise<Allergen[]>;
  sharedAvoidedIngredients(
    householdId: string,
    userId: string,
    own: readonly { id: string }[],
  ): Promise<{ id: string; name: string }[]>;
}

export interface Diet {
  own: DietProfile & { allergens: Allergen[] };
  household: DietProfile & { allergens: Allergen[] };
}

export async function loadDiet(
  repo: Pick<RecipeRepo, 'userAllergens' | 'avoidedIngredients'>,
  households: SharedDiet,
  householdId: string,
  userId: string,
): Promise<Diet> {
  const [allergenList, avoided] = await Promise.all([
    repo.userAllergens(userId),
    repo.avoidedIngredients(userId),
  ]);
  const allergens = ALLERGENS.filter((a) => allergenList.includes(a));
  const [householdAllergens, householdAvoided] = await Promise.all([
    households.sharedAllergens(householdId, userId, allergens),
    households.sharedAvoidedIngredients(householdId, userId, avoided),
  ]);
  return {
    own: { allergens, avoided },
    household: { allergens: householdAllergens, avoided: householdAvoided },
  };
}
