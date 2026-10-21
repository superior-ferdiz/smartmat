import { expectNoAxeViolations, expectNoHorizontalScroll } from './checks';
import {
  BASE_URL,
  expect,
  LOGGED_OUT,
  loginAccount,
  PASSWORD,
  registerAccount,
  test,
  uniqueEmail,
} from './fixtures';

/*
 * Phase 2 end-to-end tests: registration, login, logout, profile and account deletion through the real
 * UI, the real API and a real database (smartmat_e2e). IDs: FR-AUTH-001–005, NFR-SEC-003, NFR-SEC-005.
 */

test.describe('logged out', () => {
  test.use({ storageState: LOGGED_OUT });

  test('FR-AUTH-001/002: register → log out → log in → log out', async ({ page, context }) => {
    const email = uniqueEmail('flyt');

    // Register
    await page.goto('/registrer');
    await page.getByLabel('Navn').fill('Kari');
    await page.getByLabel('E-postadresse').fill(email);
    await page.getByLabel('Passord').fill(PASSWORD);
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();

    // NFR-SEC-003: the session cookie is HttpOnly, Secure and SameSite=Lax, and invisible to JavaScript.
    const cookie = (await context.cookies()).find((c) => c.name === 'smartmat_session');
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('smartmat_session');

    // Log out (from Innstillinger)
    await page.goto('/innstillinger');
    await expect(page.getByText(`Logget inn som Kari (${email}).`)).toBeVisible();
    await page.getByRole('button', { name: 'Logg ut' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();

    // Log in again
    await page.getByLabel('E-postadresse').fill(email);
    await page.getByLabel('Passord').fill(PASSWORD);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();

    // Log out again (from the profile page)
    await page.goto('/profil');
    await page
      .getByRole('region', { name: 'Logg ut' })
      .getByRole('button', { name: 'Logg ut' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === 'smartmat_session')).toBeUndefined();
  });

  test('a protected page leads to login and back there afterwards', async ({
    page,
    playwright,
  }) => {
    const account = await registerAccount(playwright, 'neste');
    await page.goto('/handleliste');
    await expect(page).toHaveURL(/\/logg-inn\?neste=%2Fhandleliste$/);
    await page.getByLabel('E-postadresse').fill(account.email);
    await page.getByLabel('Passord').fill(PASSWORD);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page).toHaveURL(/\/handleliste$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Handleliste' })).toBeVisible();
  });

  test('wrong password: a general message, no hint whether the account exists', async ({
    page,
  }) => {
    await page.goto('/logg-inn');
    await page.getByLabel('E-postadresse').fill(uniqueEmail('finnes-ikke'));
    await page.getByLabel('Passord').fill('feil passord');
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Feil e-postadresse eller passord' }),
    ).toBeVisible();
    await expect(page.getByLabel('Passord')).toHaveValue('');
  });

  test('FR-AUTH-003: after five wrong passwords even the right one is refused', async ({
    page,
    playwright,
  }) => {
    const account = await registerAccount(playwright, 'laas');
    await page.goto('/logg-inn');
    await page.getByLabel('E-postadresse').fill(account.email);
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('Passord').fill(`gjetning nummer ${i}`);
      await page.getByRole('button', { name: 'Logg inn' }).click();
      await expect(page.getByLabel('Passord')).toHaveValue('');
    }
    await page.getByLabel('Passord').fill(PASSWORD);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'vente 15 minutter' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();
  });

  test('registering an e-mail that is taken shows it at the field', async ({
    page,
    playwright,
  }) => {
    const account = await registerAccount(playwright, 'tatt');
    await page.goto('/registrer');
    await page.getByLabel('Navn').fill('Noen');
    await page.getByLabel('E-postadresse').fill(account.email.toUpperCase());
    await page.getByLabel('Passord').fill(PASSWORD);
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await expect(page.getByLabel('E-postadresse')).toHaveAccessibleDescription(
      /finnes allerede en konto/,
    );
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const path of ['/logg-inn', '/registrer']) {
      test(`${path} (${colorScheme}): no horizontal scroll, no axe violations`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      });
    }
  }
});

