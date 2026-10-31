import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddPlanToShoppingInput,
  AddPlanToShoppingResponse,
  CreateMealEntryInput,
  MealEntryResponse,
  MealPlanNeedsResponse,
  MealPlanResponse,
  RecipeListResponse,
  UpdateMealEntryBody,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for the meal plan (phase 9, spec 09). Everything is cached under
 * ['household', id, 'meal-plan', …], so an inventory or purchase change (which invalidates
 * ['household', id]) works out the needs again too. Changing the plan refetches the plan and its needs;
 * adding to the shopping list also refetches the list.
 */

const keys = {
  plan: (h: string) => ['household', h, 'meal-plan'] as const,
  week: (h: string, from: string, to: string) => ['household', h, 'meal-plan', from, to] as const,
  needs: (h: string, from: string, to: string) =>
    ['household', h, 'meal-plan', 'needs', from, to] as const,
  recipesFor: (h: string, date: string) => ['household', h, 'recipes', 'for', date] as const,
  shoppingList: (h: string) => ['household', h, 'shopping-list'] as const,
};

const base = (h: string) => `/households/${h}/meal-plan`;

function useHouseholdId() {
  return useCurrentUser().householdId;
}

export function useMealPlan(from: string, to: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.week(h, from, to),
    queryFn: () =>
      apiFetch<MealPlanResponse>(`${base(h)}?from=${from}&to=${to}`).then((r) => r.entries),
  });
}

export function useMealNeeds(range: { from: string; to: string } | null) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.needs(h, range?.from ?? '', range?.to ?? ''),
    queryFn: () =>
      apiFetch<MealPlanNeedsResponse>(`${base(h)}/needs?from=${range?.from}&to=${range?.to}`),
    enabled: range !== null,
  });
}

/** FR-PLAN-005: recipes ranked for a planned day (use-by before that day does not count). */
export function useRecipesFor(date: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.recipesFor(h, date),
    queryFn: () => apiFetch<RecipeListResponse>(`/households/${h}/recipes?for=${date}`),
  });
}

function usePlanMutation<TInput, TResult>(request: (h: string, input: TInput) => Promise<TResult>) {
  const h = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => request(h, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.plan(h) }),
  });
}

export const useAddMealEntry = () =>
  usePlanMutation((h, input: CreateMealEntryInput) =>
    apiFetch<MealEntryResponse>(`${base(h)}/entries`, { method: 'POST', body: input }),
  );

export const useUpdateMealEntry = () =>
  usePlanMutation((h, { entryId, ...input }: UpdateMealEntryBody & { entryId: string }) =>
    apiFetch<MealEntryResponse>(`${base(h)}/entries/${entryId}`, { method: 'PATCH', body: input }),
  );

export const useRemoveMealEntry = () =>
  usePlanMutation((h, entryId: string) =>
    apiFetch<void>(`${base(h)}/entries/${entryId}`, { method: 'DELETE' }),
  );

export function useAddPlanToShopping() {
  const h = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPlanToShoppingInput) =>
      apiFetch<AddPlanToShoppingResponse>(`${base(h)}/shopping`, { method: 'POST', body: input }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.plan(h) }),
        queryClient.invalidateQueries({ queryKey: keys.shoppingList(h) }),
      ]),
  });
}
