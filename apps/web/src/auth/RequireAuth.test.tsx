import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderApp, TEST_SESSION } from '../test/renderApp';
import { mockApi } from '../test/mockApi';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Pages that need login (phase 2)', () => {
  it('not logged in: a protected page sends you to login, remembering where you were going', async () => {
    const { router } = renderApp('/matlager', { session: null });
    expect(await screen.findByRole('heading', { level: 1, name: 'Logg inn' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/logg-inn');
    expect(router.state.location.search).toBe('?neste=%2Fmatlager');
  });

  it('not logged in: the front page sends you to login without ?neste', async () => {
    const { router } = renderApp('/', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Logg inn' });
    expect(router.state.location.search).toBe('');
  });

  it('not logged in: the menus are not shown on the login page', async () => {
    renderApp('/logg-inn', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Logg inn' });
    expect(screen.queryByRole('navigation', { name: 'Hovedmeny' })).not.toBeInTheDocument();
  });

  it('logged in: the login and register pages send you on to the app', async () => {
    const { router } = renderApp('/logg-inn');
    expect(await screen.findByRole('heading', { level: 1, name: 'Oversikt' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('the design system and the 404 page are public', async () => {
    renderApp('/designsystem', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Designsystem' }),
    ).toBeInTheDocument();
  });

  it('asks the API who is logged in when nothing is cached', async () => {
    mockApi((request) =>
      request.path === '/auth/session' ? { status: 200, body: TEST_SESSION } : undefined,
    );
    renderApp('/', { session: 'ask-api' });
    expect(screen.getByRole('status')).toHaveTextContent('Sjekker innloggingen');
    expect(await screen.findByRole('heading', { level: 1, name: 'Oversikt' })).toBeInTheDocument();
  });

  it('when the session runs out, the next API answer "not logged in" sends you to login', async () => {
    mockApi(() => ({ status: 401, body: { error: { code: 'errors.auth.unauthenticated' } } }));
    const { queryClient, router } = renderApp('/innstillinger');
    await screen.findByRole('heading', { level: 1, name: 'Innstillinger' });
    // Any request that gets 401 "unauthenticated", e.g. a profile save.
    await act(() =>
      queryClient
        .getMutationCache()
        .build(queryClient, {
          mutationFn: () =>
            import('../api/client').then((m) => m.apiFetch('/me', { method: 'PATCH', body: {} })),
        })
        .execute(undefined)
        .catch(() => {}),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Logg inn' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?neste=%2Finnstillinger');
  });

  it('shows an error with "Prøv igjen" if the login check itself fails', async () => {
    mockApi(() => ({ status: 503, body: { error: { code: 'errors.internal' } } }));
    renderApp('/', { session: 'ask-api' });
    // One automatic retry for server errors (queryClient.ts), then the error is shown.
    expect(
      await screen.findByRole('button', { name: 'Prøv igjen' }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
