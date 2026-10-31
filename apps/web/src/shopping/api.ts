import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddFromRecipeInput,
  AddFromRecipeResponse,
  ClearCheckedResponse,
  CreateShoppingItemInput,
  CreateShoppingItemResponse,
  ShoppingItemResponse,
  ShoppingListResponse,
  ToInventoryInput,
  ToInventoryResponse,
  UpdateShoppingItemBody,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for the shopping list (phase 6). The list is cached under ['household', id, 'shopping-list'].
 * Changes to the list only refetch the list; putting lines into the inventory refetches everything for the
 * household, so the inventory and the recipe ranking update too.
 */

const keys = {
  all: (h: string) => ['household', h] as const,
  list: (h: string) => ['household', h, 'shopping-list'] as const,
};

const base = (h: string) => `/households/${h}/shopping-list`;

function useHouseholdId() {
  return useCurrentUser().householdId;
}

export function useShoppingList() {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.list(h),
    queryFn: () => apiFetch<ShoppingListResponse>(base(h)).then((r) => r.items),
  });
}

/** A change to the list; afterwards the list (or, with `everything`, all household data) is refetched. */
function useListMutation<TInput, TResult>(
  request: (h: string, input: TInput) => Promise<TResult>,
  everything = false,
) {
  const h = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => request(h, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: everything ? keys.all(h) : keys.list(h) }),
  });
}

export const useAddShoppingItem = () =>
  useListMutation((h, input: CreateShoppingItemInput) =>
    apiFetch<CreateShoppingItemResponse>(`${base(h)}/items`, { method: 'POST', body: input }),
  );

export const useUpdateShoppingItem = () =>
  useListMutation((h, { itemId, ...input }: UpdateShoppingItemBody & { itemId: string }) =>
    apiFetch<ShoppingItemResponse>(`${base(h)}/items/${itemId}`, { method: 'PATCH', body: input }),
  );

export const useRemoveShoppingItem = () =>
  useListMutation((h, itemId: string) =>
    apiFetch<void>(`${base(h)}/items/${itemId}`, { method: 'DELETE' }),
  );

export const useClearChecked = () =>
  useListMutation<void, ClearCheckedResponse>((h) =>
    apiFetch<ClearCheckedResponse>(`${base(h)}/clear-checked`, { method: 'POST' }),
  );

export const useAddFromRecipe = (recipeId: string) =>
  useListMutation((h, input: AddFromRecipeInput) =>
    apiFetch<AddFromRecipeResponse>(`${base(h)}/from-recipe/${recipeId}`, {
      method: 'POST',
      body: input,
    }),
  );

export const useToInventory = () =>
  useListMutation(
    (h, input: ToInventoryInput) =>
      apiFetch<ToInventoryResponse>(`${base(h)}/to-inventory`, { method: 'POST', body: input }),
    true,
  );

/**
 * FR-SHOP-001: ticking a line off in the shop must feel instant. The cached list is changed at once
 * (optimistic update); the request runs behind it. If it fails, the old list is put back and `onError`
 * tells the user. The server sets `checked` to the value sent (never toggles), so a retry is safe.
 */
export function useToggleChecked(onError: () => void) {
  const h = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      apiFetch<ShoppingItemResponse>(`${base(h)}/items/${itemId}`, {
        method: 'PATCH',
        body: { checked },
      }),
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: keys.list(h) });
      const previous = queryClient.getQueryData<ShoppingItemResponse[]>(keys.list(h));
      queryClient.setQueryData<ShoppingItemResponse[]>(keys.list(h), (items) =>
        items?.map((item) =>
          item.id === itemId
            ? { ...item, checked, checkedAt: checked ? new Date().toISOString() : null }
            : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(keys.list(h), context.previous);
      onError();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.list(h) }),
  });
}
