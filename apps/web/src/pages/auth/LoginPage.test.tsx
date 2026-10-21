import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FR-AUTH-002 login page', () => {
  it('has labelled fields with the right autocomplete, and no axe violations', async () => {
    const { container } = renderApp('/logg-inn', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Logg inn' });
    expect(screen.getByLabelText('E-postadresse')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Passord')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByLabelText('Passord')).toHaveAttribute('type', 'password');
    await expectNoAxeViolations(container);
  });

  it('empty submit: errors from the shared schema, nothing sent', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    renderApp('/logg-inn', { session: null });
    await user.click(await screen.findByRole('button', { name: 'Logg inn' }));
    expect(screen.getByRole('alert', { name: /2 feil/ })).toHaveFocus();
    expect(screen.getByLabelText('E-postadresse')).toHaveAccessibleDescription(
      /Skriv inn e-postadressen din/,
    );
    expect(requests).toEqual([]);
  });

  it('wrong password: one general message, the password is cleared', async () => {
    mockApi(() => ({ status: 401, body: { error: { code: 'errors.auth.invalidCredentials' } } }));
    const user = userEvent.setup();
    renderApp('/logg-inn', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'feil passord');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    expect(await screen.findByText(/Feil e-postadresse eller passord/)).toBeInTheDocument();
    expect(screen.getByLabelText('Passord')).toHaveValue('');
    expect(screen.getByLabelText('E-postadresse')).toHaveValue('kari@example.test');
  });

  it('too many attempts: says so', async () => {
    mockApi(() => ({ status: 429, body: { error: { code: 'errors.rateLimited' } } }));
    const user = userEvent.setup();
    renderApp('/logg-inn', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'et passord');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    expect(await screen.findByText(/For mange forsøk/)).toBeInTheDocument();
  });

  it('success: goes to the page in ?neste and uses the account language', async () => {
    const requests = mockApi((r) =>
      r.path === '/auth/login'
        ? { status: 200, body: { ...TEST_SESSION, user: { ...TEST_SESSION.user, locale: 'en' } } }
        : undefined,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/logg-inn?neste=%2Fhandleliste', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), ' Kari@Example.test ');
    await user.type(screen.getByLabelText('Passord'), 'riktig hest batteri');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Shopping list' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/handleliste');
    expect(requests[0]?.headers.origin).toBeUndefined(); // the browser adds Origin itself
  });

  it('?neste pointing to another site is ignored', async () => {
    mockApi(() => ({ status: 200, body: TEST_SESSION }));
    const user = userEvent.setup();
    const { router } = renderApp('/logg-inn?neste=%2F%2Fevil.example', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'riktig hest batteri');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    await screen.findByRole('heading', { level: 1, name: 'Oversikt' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('links to registration, keeping ?neste', async () => {
    renderApp('/logg-inn?neste=%2Fmatlager', { session: null });
    expect(await screen.findByRole('link', { name: 'Opprett konto' })).toHaveAttribute(
      'href',
      '/registrer?neste=%2Fmatlager',
    );
  });
});
