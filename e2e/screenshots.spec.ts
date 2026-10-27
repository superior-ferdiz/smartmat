import { base32Decode, stepAt, totpCode } from '../apps/api/src/lib/totp';
import { BASE_URL, LOGGED_OUT, loginAccount, test } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npx playwright test screenshots
 * Phase 13 pages: the notice about a new login, the profile (sessions, two-factor, export), the code step at login,
 * and the privacy notice. Every account is a throw-away account in the e2e database, which is emptied at each run.
 * (The phase 1–12 screenshots in docs/evidence/screenshots/ were made by earlier versions of this file; see Git
 * history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-13';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – security and privacy`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('sikkerhet og personvern', async ({ page, playwright, account, browser }, testInfo) => {
      test.setTimeout(120_000);
      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (name: string) =>
        page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage: true,
        });
      const ready = () => page.evaluate(() => document.fonts.ready);

      // FR-AUTH-009: a login "on another device", then the notice here.
      await loginAccount(playwright, account.email);
      await page.goto('/');
      await page.getByText('Ny innlogging på kontoen din.').waitFor();
      await ready();
      await shot('ny-innlogging');

      // FR-AUTH-010: turn on two-factor (the key is read from the page, as the app would).
      await page.goto('/profil');
      const card = page.getByRole('region', { name: 'Tofaktorinnlogging' });
      await card.getByRole('button', { name: 'Slå på tofaktorinnlogging' }).click();
      await card.getByLabel('Passord').fill(account.password);
      await card.getByRole('button', { name: 'Fortsett' }).click();
      const key = (await card.getByLabel('Nøkkel til autentiseringsappen').textContent()) ?? '';
      await ready();
      await shot('tofaktor-oppsett');
      await card
        .getByLabel('Kode')
        .fill(totpCode(base32Decode(key.replace(/\s/g, '')), stepAt(new Date())));
      await card.getByRole('button', { name: 'Slå på', exact: true }).click();
      await card.getByRole('list', { name: 'Ta vare på gjenopprettingskodene' }).waitFor();
      await card.getByRole('button', { name: 'Jeg har tatt vare på kodene' }).click();
      await card.getByText(/^På\./).waitFor();
      await page.getByText('Denne enheten').waitFor();
      await ready();
      await shot('profil');

      // FR-AUTH-010: the code step, in a fresh browser.
      const { viewport, isMobile, hasTouch, userAgent } = testInfo.project.use;
      const fresh = await browser.newContext({
        baseURL: BASE_URL,
        locale: 'nb-NO',
        colorScheme,
        // In a Playwright test, newContext() takes the test's storage state (logged in) unless told otherwise.
        storageState: LOGGED_OUT,
        ...(viewport ? { viewport } : {}),
        ...(userAgent ? { userAgent } : {}),
        ...(isMobile !== undefined ? { isMobile } : {}),
        ...(hasTouch !== undefined ? { hasTouch } : {}),
      });
      const login = await fresh.newPage();
      await login.goto('/logg-inn');
      await login.getByLabel('E-postadresse').fill(account.email);
      await login.getByLabel('Passord').fill(account.password);
      await login.getByRole('button', { name: 'Logg inn' }).click();
      await login.getByRole('heading', { level: 1, name: 'Skriv inn koden' }).waitFor();
      await login.evaluate(() => document.fonts.ready);
      await login.screenshot({
        path: `${OUT}/innlogging-kode-${testInfo.project.name}-${suffix}.png`,
        fullPage: true,
      });
      await fresh.close();

      // FR-PRIV-003.
      await page.goto('/personvern');
      await page.getByRole('heading', { level: 1, name: 'Personvernerklæring' }).waitFor();
      await ready();
      await shot('personvern');
    });
  });
}
