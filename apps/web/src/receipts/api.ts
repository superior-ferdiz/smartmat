import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RECEIPT_IMAGE_FIELD,
  type ConfirmReceiptInput,
  type PurchaseResponse,
  type ReceiptListResponse,
  type ReceiptResponse,
  type ReceiptSummary,
} from '@smartmat/shared';
import { API_BASE, apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Server data for receipts (phase 8, spec 08). A receipt is read in the background, so its page asks again every
 * two seconds while it waits. Confirming makes a purchase and maybe inventory batches, so it refetches everything
 * for the household (like a purchase, spec 04).
 */

export const POLL_MS = 2000;
const WAITING = new Set(['queued', 'processing']);

function useHouseholdId() {
  return useCurrentUser().householdId;
}

const keys = {
  all: (h: string) => ['household', h] as const,
  list: (h: string) => ['household', h, 'receipts'] as const,
  one: (h: string, id: string) => ['household', h, 'receipts', id] as const,
};

const base = (h: string) => `/households/${h}/receipts`;

/** The image for the review, served from our own API (never cached by the browser). */
export function useReceiptImageUrl(receiptId: string) {
  return `${API_BASE}${base(useHouseholdId())}/${receiptId}/image`;
}

export function useReceipts() {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.list(h),
    queryFn: () => apiFetch<ReceiptListResponse>(base(h)),
  });
}

export function useReceipt(receiptId: string) {
  const h = useHouseholdId();
  return useQuery({
    queryKey: keys.one(h, receiptId),
    queryFn: () => apiFetch<ReceiptResponse>(`${base(h)}/${receiptId}`),
    refetchInterval: (query) =>
      query.state.data && WAITING.has(query.state.data.status) ? POLL_MS : false,
  });
}

function useReceiptMutation<TInput, TResult>(
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

export const useUploadReceipt = () =>
  useReceiptMutation((h, file: Blob) => {
    const form = new FormData();
    form.append(RECEIPT_IMAGE_FIELD, file, 'kvittering.jpg');
    return apiFetch<ReceiptSummary>(base(h), { method: 'POST', body: form });
  });

export const useConfirmReceipt = (receiptId: string) =>
  useReceiptMutation(
    (h, input: ConfirmReceiptInput) =>
      apiFetch<PurchaseResponse>(`${base(h)}/${receiptId}/confirm`, {
        method: 'POST',
        body: input,
      }),
    true,
  );

export const useRetryReceipt = (receiptId: string) =>
  useReceiptMutation((h) =>
    apiFetch<ReceiptSummary>(`${base(h)}/${receiptId}/retry`, { method: 'POST' }),
  );

export const useDiscardReceipt = (receiptId: string) =>
  useReceiptMutation((h) => apiFetch<void>(`${base(h)}/${receiptId}`, { method: 'DELETE' }));
