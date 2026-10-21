import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactElement } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { SessionResponse } from '@smartmat/shared';
import { Providers } from '../app/Providers';
import { createQueryClient } from '../app/queryClient';
import { routes } from '../app/routes';
import { setSession } from '../auth/session';
import { defaultApi, mockApi } from './mockApi';

export const TEST_SESSION: SessionResponse = {
  user: {
    id: '0199f0a0-0000-7000-8000-000000000001',
    email: 'kari@example.test',
    displayName: 'Kari',
    locale: 'nb-NO',
    householdId: '0199f0a0-0000-7000-8000-000000000002',
  },
  csrfToken: 'test-csrf-token',
};

export interface RenderAppOptions {
  /**
   * The logged-in session, or null for "not logged in". Default: logged in as TEST_SESSION.
   * 'ask-api': nothing in the cache, so the app asks GET /auth/session like on a real page load.
   */
  session?: SessionResponse | null | 'ask-api';
}

/**
 * Renders the whole app (shell + routes) at the given path, like the browser would.
 * The session is put in the cache up front, so pages render without a real API.
 */
export function renderApp(path = '/', { session = TEST_SESSION }: RenderAppOptions = {}) {
  // Pages fetch data now (phase 3). Unless the test mocked the API itself, answer with empty defaults.
  if (!vi.isMockFunction(globalThis.fetch)) mockApi(defaultApi);
  const queryClient = createQueryClient();
  if (session !== 'ask-api') setSession(queryClient, session);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <Providers queryClient={queryClient}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...result, router, queryClient };
}

/** Renders a single component with the app providers (toasts, query client). */
export function renderWithProviders(ui: ReactElement, queryClient?: QueryClient) {
  return render(<Providers queryClient={queryClient}>{ui}</Providers>);
}
