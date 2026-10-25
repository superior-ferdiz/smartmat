import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationSettingsBody, NotificationsResponse, WasteStats } from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { useCurrentUser } from '../auth/session';

/*
 * Spec 11: server data for notifications and the waste figures. Notifications are household data
 * (['household', id, …]), so any change in the household – a batch used up, a purchase deleted – refetches
 * them with everything else. They are also fetched every minute while the app is open (FR-NOTIF-004).
 */

const keys = {
  household: (h: string) => ['household', h] as const,
  notifications: (h: string) => ['household', h, 'notifications'] as const,
  wasteStats: (h: string, month: string | undefined) =>
    ['household', h, 'inventory', 'waste-stats', month ?? 'current'] as const,
  settings: ['me', 'notification-settings'] as const,
};

const base = (h: string) => `/households/${h}`;

export const NOTIFICATIONS_REFETCH_MS = 60_000;

/** The active household's notifications. `householdId` is undefined when nobody is logged in. */
export function useNotifications(householdId: string | undefined) {
  return useQuery({
    queryKey: keys.notifications(householdId ?? 'none'),
    queryFn: () => apiFetch<NotificationsResponse>(`${base(householdId ?? '')}/notifications`),
    enabled: householdId !== undefined,
    refetchInterval: NOTIFICATIONS_REFETCH_MS,
  });
}

function useNotificationMutation<TInput>(
  path: (input: TInput) => string,
  body: (input: TInput) => unknown,
) {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<unknown>(`${base(h)}${path(input)}`, { method: 'POST', body: body(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications(h) }),
  });
}

/** FR-NOTIF-004: the notifications the page has shown. */
export const useMarkSeen = () =>
  useNotificationMutation<string[]>(
    () => '/notifications/seen',
    (keys) => ({ keys }),
  );

export const useDismissNotification = () =>
  useNotificationMutation<string>(
    () => '/notifications/dismiss',
    (key) => ({ key }),
  );

/** FR-NOTIF-003: the user opened the shopping list. */
export const useShoppingSeen = () =>
  useNotificationMutation<void>(
    () => '/shopping-list/seen',
    () => undefined,
  );

export function useNotificationSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => apiFetch<NotificationSettingsBody>('/me/notification-settings'),
  });
}

/** The settings apply to every household, so every household's notifications are refetched. */
export function useSaveNotificationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationSettingsBody) =>
      apiFetch<NotificationSettingsBody>('/me/notification-settings', { method: 'PUT', body }),
    onSuccess: (saved) => {
      queryClient.setQueryData(keys.settings, saved);
      void queryClient.invalidateQueries({ queryKey: ['household'] });
    },
  });
}

/** Spec 11 (FR-WASTE-001–004); without a month the server uses the current month in Norway. */
export function useWasteStats(month?: string) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.wasteStats(h, month),
    queryFn: () => apiFetch<WasteStats>(`${base(h)}/waste-stats${month ? `?month=${month}` : ''}`),
  });
}
