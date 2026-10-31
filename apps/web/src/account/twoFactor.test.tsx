import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../test/renderApp';
import { mockApi } from '../test/mockApi';
import { expectNoAxeViolations } from '../test/axe';

/* Spec 13 (FR-AUTH-010) in the web app: the code step at login, and turning two-factor on and off on the profile. */

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const CODES = ['ABCDE-FGHJK', 'MNPQR-STUVW', '23456-789AB'];

describe('FR-AUTH-010 login with a code', () => {
  it('the right password gives the code step (focus on the field); the code logs in', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/auth/login') {
        return { status: 200, body: { twoFactorRequired: true, challenge: 'utfordring-1' } };
      }
      if (r.path === '/auth/login/two-factor') return { status: 200, body: TEST_SESSION };
      return undefined;
    });
    const user = userEvent.setup();
    const { container } = renderApp('/logg-inn', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'riktig hest batteri');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    const field = await screen.findByLabelText('Kode');
    expect(screen.getByRole('heading', { level: 1, name: 'Skriv inn koden' })).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    await expectNoAxeViolations(container);
    await user.type(field, '123 456');
    await user.click(screen.getByRole('button', { name: 'Bekreft' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Oversikt' })).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/auth/login/two-factor')?.body).toEqual({
      challenge: 'utfordring-1',
      code: '123 456',
    });
  });

  it('a wrong code: the message at the field; a lost challenge: back to the first step with a message', async () => {
    let attempts = 0;
    mockApi((r) => {
      if (r.path === '/auth/login') {
        return { status: 200, body: { twoFactorRequired: true, challenge: 'utfordring-1' } };
      }
      if (r.path === '/auth/login/two-factor') {
        attempts++;
        return attempts === 1
          ? {
              status: 401,
              body: {
                error: {
                  code: 'errors.auth.twoFactorInvalid',
                  fields: { code: 'errors.auth.twoFactorInvalid' },
                },
              },
            }
          : { status: 401, body: { error: { code: 'errors.auth.twoFactorChallengeInvalid' } } };
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/logg-inn', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'riktig hest batteri');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    await user.type(await screen.findByLabelText('Kode'), '111111');
    await user.click(screen.getByRole('button', { name: 'Bekreft' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Kode')).toHaveAccessibleDescription(/Koden stemmer ikke/),
    );
    await user.type(screen.getByLabelText('Kode'), '222222');
    await user.click(screen.getByRole('button', { name: 'Bekreft' }));
    expect(await screen.findByText(/Innloggingen tok for lang tid/)).toBeInTheDocument();
    expect(screen.getByLabelText('Passord')).toHaveValue('');
  });

  it('the code field checks the format first (no request for "abc")', async () => {
    const requests = mockApi((r) =>
      r.path === '/auth/login'
        ? { status: 200, body: { twoFactorRequired: true, challenge: 'utfordring-1' } }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/logg-inn', { session: null });
    await user.type(await screen.findByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'riktig hest batteri');
    await user.click(screen.getByRole('button', { name: 'Logg inn' }));
    await user.type(await screen.findByLabelText('Kode'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Bekreft' }));
    expect(screen.getByLabelText('Kode')).toHaveAccessibleDescription(/6 sifre fra appen, eller/);
    expect(requests.some((r) => r.path === '/auth/login/two-factor')).toBe(false);
  });
});

describe('FR-AUTH-010 the profile card', () => {
  it('turning on: password → key for the app → code → recovery codes shown once', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/me/two-factor/setup') {
        return {
          status: 200,
          body: { secret: SECRET, otpauthUri: `otpauth://totp/SmartMat:kari?secret=${SECRET}` },
        };
      }
      if (r.path === '/me/two-factor/enable')
        return { status: 200, body: { recoveryCodes: CODES } };
      return undefined;
    });
    const user = userEvent.setup();
    const { container } = renderApp('/profil');
    const card = await screen.findByRole('region', { name: 'Tofaktorinnlogging' });
    await user.click(
      await within(card).findByRole('button', { name: 'Slå på tofaktorinnlogging' }),
    );
    await user.type(within(card).getByLabelText('Passord'), 'riktig hest batteri');
    await user.click(within(card).getByRole('button', { name: 'Fortsett' }));
    expect(await within(card).findByLabelText('Nøkkel til autentiseringsappen')).toHaveTextContent(
      'JBSW Y3DP EHPK 3PXP',
    );
    expect(
      within(card).getByRole('link', { name: 'Eller åpne den direkte i appen på denne telefonen' }),
    ).toHaveAttribute('href', expect.stringMatching(/^otpauth:\/\/totp\//));
    await expectNoAxeViolations(container);
    await user.type(within(card).getByLabelText('Kode'), '123456');
    await user.click(within(card).getByRole('button', { name: 'Slå på' }));
    const list = await within(card).findByRole('list', {
      name: 'Ta vare på gjenopprettingskodene',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(CODES);
    expect(requests.find((r) => r.path === '/me/two-factor/setup')?.body).toEqual({
      password: 'riktig hest batteri',
    });
    await user.click(within(card).getByRole('button', { name: 'Jeg har tatt vare på kodene' }));
    expect(within(card).queryByText('ABCDE-FGHJK')).not.toBeInTheDocument();
  });

  it('on: shows how many recovery codes are left; turning off needs password and code', async () => {
    let enabled = true;
    const requests = mockApi((r) => {
      if (r.path === '/me/two-factor' && r.method === 'GET') {
        return {
          status: 200,
          body: { available: true, enabled, recoveryCodesLeft: enabled ? 7 : 0 },
        };
      }
      if (r.path === '/me/two-factor/disable') {
        enabled = false;
        return { status: 204 };
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/profil');
    const card = await screen.findByRole('region', { name: 'Tofaktorinnlogging' });
    expect(
      await within(card).findByText('På. Du har 7 ubrukte gjenopprettingskoder.'),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Slå av' }));
    await user.type(within(card).getByLabelText('Passord'), 'riktig hest batteri');
    await user.type(within(card).getByLabelText('Kode'), '654321');
    await user.click(within(card).getByRole('button', { name: 'Slå av' }));
    expect(await screen.findByText('Tofaktorinnlogging er slått av.')).toBeInTheDocument();
    expect(requests.find((r) => r.path === '/me/two-factor/disable')?.body).toEqual({
      password: 'riktig hest batteri',
      code: '654321',
    });
  });

  it('without the server key: says it is not available, and offers nothing', async () => {
    mockApi((r) =>
      r.path === '/me/two-factor'
        ? { status: 200, body: { available: false, enabled: false, recoveryCodesLeft: 0 } }
        : undefined,
    );
    renderApp('/profil');
    const card = await screen.findByRole('region', { name: 'Tofaktorinnlogging' });
    expect(
      await within(card).findByText('Tofaktorinnlogging er ikke tilgjengelig på denne serveren.'),
    ).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
  });
});