test.describe('logged in', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`/profil (${colorScheme}): no horizontal scroll, no axe violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/profil');
      await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }

  test('NFR-SEC-005: a request with the cookie but without the CSRF token is refused', async ({
    page,
  }) => {
    await page.goto('/profil');
    await expect(page.getByRole('heading', { level: 1, name: 'Profil' })).toBeVisible();
    // The browser sends the cookie and the Origin – like a script that does not know the token.
    const status = await page.evaluate(async () => {
      const response = await fetch('/api/v1/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Uten token' }),
      });
      return response.status;
    });
    expect(status).toBe(403);
    await page.reload();
    await expect(page.getByLabel('Navn')).not.toHaveValue('Uten token');
  });

  test('NFR-SEC-005: a request from another origin is refused', async ({ page, account }) => {
    const api = page.context().request;
    const response = await api.patch(`${BASE_URL}/api/v1/me`, {
      headers: { origin: 'https://evil.example', 'x-csrf-token': 'whatever' },
      data: { displayName: 'Fra annen side' },
    });
    expect(response.status()).toBe(403);
    expect(account.email).toContain('@example.test');
  });
});

test.describe('changing the account', () => {
  test.use({ isolatedAccount: true });

  test('FR-AUTH-004: name and language are saved on the account', async ({ page, account }) => {
    await page.goto('/profil');
    await expect(page.getByText(account.email)).toBeVisible();
    await page.getByLabel('Navn').fill('Kari Nordmann');
    await page.getByLabel('Språk').selectOption('en');
    await page
      .getByRole('region', { name: 'Om deg' })
      .getByRole('button', { name: 'Lagre' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible();

    // Another browser (empty localStorage) gets the language from the account.
    const other = await page
      .context()
      .browser()!
      .newContext({ storageState: account.storageState });
    const otherPage = await other.newPage();
    await otherPage.goto(`${BASE_URL}/innstillinger`);
    await expect(otherPage.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(otherPage.getByText(/Logged in as Kari Nordmann/)).toBeVisible();
    await other.close();
  });

  test('FR-AUTH-004: changing the password logs out other devices', async ({
    page,
    account,
    playwright,
  }) => {
    // A second device: its own login, so its own session.
    const other = await page
      .context()
      .browser()!
      .newContext({ storageState: await loginAccount(playwright, account.email) });
    const otherPage = await other.newPage();

    await page.goto('/profil');
    await page.getByLabel('Nåværende passord').fill(PASSWORD);
    await page.getByLabel('Nytt passord').fill('et helt nytt passord');
    await page
      .getByRole('region', { name: 'Bytt passord' })
      .getByRole('button', { name: 'Bytt passord' })
      .click();
    await expect(page.getByText('Passordet er byttet. Andre enheter er logget ut.')).toBeVisible();

    // This browser is still logged in, the other one is not.
    await page.goto('/matlager');
    await expect(page.getByRole('heading', { level: 1, name: 'Matlager' })).toBeVisible();
    await otherPage.goto(`${BASE_URL}/matlager`);
    await expect(otherPage.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();
    await other.close();
  });

  test('FR-AUTH-005: deleting the account removes it – logging in afterwards fails', async ({
    page,
    account,
  }) => {
    await page.goto('/profil');
    const danger = page.getByRole('region', { name: 'Slett konto' });
    await danger.getByLabel('Skriv inn passordet ditt for å bekrefte').fill(PASSWORD);
    await danger.getByLabel(/Jeg forstår at alt slettes/).check();
    await danger.getByRole('button', { name: 'Slett kontoen for godt' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();
    await expect(page.getByText('Kontoen din er slettet.')).toBeVisible();

    await page.getByLabel('E-postadresse').fill(account.email);
    await page.getByLabel('Passord').fill(PASSWORD);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Feil e-postadresse eller passord' }),
    ).toBeVisible();
  });
});
