import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, isUnauthenticated } from '../api/client';

export const SESSION_KEY = ['session'] as const;

/**
 * Shared cache for server data.
 *
 * If any request answers "not logged in" (the session expired, or the user logged out or deleted the
 * account in another tab), the cached session is set to null. RequireAuth then sends the user to the
 * login page instead of showing errors on every card.
 */
export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleError }),
    mutationCache: new MutationCache({ onError: handleError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A 4xx will not get better by asking again; network errors and 5xx get one retry.
        retry: (failureCount, error) =>
          failureCount < 1 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: true,
      },
    },
  });

  function handleError(error: unknown) {
    if (isUnauthenticated(error)) queryClient.setQueryData(SESSION_KEY, null);
  }

  return queryClient;
}
