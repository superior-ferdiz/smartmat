import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Allergen,
  AllergensBody,
  AvoidedIngredientsResponse,
  CreateHouseholdRecipeBody,
  HouseholdRecipeEdit,
  HouseholdRecipeSaved,
  IngredientResponse,
  RecipeDetail,
  RecipeListResponse,
  RecipePriceEstimate,
  UpdateHouseholdRecipeBody,
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
  edit: (h: string, id: string) => ['household', h, 'recipes', id, 'edit'] as const,
  price: (h: string, id: string) => ['household', h, 'recipes', id, 'price-estimate'] as const,
  ingredients: ['ingredients'] as const,
  allergens: ['me', 'allergens'] as const,
  avoided: ['me', 'avoided-ingredients'] as const,
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

/** Spec 16 (FR-ALG-001): the ingredients the user does not tolerate. */
export function useAvoidedIngredients() {
  return useQuery({
    queryKey: keys.avoided,
    queryFn: () =>
      apiFetch<AvoidedIngredientsResponse>('/me/avoided-ingredients').then((r) => r.ingredients),
  });
}

export function useSetAvoidedIngredients() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ingredientIds: string[]) =>
      apiFetch<AvoidedIngredientsResponse>('/me/avoided-ingredients', {
        method: 'PUT',
        body: { ingredientIds },
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(keys.avoided, saved.ingredients);
      // The warnings are on recipes and meal plan entries alike.
      await queryClient.invalidateQueries({ queryKey: ['household', h] });
    },
  });
}

/** Spec 16 (FR-REC-007): the form data of the household's own recipe. */
export function useRecipeEdit(recipeId: string) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.edit(h, recipeId),
    queryFn: () => apiFetch<HouseholdRecipeEdit>(`/households/${h}/recipes/${recipeId}/edit`),
    // The form keeps the version it opened with: a background refetch must not move it (409 on a stale edit).
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useCreateRecipe() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateHouseholdRecipeBody) =>
      apiFetch<HouseholdRecipeSaved>(`/households/${h}/recipes`, { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.recipes(h) }),
  });
}

export function useUpdateRecipe(recipeId: string) {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateHouseholdRecipeBody) =>
      apiFetch<HouseholdRecipeSaved>(`/households/${h}/recipes/${recipeId}`, {
        method: 'PUT',
        body,
      }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: keys.edit(h, recipeId) });
      // The meal plan shows the title too.
      await queryClient.invalidateQueries({ queryKey: ['household', h] });
    },
  });
}

/** Not awaited in onSuccess: the recipe page shows "not found" after the refetch (phase 11 note). */
export function useDeleteRecipe(recipeId: string) {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/households/${h}/recipes/${recipeId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: keys.recipe(h, recipeId) });
      void queryClient.invalidateQueries({ queryKey: ['household', h] });
    },
  });
}

/** FR-PRICE-007: under the recipe, so inventory and purchase changes refetch it. */
export function useRecipePriceEstimate(recipeId: string) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.price(h, recipeId),
    queryFn: () =>
      apiFetch<RecipePriceEstimate>(`/households/${h}/recipes/${recipeId}/price-estimate`),
  });
}
