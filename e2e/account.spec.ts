import { readFileSync } from 'node:fs';
import { base32Decode, stepAt, totpCode } from '../apps/api/src/lib/totp';
import type { Browser, TestInfo } from '@playwright/test';
import {
  apiAs,
  BASE_URL,
  expect,
  LOGGED_OUT,
  loginAccount,
  test,
  uniqueEmail,
  type Account,
} from './fixtures';
import { expectNoAxeViolations, useTallPhoneViewport } from './checks';

/*
 * Spec 13 through the real browser and API: sessions and the notice about a new login (FR-AUTH-009), the data export
 * (FR-PRIV-001), the privacy notice (FR-PRIV-003), leaked passwords (FR-AUTH-008, against the fake Pwned Passwords in
 * the e2e server) and two people editing the same purchase (FR-BUD-006).
 */

async function sameAccountElsewhere(
  browser: Browser,
  testInfo: TestInfo,
  storageState: Account['storageState'],
) {
  const { viewport, userAgent, isMobile, hasTouch } = testInfo.project.use;
  return browser.newContext({
    baseURL: BASE_URL,
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    storageState,
    ...(viewport ? { viewport } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
  });
}

test.describe('FR-AUTH-009 sessions and new logins', () => {
  test.use({ isolatedAccount: true });

  test('a login elsewhere shows a notice here; "Det var meg" clears it; the profile can log that device out', async ({
    page,
    account,
    playwright,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();
    await expect(page.getByText('Ny innlogging på kontoen din.')).toHaveCount(0);

    // "Another device": a second session through the API.
    const other = await loginAccount(playwright, account.email);
    await page.reload();
    await expect(page.getByText('Ny innlogging på kontoen din.')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Det var meg' }).click();
    await expect(page.getByText('Ny innlogging på kontoen din.')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();
    await expect(page.getByText('Ny innlogging på kontoen din.')).toHaveCount(0);

    await page.goto('/profil#profile-sessions');
    const card = page.getByRole('region', { name: 'Hvor du er logget inn' });
    await expect(card.getByText('Denne enheten')).toBeVisible();
    await card.getByRole('button', { name: /^Logg ut (?!alle)/ }).click();
    await expect(page.getByText('Enheten er logget ut.')).toBeVisible();
    await expect(card.getByRole('button', { name: /^Logg ut (?!alle)/ })).toHaveCount(0);

    // The other session no longer works.
    const cookie = other.cookies.find((c) => c.name === 'smartmat_session');
    const api = await playwright.request.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { cookie: `smartmat_session=${cookie?.value ?? ''}` },
    });
    expect((await api.get('/api/v1/auth/session')).status()).toBe(401);
    await api.dispose();
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
  });
});

test.describe('FR-PRIV-001 export of my own data', () => {
  test.use({ isolatedAccount: true });

  test('"Last ned mine data" downloads a JSON file with my data and no secrets', async ({
    page,
    account,
    playwright,
  }) => {
    const api = await apiAs(playwright, account);
    const [fridge] = (await api.locations()).filter((l) => l.kind === 'fridge');
    await api.createItem({
      name: 'Eksportmelk',
      categoryKey: 'dairy',
      unit: 'ml',
      batch: { quantityBase: 1000, locationId: fridge!.id },
    });
    await api.dispose();

    await page.goto('/profil');
    const link = page.getByRole('link', { name: 'Last ned mine data' });
    const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
    expect(download.suggestedFilename()).toMatch(/^smartmat-eksport-\d{4}-\d{2}-\d{2}\.json$/);
    const text = readFileSync((await download.path())!, 'utf8');
    const data = JSON.parse(text);
    expect(data.account.email).toBe(account.email);
    expect(text).toContain('Eksportmelk');
    expect(text).not.toContain('password_hash');
    expect(text).not.toContain('token_hash');
    expect(text).not.toContain('csrf_token');
  });
});

test.describe('FR-PRIV-003 privacy notice and FR-AUTH-008 leaked passwords (logged out)', () => {
  test.use({ storageState: LOGGED_OUT });

  test('the privacy notice is one click from the login page, and has no axe violations', async ({
    page,
  }) => {
    await page.goto('/logg-inn');
    await page.getByRole('link', { name: 'Personvern' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Personvernerklæring' }),
    ).toBeVisible();
    await expect(page.getByText(/kontaktadresse er ikke fylt inn ennå/)).toBeVisible();
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
  });

  test('registration with a password from known breaches is refused at the field; another one works', async ({
    page,
  }) => {
    await page.goto('/registrer');
    await page.getByLabel('Navn').fill('Kari');
    await page.getByLabel('E-postadresse').fill(uniqueEmail('lekket'));
    // Listed in the fake Pwned Passwords of the e2e server (apps/api/test/fakePwned.ts).
    await page.getByLabel('Passord').fill('lekket passord fra testen');
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await expect(page.getByLabel('Passord')).toHaveAccessibleDescription(
      /finnes i kjente datalekkasjer/,
    );
    await page.getByLabel('Passord').fill('en helt annen lang setning');
    await page.getByRole('button', { name: 'Opprett konto' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();
  });
});

test.describe('FR-BUD-006 two people editing the same purchase', () => {
  test.use({ isolatedAccount: true });

  test('the second save is refused with a message; the first one is kept', async ({
    page,
    account,
    playwright,
    browser,
  }, testInfo) => {
    const api = await apiAs(playwright, account);
    const purchase = await api.createPurchase({
      storeName: 'Kiwi',
      purchasedOn: '2026-10-20',
      totalOre: 4990,
    });
    await api.dispose();

    const otherContext = await sameAccountElsewhere(browser, testInfo, account.storageState);
    const other = await otherContext.newPage();
    for (const p of [page, other]) {
      await p.goto(`/budsjett/kjop/${purchase.id}/rett`);
      await expect(p.getByLabel('Butikk')).toHaveValue('Kiwi');
    }

    await page.getByLabel('Butikk').fill('Kiwi Bø');
    await page.getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByText('Kjøpet er oppdatert.')).toBeVisible();

    await other.getByLabel('Butikk').fill('Rema 1000');
    await other.getByRole('button', { name: 'Lagre' }).click();
    await expect(other.getByText(/Noen andre har endret kjøpet mens du rettet det/)).toBeVisible();
    await expect(other).toHaveURL(new RegExp(`/budsjett/kjop/${purchase.id}/rett$`));

    await page.goto(`/budsjett/kjop/${purchase.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Kiwi Bø' })).toBeVisible();
    await otherContext.close();
  });
});

test.describe('FR-AUTH-010 two-factor login', () => {
  test.use({ isolatedAccount: true });

  test('turn on with the app key, log out, log in with a recovery code, turn off', async ({
    page,
    account,
  }) => {
    await page.goto('/profil');
    const card = page.getByRole('region', { name: 'Tofaktorinnlogging' });
    await card.getByRole('button', { name: 'Slå på tofaktorinnlogging' }).click();
    await card.getByLabel('Passord').fill(account.password);
    await card.getByRole('button', { name: 'Fortsett' }).click();
    const key = (await card.getByLabel('Nøkkel til autentiseringsappen').textContent()) ?? '';
    // What the authenticator app would show.
    const secret = base32Decode(key.replace(/\s/g, ''));
    await card.getByLabel('Kode').fill(totpCode(secret, stepAt(new Date())));
    await card.getByRole('button', { name: 'Slå på', exact: true }).click();
    const codes = card.getByRole('list', { name: 'Ta vare på gjenopprettingskodene' });
    await expect(codes.getByRole('listitem')).toHaveCount(10);
    const recovery = (await codes.getByRole('listitem').nth(0).textContent()) ?? '';
    const spare = (await codes.getByRole('listitem').nth(1).textContent()) ?? '';
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    await card.getByRole('button', { name: 'Jeg har tatt vare på kodene' }).click();
    await expect(card.getByText('På. Du har 10 ubrukte gjenopprettingskoder.')).toBeVisible();

    await page
      .getByRole('region', { name: 'Logg ut' })
      .getByRole('button', { name: 'Logg ut' })
      .click();
    await page.getByLabel('E-postadresse').fill(account.email);
    await page.getByLabel('Passord').fill(account.password);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Skriv inn koden' })).toBeVisible();
    await expect(page.getByLabel('Kode')).toBeFocused();
    await page.getByLabel('Kode').fill(recovery);
    await page.getByRole('button', { name: 'Bekreft' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();

    await page.goto('/profil');
    await expect(card.getByText('På. Du har 9 ubrukte gjenopprettingskoder.')).toBeVisible();
    await card.getByRole('button', { name: 'Slå av' }).click();
    await card.getByLabel('Passord').fill(account.password);
    await card.getByLabel('Kode').fill(recovery);
    await card.getByRole('button', { name: 'Slå av' }).click();
    // The recovery code was used at login, so it is refused here.
    await expect(card.getByLabel('Kode')).toHaveAccessibleDescription(/Koden stemmer ikke/);
    await card.getByLabel('Passord').fill(account.password);
    await card.getByLabel('Kode').fill(spare);
    await card.getByRole('button', { name: 'Slå av' }).click();
    await expect(page.getByText('Tofaktorinnlogging er slått av.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Slå på tofaktorinnlogging' })).toBeVisible();
  });
});
