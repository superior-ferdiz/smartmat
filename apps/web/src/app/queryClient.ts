import { QueryClient } from '@tanstack/react-query';

/**
 * Shared cache for server data. Not used by any page yet (phase 1 has no API); set up now so
 * phase 2+ can add queries without touching the app shell.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: true,
      },
    },
  });
}
