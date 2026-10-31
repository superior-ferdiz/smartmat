import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountSessionsResponse,
  BackupStatusResponse,
  LoginNoticesResponse,
  RecoveryCodesResponse,
  TwoFactorConfirmInput,
  TwoFactorEnableInput,
  TwoFactorSetupInput,
  TwoFactorSetupResponse,
  TwoFactorStatus,
} from '@smartmat/shared';
import { apiFetch } from '../api/client';

/*
 * Spec 13: the user's own sessions (FR-AUTH-009) and the backup status (NFR-OPS-003). Under ['me', …], not
 * ['household', …]: they belong to the user, and switching household changes nothing here.
 */

export const SESSIONS_KEY = ['me', 'sessions'] as const;
export const LOGIN_NOTICES_KEY = ['me', 'login-notices'] as const;
/** Where "Last ned mine data" points (FR-PRIV-001): a plain link, so the browser downloads the file itself. */
export const EXPORT_URL = '/api/v1/me/export';

export function useSessions() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => apiFetch<AccountSessionsResponse>('/me/sessions'),
  });
}

function useRefetchSessions() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    void queryClient.invalidateQueries({ queryKey: LOGIN_NOTICES_KEY });
  };
}

export function useEndSession() {
  const refetch = useRefetchSessions();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<void>(`/me/sessions/${sessionId}`, { method: 'DELETE' }),
    onSettled: refetch,
  });
}

export function useEndOtherSessions() {
  const refetch = useRefetchSessions();
  return useMutation({
    mutationFn: () => apiFetch<{ ended: number }>('/me/sessions/end-others', { method: 'POST' }),
    onSettled: refetch,
  });
}

/** Asked again when the window gets focus (TanStack's default) and every 5 minutes. */
export function useLoginNotices(enabled: boolean) {
  return useQuery({
    queryKey: LOGIN_NOTICES_KEY,
    queryFn: () => apiFetch<LoginNoticesResponse>('/me/login-notices'),
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

export function useDismissLoginNotice() {
  const refetch = useRefetchSessions();
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<void>(`/me/login-notices/${sessionId}/dismiss`, { method: 'POST' }),
    onSettled: refetch,
  });
}

export function useBackupStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['ops', 'backup'],
    queryFn: () => apiFetch<BackupStatusResponse>('/ops/backup'),
    enabled,
    staleTime: 10 * 60_000,
  });
}

/* Spec 13 (FR-AUTH-010): two-factor login. */

export const TWO_FACTOR_KEY = ['me', 'two-factor'] as const;

export function useTwoFactorStatus() {
  return useQuery({
    queryKey: TWO_FACTOR_KEY,
    queryFn: () => apiFetch<TwoFactorStatus>('/me/two-factor'),
  });
}

export function useTwoFactorSetup() {
  return useMutation({
    mutationFn: (input: TwoFactorSetupInput) =>
      apiFetch<TwoFactorSetupResponse>('/me/two-factor/setup', { method: 'POST', body: input }),
  });
}

function useTwoFactorChange<I, O>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: I) => apiFetch<O>(path, { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: TWO_FACTOR_KEY }),
  });
}

export const useTwoFactorEnable = () =>
  useTwoFactorChange<TwoFactorEnableInput, RecoveryCodesResponse>('/me/two-factor/enable');
export const useTwoFactorDisable = () =>
  useTwoFactorChange<TwoFactorConfirmInput, void>('/me/two-factor/disable');
export const useNewRecoveryCodes = () =>
  useTwoFactorChange<TwoFactorConfirmInput, RecoveryCodesResponse>('/me/two-factor/recovery-codes');
