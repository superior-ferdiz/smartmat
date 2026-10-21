import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { changeLocale } from '../../i18n';

afterEach(() => {
  vi.restoreAllMocks();
});

async function fill(user: ReturnType<typeof userEvent.setup>, password = 'riktig hest batteri') {
  await user.type(await screen.findByLabelText('Navn'), 'Kari');
  await user.type(screen.getByLabelText('E-postadresse'), 'kari@example.test');
  await user.type(screen.getByLabelText('Passord'), password);
  await user.click(screen.getByRole('button', { name: 'Opprett konto' }));
}

describe('FR-AUTH-001 registration page', () => {
  it('has no axe violations and tells the password rule up front', async () => {
    const { container } = renderApp('/registrer', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Opprett konto' });
    expect(screen.getByLabelText('Passord')).toHaveAccessibleDescription(/Minst 12 tegn/);
    expect(screen.getByLabelText('Passord')).toHaveAttribute('autocomplete', 'new-password');
    await expectNoAxeViolations(container);
  });

  it('a short password is stopped in the browser with the same rule as the server', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    renderApp('/registrer', { session: null });
    await fill(user, 'kort');
    expect(screen.getByLabelText('Passord')).toHaveAccessibleDescription(/må være minst 12 tegn/);
    expect(requests).toEqual([]);
  });

  it('e-mail already registered: the message is shown at the e-mail field', async () => {
    mockApi(() => ({
      status: 409,
      body: {
        error: { code: 'errors.auth.emailTaken', fields: { email: 'errors.auth.emailTaken' } },
      },
    }));
    const user = userEvent.setup();
    renderApp('/registrer', { session: null });
    await fill(user);
    expect(await screen.findByLabelText('E-postadresse')).toHaveAccessibleDescription(
      /finnes allerede en konto/,
    );
  });

  it('success: sends the chosen language and opens the app', async () => {
    const requests = mockApi(() => ({ status: 201, body: TEST_SESSION }));
    const user = userEvent.setup();
    const { router } = renderApp('/registrer', { session: null });
    await fill(user);
    expect(await screen.findByRole('heading', { level: 1, name: 'Oversikt' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/auth/register',
      body: { displayName: 'Kari', email: 'kari@example.test', locale: 'nb-NO' },
    });
  });

  it('the language can be chosen before registering', async () => {
    await changeLocale('en');
    renderApp('/registrer', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Create an account' }),
    ).toBeInTheDocument();
  });
});
