import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../test/renderApp';
import { mockApi, type RecordedRequest } from '../test/mockApi';
import { expectNoAxeViolations } from '../test/axe';

afterEach(() => {
  vi.restoreAllMocks();
});

/** The requests that change something (the page also reads the allergy list on load). */
const changes = (requests: RecordedRequest[]) => requests.filter((r) => r.method !== 'GET');

function card(name: string) {
  return screen.getByRole('region', { name });
}

describe('FR-AUTH-004 profile page', () => {
  it('shows the e-mail and current name, and has no axe violations', async () => {
    const { container } = renderApp('/profil');
    await screen.findByRole('heading', { level: 1, name: 'Profil' });
    expect(screen.getByText('kari@example.test')).toBeInTheDocument();
    expect(screen.getByLabelText('Navn')).toHaveValue('Kari');
    await expectNoAxeViolations(container);
  });

  it('saves name and language', async () => {
    const requests = mockApi((r) =>
      r.method === 'PATCH'
        ? { status: 200, body: { ...TEST_SESSION.user, displayName: 'Kari N.' } }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/profil');
    const name = await screen.findByLabelText('Navn');
    await user.clear(name);
    await user.type(name, 'Kari N.');
    await user.click(within(card('Om deg')).getByRole('button', { name: 'Lagre' }));
    expect(await screen.findByText('Profilen er lagret')).toBeInTheDocument();
    expect(changes(requests)[0]).toMatchObject({
      method: 'PATCH',
      path: '/me',
      body: { displayName: 'Kari N.', locale: 'nb-NO' },
    });
  });

  it('password change: a wrong current password is shown at that field', async () => {
    mockApi(() => ({
      status: 400,
      body: {
        error: {
          code: 'errors.auth.wrongPassword',
          fields: { currentPassword: 'errors.auth.wrongPassword' },
        },
      },
    }));
    const user = userEvent.setup();
    renderApp('/profil');
    await user.type(await screen.findByLabelText('Nåværende passord'), 'feil passord');
    await user.type(screen.getByLabelText('Nytt passord'), 'et helt nytt passord');
    await user.click(within(card('Bytt passord')).getByRole('button', { name: 'Bytt passord' }));
    expect(await screen.findByLabelText('Nåværende passord')).toHaveAccessibleDescription(
      /Passordet er feil/,
    );
  });
});

describe('FR-AUTH-005 delete account', () => {
  it('needs both the password and the confirmation box', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    renderApp('/profil');
    await user.click(await screen.findByRole('button', { name: 'Slett kontoen for godt' }));
    const summary = within(card('Slett konto')).getByRole('alert');
    expect(summary).toHaveTextContent('Skriv inn passordet.');
    expect(summary).toHaveTextContent('Kryss av for at du forstår');
    expect(changes(requests)).toEqual([]);
  });

  it('deletes, forgets the session and goes to the login page', async () => {
    const requests = mockApi((r) => (r.method === 'DELETE' ? { status: 204 } : undefined));
    const user = userEvent.setup();
    const { router } = renderApp('/profil');
    await user.type(
      await screen.findByLabelText('Skriv inn passordet ditt for å bekrefte'),
      'riktig hest batteri',
    );
    await user.click(screen.getByLabelText(/Jeg forstår at alt slettes/));
    await user.click(screen.getByRole('button', { name: 'Slett kontoen for godt' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Logg inn' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/logg-inn');
    expect(await screen.findByText('Kontoen din er slettet.')).toBeInTheDocument();
    expect(changes(requests)[0]).toMatchObject({
      method: 'DELETE',
      path: '/me',
      body: { password: 'riktig hest batteri' },
      headers: expect.objectContaining({ 'x-csrf-token': TEST_SESSION.csrfToken }),
    });
  });
});

describe('FR-AUTH-002 log out', () => {
  it('logs out and goes to the login page – also if the request fails', async () => {
    mockApi(() => ({ status: 500, body: { error: { code: 'errors.internal' } } }));
    const user = userEvent.setup();
    const { router } = renderApp('/profil');
    await user.click(
      within(await screen.findByRole('region', { name: 'Logg ut' })).getByRole('button', {
        name: 'Logg ut',
      }),
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Logg inn' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/logg-inn');
  });
});

describe('spec 16 FR-ALG-001 the allergies moved to the settings', () => {
  it('the profile has a card that links to them', async () => {
    renderApp('/profil');
    const section = await screen.findByRole('region', { name: 'Allergier' });
    expect(within(section).getByRole('link', { name: 'Gå til allergier' })).toHaveAttribute(
      'href',
      '/innstillinger#allergier',
    );
  });
});
