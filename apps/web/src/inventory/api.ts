import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BatchInput,
  ConsumeBody,
  CreateItemInput,
  CreateLocationInput,
  DiscardBody,
  HistoryResponse,
  InventoryResponse,
  ItemResponse,
  LocationResponse,
  UpdateBatchBody,
  UpdateItemBody,
  WasteSummary,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for the inventory (phase 3). All of it belongs to the user's household; the household id
 * is part of every URL, and the API checks membership on every request (NFR-SEC-001).
 * After any change, everything cached for the household's inventory is refetched.
 */

function useHouseholdId() {
  return useCurrentUser().householdId;
}

const keys = {
  all: (h: string) => ['household', h] as const,
  inventory: (h: string) => ['household', h, 'inventory'] as const,
  item: (h: string, id: string) => ['household', h, 'inventory', 'item', id] as const,
  history: (h: string, id: string) => ['household', h, 'inventory', 'history', id] as const,
  waste: (h: string) => ['household', h, 'inventory', 'waste'] as const,
  locations: (h: string) => ['household', h, 'locations'] as const,
};

const base = (h: string) => `/households/${h}`;

export function useInventory() {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.inventory(h),
    queryFn: () => apiFetch<InventoryResponse>(`${base(h)}/inventory`).then((r) => r.items),
  });
}

export function useItem(itemId: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.item(h, itemId),
    queryFn: () => apiFetch<ItemResponse>(`${base(h)}/inventory/items/${itemId}`),
  });
}

export function useItemHistory(itemId: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.history(h, itemId),
    queryFn: () => apiFetch<HistoryResponse>(`${base(h)}/inventory/items/${itemId}/history`),
  });
}

export function useWasteSummary() {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.waste(h),
    queryFn: () => apiFetch<WasteSummary>(`${base(h)}/inventory/waste-summary`),
  });
}

export function useLocations() {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.locations(h),
    queryFn: () => apiFetch<LocationResponse[]>(`${base(h)}/locations`),
    staleTime: 5 * 60_000,
  });
}

/** A mutation on the household's data; afterwards everything cached for the household is refreshed. */
function useHouseholdMutation<TInput, TResult>(
  request: (h: string, input: TInput) => Promise<TResult>,
) {
  const h = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => request(h, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all(h) }),
  });
}

export const useCreateItem = () =>
  useHouseholdMutation((h, input: CreateItemInput) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/items`, { method: 'POST', body: input }),
  );

export const useUpdateItem = (itemId: string) =>
  useHouseholdMutation((h, input: UpdateItemBody) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/items/${itemId}`, {
      method: 'PATCH',
      body: input,
    }),
  );

export const useDeleteItem = (itemId: string) =>
  useHouseholdMutation<void, void>((h) =>
    apiFetch<void>(`${base(h)}/inventory/items/${itemId}`, { method: 'DELETE' }),
  );

export const useAddBatch = (itemId: string) =>
  useHouseholdMutation((h, input: BatchInput) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/items/${itemId}/batches`, {
      method: 'POST',
      body: input,
    }),
  );

export const useUpdateBatch = () =>
  useHouseholdMutation((h, { batchId, ...input }: UpdateBatchBody & { batchId: string }) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/batches/${batchId}`, {
      method: 'PATCH',
      body: input,
    }),
  );

export const useDeleteBatch = () =>
  useHouseholdMutation((h, batchId: string) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/batches/${batchId}`, { method: 'DELETE' }),
  );

export const useConsume = () =>
  useHouseholdMutation((h, { batchId, ...input }: ConsumeBody & { batchId: string }) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/batches/${batchId}/consume`, {
      method: 'POST',
      body: input,
    }),
  );

export const useDiscard = () =>
  useHouseholdMutation((h, { batchId, ...input }: DiscardBody & { batchId: string }) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/batches/${batchId}/discard`, {
      method: 'POST',
      body: input,
    }),
  );

export const useUndo = (itemId: string) =>
  useHouseholdMutation<void, ItemResponse>((h) =>
    apiFetch<ItemResponse>(`${base(h)}/inventory/items/${itemId}/undo`, { method: 'POST' }),
  );

export const useCreateLocation = () =>
  useHouseholdMutation((h, input: CreateLocationInput) =>
    apiFetch<LocationResponse>(`${base(h)}/locations`, { method: 'POST', body: input }),
  );

export const useRenameLocation = () =>
  useHouseholdMutation((h, { locationId, name }: { locationId: string; name: string }) =>
    apiFetch<LocationResponse>(`${base(h)}/locations/${locationId}`, {
      method: 'PATCH',
      body: { name },
    }),
  );

export const useDeleteLocation = () =>
  useHouseholdMutation((h, locationId: string) =>
    apiFetch<void>(`${base(h)}/locations/${locationId}`, { method: 'DELETE' }),
  );
