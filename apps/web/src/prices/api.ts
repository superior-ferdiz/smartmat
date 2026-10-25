import { useQuery } from '@tanstack/react-query';
import type {
  BarcodePricesResponse,
  ItemPricesResponse,
  ShoppingPriceEstimateResponse,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for prices (phase 12, spec 12). Read only. The keys sit under the household, so every change to the
 * household (a new purchase, a batch with a price) refetches them; the estimate sits under the shopping list, so
 * list edits refetch it too.
 */

export function useBarcodePrices(gtin: string | null) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: ['household', h, 'prices', 'barcode', gtin],
    queryFn: () => apiFetch<BarcodePricesResponse>(`/households/${h}/prices/${gtin ?? ''}`),
    enabled: gtin !== null,
    // The server caches external prices for six hours; a minute here saves requests when going back and forth.
    staleTime: 60_000,
    retry: false,
  });
}

export function useItemPrices(itemId: string) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: ['household', h, 'prices', 'item', itemId],
    queryFn: () => apiFetch<ItemPricesResponse>(`/households/${h}/items/${itemId}/prices`),
    staleTime: 60_000,
    retry: false,
  });
}

export function useShoppingEstimate() {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: ['household', h, 'shopping-list', 'price-estimate'],
    queryFn: () =>
      apiFetch<ShoppingPriceEstimateResponse>(`/households/${h}/shopping-list/price-estimate`),
  });
}
