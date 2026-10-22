import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BarcodeLookupResponse,
  ConfirmScanInput,
  ConfirmScanResponse,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for barcode scanning (phase 7, spec 07). A lookup saves nothing; it is cached briefly so going
 * back to the same code does not ask again. Confirming refreshes everything for the household, like the inventory.
 */

const barcodePath = (h: string, gtin: string) => `/households/${h}/barcodes/${gtin}`;

export function useBarcodeLookup(gtin: string | null) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: ['household', h, 'barcode', gtin],
    queryFn: () => apiFetch<BarcodeLookupResponse>(barcodePath(h, gtin ?? '')),
    enabled: gtin !== null,
    staleTime: 60_000,
    // A failed lookup (rate limit, network) is shown at once with a retry button, not retried in the background.
    retry: false,
  });
}

export function useConfirmScan(gtin: string) {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmScanInput) =>
      apiFetch<ConfirmScanResponse>(`${barcodePath(h, gtin)}/confirm`, {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['household', h] }),
  });
}
