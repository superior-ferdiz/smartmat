import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Allergen,
  AllergensBody,
  IngredientResponse,
  RecipeDetail,
  RecipeListResponse,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for recipes (phase 5). The ranking depends on the household's inventory, so it is cached
 * under ['household', id, ...]: every inventory or purchase change (which invalidates ['household', id])
 * re-ranks the recipes too. The allergy list belongs to the user (/me), and changing it re-ranks as well.
 */

const keys = {
  recipes: (h: string) => ['household', h, 'recipes'] as const,
  recipe: (h: string, id: string) => ['household', h, 'recipes', id] as const,
  ingredients: ['ingredients'] as const,
  allergens: ['me', 'allergens'] as const,
};

export function useRecipes() {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.recipes(h),
    queryFn: () => apiFetch<RecipeListResponse>(`/households/${h}/recipes`),
  });
}

export function useRecipe(recipeId: string) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.recipe(h, recipeId),
    queryFn: () => apiFetch<RecipeDetail>(`/households/${h}/recipes/${recipeId}`),
  });
}

/** The global ingredient list (with aliases), for linking an item. Changes only when the team re-seeds. */
export function useIngredients() {
  return useQuery({
    queryKey: keys.ingredients,
    queryFn: () => apiFetch<IngredientResponse[]>('/ingredients'),
    staleTime: 10 * 60_000,
  });
}

export function useAllergens() {
  return useQuery({
    queryKey: keys.allergens,
    queryFn: () => apiFetch<AllergensBody>('/me/allergens').then((r) => r.allergens),
  });
}

export function useSetAllergens() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allergens: Allergen[]) =>
      apiFetch<AllergensBody>('/me/allergens', { method: 'PUT', body: { allergens } }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(keys.allergens, saved.allergens);
      await queryClient.invalidateQueries({ queryKey: keys.recipes(h) });
    },
  });
}
