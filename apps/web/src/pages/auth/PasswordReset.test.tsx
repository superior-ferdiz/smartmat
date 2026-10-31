import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';

afterEach(() => {
  vi.restoreAllMocks();
});

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6';
const NEW_PASSWORD = 'et helt nytt passord';

describe('FR-AUTH-006a "Glemt passord"', () => {
  it('the login page links to it', async () => {
    const user = userEvent.setup();
    renderApp('/logg-inn', { session: null });
    await user.click(await screen.findByRole('link', { name: 'Glemt passordet?' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Glemt passord' }),
    ).toBeInTheDocument();
  });

  it('has a labelled e-mail field and no axe violations', async () => {
    const { container } = renderApp('/glemt-passord', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Glemt passord' });
    expect(screen.getByLabelText('E-postadresse')).toHaveAttribute('autocomplete', 'username');
    await expectNoAxeViolations(container);
  });

  it('an invalid address is caught before anything is sent', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    renderApp('/glemt-passord', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'ikke en adresse');
    await user.click(screen.getByRole('button', { name: 'Send lenke' }));
    expect(screen.getByRole('alert', { name: /1 feil/ })).toHaveFocus();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('sends the address and says "if the address has an account", whatever the answer means', async () => {
    const requests = mockApi((r) =>
      r.path === '/auth/password-reset' ? { status: 202, body: undefined } : undefined,
    );
    const user = userEvent.setup();
    renderApp('/glemt-passord', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), ' Kari@Example.test ');
    await user.click(screen.getByRole('button', { name: 'Send lenke' }));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/Hvis adressen har en konto, har vi sendt en lenke/);
    expect(status).toHaveTextContent(/30 minutter/);
    expect(requests.find((r) => r.path === '/auth/password-reset')?.body).toEqual({
      email: 'kari@example.test',
    });
    await user.click(screen.getByRole('button', { name: 'Send en ny lenke' }));
    expect(screen.getByLabelText('E-postadresse')).toBeInTheDocument();
  });

  it('FR-AUTH-006e: says so when e-mail is not set up on the server', async () => {
    mockApi(() => ({
      status: 503,
      body: { error: { code: 'errors.auth.passwordResetUnavailable' } },
    }));
    const user = userEvent.setup();
    renderApp('/glemt-passord', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.click(screen.getByRole('button', { name: 'Send lenke' }));
    expect(await screen.findByText(/ikke tilgjengelig på denne serveren/)).toBeInTheDocument();
  });

  it('someone logged in is sent on (they change the password on the profile page)', async () => {
    renderApp('/glemt-passord', { session: TEST_SESSION });
    expect(await screen.findByRole('heading', { level: 1, name: 'Oversikt' })).toBeInTheDocument();
  });
});

describe('FR-AUTH-006b/c the page the link opens', () => {
  it('two labelled password fields with new-password autocomplete, and no axe violations', async () => {
    const { container } = renderApp(`/nytt-passord#${TOKEN}`, { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Velg nytt passord' });
    expect(screen.getByLabelText('Nytt passord')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Gjenta nytt passord')).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
    await expectNoAxeViolations(container);
  });

  it('without a token in the link: asks for a new link, no form', async () => {
    renderApp('/nytt-passord', { session: null });
    expect(await screen.findByText(/Lenken mangler eller er ufullstendig/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Be om en ny lenke' })).toHaveAttribute(
      'href',
      '/glemt-passord',
    );
    expect(screen.queryByLabelText('Nytt passord')).not.toBeInTheDocument();
  });

  it('too short or not the same: field errors, nothing sent', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    renderApp(`/nytt-passord#${TOKEN}`, { session: null });
    await user.type(await screen.findByLabelText('Nytt passord'), 'kort');
    await user.click(screen.getByRole('button', { name: 'Lagre nytt passord' }));
    expect(screen.getByLabelText('Nytt passord')).toHaveAccessibleDescription(/minst 12 tegn/);
    await user.clear(screen.getByLabelText('Nytt passord'));
    await user.type(screen.getByLabelText('Nytt passord'), NEW_PASSWORD);
    await user.type(screen.getByLabelText('Gjenta nytt passord'), `${NEW_PASSWORD}x`);
    await user.click(screen.getByRole('button', { name: 'Lagre nytt passord' }));
    expect(screen.getByLabelText('Gjenta nytt passord')).toHaveAccessibleDescription(
      /Passordene er ikke like/,
    );
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it('sends the token from the fragment in the body, and then sends the person to log in', async () => {
    const requests = mockApi((r) =>
      r.path === '/auth/password-reset/confirm' ? { status: 204, body: undefined } : undefined,
    );
    const user = userEvent.setup();
    renderApp(`/nytt-passord#${TOKEN}`, { session: null });
    await user.type(await screen.findByLabelText('Nytt passord'), NEW_PASSWORD);
    await user.type(screen.getByLabelText('Gjenta nytt passord'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Lagre nytt passord' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Passordet er endret/);
    const sent = requests.find((r) => r.path === '/auth/password-reset/confirm');
    expect(sent?.body).toEqual({ token: TOKEN, newPassword: NEW_PASSWORD });
    // Never in a URL the server sees.
    expect(requests.some((r) => r.path.includes(TOKEN))).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Logg inn' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Logg inn' })).toBeInTheDocument();
  });

  it('a dead link (used, old or replaced): says so and offers a new one', async () => {
    mockApi(() => ({ status: 400, body: { error: { code: 'errors.auth.resetLinkInvalid' } } }));
    const user = userEvent.setup();
    renderApp(`/nytt-passord#${TOKEN}`, { session: null });
    await user.type(await screen.findByLabelText('Nytt passord'), NEW_PASSWORD);
    await user.type(screen.getByLabelText('Gjenta nytt passord'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Lagre nytt passord' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Lenken virker ikke lenger/);
    expect(screen.getByRole('link', { name: 'Be om en ny lenke' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Nytt passord')).not.toBeInTheDocument();
  });

  it('FR-AUTH-008: a leaked password lands on the field', async () => {
    mockApi(() => ({
      status: 400,
      body: {
        error: {
          code: 'errors.validation',
          fields: { newPassword: 'errors.auth.passwordPwned' },
        },
      },
    }));
    const user = userEvent.setup();
    renderApp(`/nytt-passord#${TOKEN}`, { session: null });
    await user.type(await screen.findByLabelText('Nytt passord'), NEW_PASSWORD);
    await user.type(screen.getByLabelText('Gjenta nytt passord'), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Lagre nytt passord' }));
    await screen.findByRole('alert', { name: /1 feil/ });
    expect(screen.getByLabelText('Nytt passord')).toHaveAccessibleDescription(
      /finnes i kjente datalekkasjer/,
    );
  });
});
