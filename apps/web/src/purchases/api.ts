import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BudgetInput,
  BudgetResponse,
  BudgetSummary,
  CreatePurchaseInput,
  DeletePurchaseResponse,
  PurchaseListResponse,
  PurchaseResponse,
  UpdatePurchaseInput,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for purchases and the budget (phase 4). Like the inventory, everything is under the
 * household in the URL. A purchase can add to or remove from the inventory (FR-BUD-002/005), so after any
 * change everything cached for the household is refetched – budget figures and inventory alike.
 */

function useHouseholdId() {
  return useCurrentUser().householdId;
}

const keys = {
  all: (h: string) => ['household', h] as const,
  purchases: (h: string, month: string | undefined) =>
    ['household', h, 'purchases', 'month', month ?? 'current'] as const,
  purchase: (h: string, id: string) => ['household', h, 'purchases', 'one', id] as const,
  budget: (h: string) => ['household', h, 'budget'] as const,
  summary: (h: string, month: string | undefined) =>
    ['household', h, 'budget', 'summary', month ?? 'current'] as const,
};

const base = (h: string) => `/households/${h}`;
const monthQuery = (month: string | undefined) => (month ? `?month=${month}` : '');

/** The month's purchases; without a month the server uses the current month in Norway. */
export function usePurchases(month?: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.purchases(h, month),
    queryFn: () => apiFetch<PurchaseListResponse>(`${base(h)}/purchases${monthQuery(month)}`),
  });
}

export function usePurchase(purchaseId: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.purchase(h, purchaseId),
    queryFn: () => apiFetch<PurchaseResponse>(`${base(h)}/purchases/${purchaseId}`),
  });
}

export function useBudget() {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.budget(h),
    queryFn: () => apiFetch<BudgetResponse>(`${base(h)}/budget`),
  });
}

export function useBudgetSummary(month?: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.summary(h, month),
    queryFn: () => apiFetch<BudgetSummary>(`${base(h)}/budget/summary${monthQuery(month)}`),
  });
}

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

export const useCreatePurchase = () =>
  useHouseholdMutation((h, input: CreatePurchaseInput) =>
    apiFetch<PurchaseResponse>(`${base(h)}/purchases`, { method: 'POST', body: input }),
  );

export const useUpdatePurchase = (purchaseId: string) =>
  useHouseholdMutation((h, input: UpdatePurchaseInput) =>
    apiFetch<PurchaseResponse>(`${base(h)}/purchases/${purchaseId}`, {
      method: 'PUT',
      body: input,
    }),
  );

/**
 * The refetch is not awaited here: it asks for the deleted purchase again (404), and the page then shows "not
 * found" and unmounts the dialog – TanStack drops the caller's onSuccess (toast and navigation) with it. Found by
 * Playwright in phase 11, when the notification query made the household refetch slower.
 */
export function useDeletePurchase(purchaseId: string) {
  const h = useHouseholdId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (removeUntouchedBatches: boolean) =>
      apiFetch<DeletePurchaseResponse>(
        `${base(h)}/purchases/${purchaseId}?removeUntouchedBatches=${String(removeUntouchedBatches)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.all(h) });
    },
  });
}

export const useSetBudget = () =>
  useHouseholdMutation((h, input: BudgetInput) =>
    apiFetch<BudgetResponse>(`${base(h)}/budget`, { method: 'PUT', body: input }),
  );
