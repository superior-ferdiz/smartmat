import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AcceptInvitationResponse,
  CreatedInvitationResponse,
  DeleteHouseholdInput,
  HouseholdMembersResponse,
  HouseholdResponse,
  InvitationListResponse,
  InvitationPreviewResponse,
  SessionResponse,
  SessionUser,
  TransferOwnershipInput,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';
import { SESSION_QUERY_KEY, useCurrentUser } from '../auth/session';

/*
 * Server data for shared households (spec 10). The household, its members and its invitations live under
 * ['household', id, …] like all household data, so leaving or switching removes them with the rest
 * (HouseholdWatcher). Anything that changes who is in which household refetches the session: it carries the
 * active household and the list for the switcher.
 */

const keys = {
  household: (h: string) => ['household', h, 'info'] as const,
  members: (h: string) => ['household', h, 'members'] as const,
  invitations: (h: string) => ['household', h, 'invitations'] as const,
};

const refetchSession = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });

export function useHousehold() {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.household(h),
    queryFn: () => apiFetch<HouseholdResponse>(`/households/${h}`),
  });
}

/** FR-HH-007: names are shown only when someone else is (or was) in the household. */
export function useIsShared(): boolean {
  return (useHousehold().data?.memberCount ?? 1) > 1;
}

export function useMembers() {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.members(h),
    queryFn: () =>
      apiFetch<HouseholdMembersResponse>(`/households/${h}/members`).then((r) => r.members),
  });
}

export function useInvitations(enabled: boolean) {
  const h = useCurrentUser().householdId;
  return useQuery({
    queryKey: keys.invitations(h),
    queryFn: () =>
      apiFetch<InvitationListResponse>(`/households/${h}/invitations`).then((r) => r.invitations),
    enabled,
  });
}

export function useCreateInvitation() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<CreatedInvitationResponse>(`/households/${h}/invitations`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(h) }),
  });
}

export function useRevokeInvitation() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<void>(`/households/${h}/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations(h) }),
  });
}

export function useRenameHousehold() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<HouseholdResponse>(`/households/${h}`, { method: 'PATCH', body: { name } }),
    onSuccess: async (household) => {
      queryClient.setQueryData(keys.household(h), household);
      await refetchSession(queryClient);
    },
  });
}

export function useSetShareAllergens() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shareAllergens: boolean) =>
      apiFetch<HouseholdResponse>(`/households/${h}/members/me`, {
        method: 'PATCH',
        body: { shareAllergens },
      }),
    onSuccess: async (household) => {
      queryClient.setQueryData(keys.household(h), household);
      // The ranking of recipes and the meal plan's warnings depend on it.
      await queryClient.invalidateQueries({ queryKey: ['household', h] });
    },
  });
}

export function useRemoveMember() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/households/${h}/members/${userId}`, { method: 'DELETE' }),
    // Their allergies and their name in the history change too.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['household', h] }),
  });
}

export function useTransferOwnership() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TransferOwnershipInput) =>
      apiFetch<void>(`/households/${h}/transfer-ownership`, { method: 'POST', body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['household', h] });
      await refetchSession(queryClient);
    },
  });
}

/** Leaving and deleting end in another household: the watcher then drops this one's cache. */
export function useLeaveHousehold() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/households/${h}/leave`, { method: 'POST' }),
    onSuccess: () => refetchSession(queryClient),
  });
}

export function useDeleteHousehold() {
  const h = useCurrentUser().householdId;
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteHouseholdInput) =>
      apiFetch<void>(`/households/${h}`, { method: 'DELETE', body: input }),
    onSuccess: () => refetchSession(queryClient),
  });
}

/** FR-HH-004: the answer is the session user, now in the chosen household. */
export function useSwitchHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (householdId: string) =>
      apiFetch<SessionUser>('/me/active-household', { method: 'PUT', body: { householdId } }),
    onSuccess: (user) =>
      queryClient.setQueryData<SessionResponse | null>(SESSION_QUERY_KEY, (old) =>
        old ? { ...old, user } : old,
      ),
  });
}

/** FR-HH-002: a POST, because the token must not be in a URL. Never retried (the limit counts attempts). */
export function useInvitationPreview(token: string | null) {
  return useQuery({
    queryKey: ['invitation', 'preview', token],
    queryFn: () =>
      apiFetch<InvitationPreviewResponse>('/invitations/preview', {
        method: 'POST',
        body: { token },
      }),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<AcceptInvitationResponse>('/invitations/accept', {
        method: 'POST',
        body: { token },
      }),
    onSuccess: () => refetchSession(queryClient),
  });
}
