import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type {
  ChangePasswordInput,
  DeleteAccountInput,
  LoginInput,
  RegisterInput,
  SessionResponse,
  SessionUser,
  UpdateProfileInput,
} from '@smartmat/shared';
import { apiFetch, ApiError, setCsrfToken } from '../api/client';
import { changeLocale } from '../i18n';
import { LOGIN_PATH } from '../app/navigation';
import { SESSION_KEY } from '../app/queryClient';

/*
 * Who is logged in. The server is the only source of truth (ADR-0005): the browser cannot read the
 * session cookie, so it asks GET /auth/session. The answer is cached by TanStack Query under one key;
 * `null` means "not logged in".
 */

export const SESSION_QUERY_KEY = SESSION_KEY;

async function fetchSession(): Promise<SessionResponse | null> {
  try {
    const session = await apiFetch<SessionResponse>('/auth/session');
    setCsrfToken(session.csrfToken);
    // The language belongs to the account (FR-AUTH-004): a choice made on another device applies here too.
    await changeLocale(session.user.locale);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw error;
  }
}

export function useSession() {
  return useQuery({ queryKey: SESSION_QUERY_KEY, queryFn: fetchSession, staleTime: 5 * 60_000 });
}

/** The logged-in user. Only for components inside RequireAuth. */
export function useCurrentUser(): SessionUser {
  const { data } = useSession();
  if (!data) throw new Error('useCurrentUser used outside RequireAuth');
  return data.user;
}

export function setSession(queryClient: QueryClient, session: SessionResponse | null) {
  setCsrfToken(session?.csrfToken ?? null);
  queryClient.setQueryData(SESSION_QUERY_KEY, session);
}

/** After login or registration: remember the session and switch to the account's language. */
async function startSession(queryClient: QueryClient, session: SessionResponse) {
  setSession(queryClient, session);
  await changeLocale(session.user.locale);
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<SessionResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (session) => startSession(queryClient, session),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      apiFetch<SessionResponse>('/auth/register', { method: 'POST', body: input }),
    onSuccess: (session) => startSession(queryClient, session),
  });
}

/** Ends the session and forgets all cached data, so nothing of this user is left in memory. */
function useEndSession() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    await navigate(LOGIN_PATH, { replace: true });
    queryClient.clear();
    setSession(queryClient, null);
  };
}

export function useLogout() {
  const endSession = useEndSession();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    // Logged out locally even if the request failed: the user asked to leave this device.
    onSettled: endSession,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) =>
      apiFetch<SessionUser>('/me', { method: 'PATCH', body: input }),
    onSuccess: async (user) => {
      queryClient.setQueryData<SessionResponse | null>(SESSION_QUERY_KEY, (old) =>
        old ? { ...old, user } : old,
      );
      await changeLocale(user.locale);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch<void>('/me/password', { method: 'POST', body: input }),
  });
}

export function useDeleteAccount() {
  const endSession = useEndSession();
  return useMutation({
    mutationFn: (input: DeleteAccountInput) =>
      apiFetch<void>('/me', { method: 'DELETE', body: input }),
    onSuccess: endSession,
  });
}
