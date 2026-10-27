import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/renderApp';
import { mockApi, THIS_SESSION } from '../test/mockApi';
import { expectNoAxeViolations } from '../test/axe';
import { changeLocale, i18n } from '../i18n';

/*
 * Spec 13 in the web app: active sessions and the notice about new logins (FR-AUTH-009), the data export
 * (FR-PRIV-001), the privacy notice (FR-PRIV-003), the backup banner (NFR-OPS-003), leaked passwords
 * (FR-AUTH-008) and English loaded on demand (NFR-PERF-001).
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

const PHONE = {
  id: '0199f0a0-0000-7000-8000-0000000005e2',
  browser: 'safari',
  os: 'ios',
  createdAt: '2026-10-21T12:02:00.000Z',
  lastSeenAt: '2026-10-21T12:30:00.000Z',
  current: false,
} as const;

describe('FR-AUTH-009 where you are logged in (profile)', () => {
  it('lists this device and the others with browser and system; no axe violations', async () => {
    mockApi((r) =>
      r.path === '/me/sessions'
        ? { status: 200, body: { items: [THIS_SESSION, PHONE] } }
        : undefined,
    );
    const { container } = renderApp('/profil');
    const card = await screen.findByRole('region', { name: 'Hvor du er logget inn' });
    expect(await within(card).findByText('Safari på iPhone eller iPad')).toBeInTheDocument();
    expect(within(card).getByText(/Firefox på Linux/)).toBeInTheDocument();
    expect(within(card).getByText('Denne enheten')).toBeInTheDocument();
    // Only the other device has a log-out button, named after it.
    expect(within(card).getAllByRole('button', { name: /^Logg ut (?!alle)/ })).toHaveLength(1);
    expect(
      within(card).getByRole('button', { name: 'Logg ut Safari på iPhone eller iPad' }),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('"Logg ut" for another device sends DELETE for that session and says so', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/me/sessions') return { status: 200, body: { items: [THIS_SESSION, PHONE] } };
      if (r.method === 'DELETE') return { status: 204 };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/profil');
    await user.click(
      await screen.findByRole('button', { name: 'Logg ut Safari på iPhone eller iPad' }),
    );
    expect(await screen.findByText('Enheten er logget ut.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'DELETE')?.path).toBe(`/me/sessions/${PHONE.id}`);
  });

  it('"Logg ut alle andre enheter" only when there are others, and reports how many', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/me/sessions') return { status: 200, body: { items: [THIS_SESSION, PHONE] } };
      if (r.path === '/me/sessions/end-others') return { status: 200, body: { ended: 1 } };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/profil');
    await user.click(await screen.findByRole('button', { name: 'Logg ut alle andre enheter' }));
    expect(await screen.findByText('1 annen enhet er logget ut.')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST' && r.path === '/me/sessions/end-others')).toBe(
      true,
    );
  });

  it('only this device: no "log out all others"', async () => {
    renderApp('/profil');
    await screen.findByText('Denne enheten');
    expect(
      screen.queryByRole('button', { name: 'Logg ut alle andre enheter' }),
    ).not.toBeInTheDocument();
  });
});

describe('FR-AUTH-009 notice about a new login', () => {
  const notice = { sessionId: PHONE.id, browser: 'safari', os: 'ios', createdAt: PHONE.createdAt };

  it('is shown above the page with the device, "Det var meg" and a link to the session list', async () => {
    mockApi((r) =>
      r.path === '/me/login-notices' ? { status: 200, body: { items: [notice] } } : undefined,
    );
    const { container } = renderApp('/matlager');
    expect(await screen.findByText('Ny innlogging på kontoen din.')).toBeInTheDocument();
    expect(screen.getByText(/Safari på iPhone eller iPad, 21\. okt\./)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Var det ikke deg? Se hvor du er logget inn' }),
    ).toHaveAttribute('href', '/profil#profile-sessions');
    await expectNoAxeViolations(container);
  });

  it('"Det var meg" posts the dismissal for that session, and the notice goes away', async () => {
    let items = [notice];
    const requests = mockApi((r) => {
      if (r.path === '/me/login-notices') return { status: 200, body: { items } };
      if (r.path.endsWith('/dismiss')) {
        items = [];
        return { status: 204 };
      }
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Det var meg' }));
    await waitFor(() =>
      expect(screen.queryByText('Ny innlogging på kontoen din.')).not.toBeInTheDocument(),
    );
    expect(requests.find((r) => r.method === 'POST')?.path).toBe(
      `/me/login-notices/${PHONE.id}/dismiss`,
    );
  });

  it('logged out: nothing is asked', async () => {
    const requests = mockApi(() => undefined);
    renderApp('/logg-inn', { session: null });
    await screen.findByRole('heading', { level: 1, name: 'Logg inn' });
    expect(requests.some((r) => r.path === '/me/login-notices')).toBe(false);
  });
});

describe('FR-PRIV-001 and FR-PRIV-003 export and privacy notice', () => {
  it('the profile has a download link to the export and a link to the privacy notice', async () => {
    renderApp('/profil');
    const card = await screen.findByRole('region', { name: 'Last ned dataene dine' });
    const link = within(card).getByRole('link', { name: 'Last ned mine data' });
    expect(link).toHaveAttribute('href', '/api/v1/me/export');
    expect(link).toHaveAttribute('download');
    expect(within(card).getByRole('link', { name: 'Les personvernerklæringen' })).toHaveAttribute(
      'href',
      '/personvern',
    );
  });

  it('the privacy notice opens without logging in, says it is a draft and has no axe violations', async () => {
    mockApi(() => undefined);
    const { container } = renderApp('/personvern', { session: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Personvernerklæring' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Utkast\. Teksten er skrevet med hjelp av KI/)).toBeInTheDocument();
    expect(screen.getByText(/kontaktadresse er ikke fylt inn ennå/)).toBeInTheDocument();
    for (const heading of [
      'Hva vi lagrer',
      'Hvem som får noe',
      'Hvor lenge',
      'Rettighetene dine',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    }
    expect(screen.getByText(/Datatilsynet/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('the login page links to the privacy notice (before an account is made)', async () => {
    mockApi(() => undefined);
    renderApp('/registrer', { session: null });
    expect(await screen.findByRole('link', { name: 'Personvern' })).toHaveAttribute(
      'href',
      '/personvern',
    );
  });
});

describe('NFR-OPS-003 backup banner (test environment only)', () => {
  it.each([
    ['stale', 'Sikkerhetskopien er for gammel.'],
    ['failed', 'Sikkerhetskopien feilet.'],
    ['unknown', 'Vi vet ikke om sikkerhetskopien virker.'],
  ])('staging, state %s: the banner says so and asks to tell the team', async (state, text) => {
    vi.stubEnv('VITE_SMARTMAT_ENVIRONMENT', 'staging');
    mockApi((r) =>
      r.path === '/ops/backup'
        ? { status: 200, body: { state, newestBackupAt: '2026-10-19T00:30:00.000Z' } }
        : undefined,
    );
    renderApp('/');
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText(/Nyeste kopi: 19\. okt\..*Si fra til teamet\./)).toBeInTheDocument();
  });

  it('staging and ok: no banner; locally: the status is not even asked for', async () => {
    vi.stubEnv('VITE_SMARTMAT_ENVIRONMENT', 'staging');
    mockApi((r) =>
      r.path === '/ops/backup'
        ? { status: 200, body: { state: 'ok', newestBackupAt: '2026-10-20T00:30:00.000Z' } }
        : undefined,
    );
    const staging = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Oversikt' });
    expect(screen.queryByText(/Sikkerhetskopien/)).not.toBeInTheDocument();
    staging.unmount();

    vi.unstubAllEnvs();
    const requests = mockApi(() => undefined);
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Oversikt' });
    expect(requests.some((r) => r.path === '/ops/backup')).toBe(false);
  });
});

describe('FR-AUTH-008 leaked password', () => {
  it('registration: the message is shown at the password field', async () => {
    mockApi(() => ({
      status: 400,
      body: {
        error: {
          code: 'errors.auth.passwordPwned',
          fields: { password: 'errors.auth.passwordPwned' },
        },
      },
    }));
    const user = userEvent.setup();
    renderApp('/registrer', { session: null });
    await user.type(await screen.findByLabelText('Navn'), 'Kari');
    await user.type(screen.getByLabelText('E-postadresse'), 'kari@example.test');
    await user.type(screen.getByLabelText('Passord'), 'passord passord');
    await user.click(screen.getByRole('button', { name: 'Opprett konto' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Passord')).toHaveAccessibleDescription(
        /finnes i kjente datalekkasjer/,
      ),
    );
  });
});

describe('NFR-PERF-001 English is loaded when chosen', () => {
  it('switching to English loads its texts; Norwegian is there from the start', async () => {
    expect(i18n.hasResourceBundle('nb-NO', 'translation')).toBe(true);
    await changeLocale('en');
    expect(i18n.hasResourceBundle('en', 'translation')).toBe(true);
    expect(i18n.t('pages.privacy.title')).toBe('Privacy notice');
  });
});
