import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, isUnauthenticated } from '../api/client';

export const SESSION_KEY = ['session'] as const;

/**
 * Shared cache for server data.
 *
 * If any request answers "not logged in" (the session expired, or the user logged out or deleted the
 * account in another tab), the cached session is set to null. RequireAuth then sends the user to the
 * login page instead of showing errors on every card.
 *
 * Spec 10: a 404 can also mean that the user is no longer a member of the household (left in another tab,
 * removed by the owner, household deleted). Then the session is fetched again; it names another active
 * household, and HouseholdWatcher drops the old household's cache.
 */
export function createQueryClient() {
  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => handleError(error, query.queryKey[0] === 'household'),
    }),
    mutationCache: new MutationCache({ onError: (error) => handleError(error, true) }),
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

  /**
   * `householdData`: the request was about the active household's data. Only then can a 404 mean a lost
   * membership – and never for the session request itself, which would otherwise ask again forever.
   */
  function handleError(error: unknown, householdData: boolean) {
    if (isUnauthenticated(error)) queryClient.setQueryData(SESSION_KEY, null);
    else if (householdData && error instanceof ApiError && error.status === 404) {
      void queryClient.invalidateQueries({ queryKey: SESSION_KEY });
    }
  }

  return queryClient;
}
