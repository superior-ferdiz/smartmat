import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expectNoAxeViolations, expectNoHorizontalScroll } from './checks';
import { BASE_URL, expect, LOGGED_OUT, registerAccount, test } from './fixtures';

/*
 * Spec 17 (FR-AUTH-006a–d): "Glemt passord" through the real UI, the real API, the real job queue and the database.
 * Only the SMTP server is fake: the e2e server writes each e-mail to e2e/.mail/<address>.txt, and the test reads the
 * link from there.
 */

const NEW_PASSWORD = 'et helt nytt passord fra e2e';
const mailDir = fileURLToPath(new URL('./.mail', import.meta.url));

function readMail(address: string): string {
  try {
    return readFileSync(`${mailDir}/${address}.txt`, 'utf8');
  } catch {
    return '';
  }
}

/** Waits for the mailer to write an e-mail to this address whose text matches. */
async function waitForMail(address: string, pattern: RegExp): Promise<string> {
  await expect.poll(() => readMail(address), { timeout: 15_000 }).toMatch(pattern);
  return readMail(address);
}

function linkIn(mail: string): string {
  const link = mail.match(/http:\/\/127\.0\.0\.1:4173\/nytt-passord#[A-Za-z0-9_-]{43}/)?.[0];
  if (!link) throw new Error('no reset link in the e-mail');
  return link.replace(BASE_URL, '');
}

test.describe('logged out', () => {
  test.use({ storageState: LOGGED_OUT });

  test('FR-AUTH-006a–d: ask for a link, set a new password, log in with it; old sessions are gone', async ({
    page,
    playwright,
    browser,
  }) => {
    const account = await registerAccount(playwright, 'glemt');

    await page.goto('/logg-inn');
    await page.getByRole('link', { name: 'Glemt passordet?' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Glemt passord' })).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
    await page.getByLabel('E-postadresse').fill(account.email);
    await page.getByRole('button', { name: 'Send lenke' }).click();
    await expect(page.getByRole('status')).toContainText('Hvis adressen har en konto');

    const mail = await waitForMail(account.email, /Subject: Nytt passord til SmartMat/);
    const link = linkIn(mail);

    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'Velg nytt passord' })).toBeVisible();
    // The token is removed from the address bar at once.
    await expect(page).toHaveURL(/\/nytt-passord$/);
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
    await page.getByLabel('Nytt passord', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Gjenta nytt passord').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Lagre nytt passord' }).click();
    await expect(page.getByRole('status')).toContainText('Passordet er endret');

    // FR-AUTH-006d: the session from registration no longer works.
    const old = await browser.newContext({ storageState: account.storageState });
    const oldPage = await old.newPage();
    await oldPage.goto('/');
    await expect(oldPage.getByRole('heading', { level: 1, name: 'Logg inn' })).toBeVisible();
    await old.close();

    // The same link a second time (opened from the e-mail again, so a fresh page load): dead.
    await page.goto('/logg-inn');
    await page.goto(link);
    await page.getByLabel('Nytt passord', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Gjenta nytt passord').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Lagre nytt passord' }).click();
    await expect(page.getByRole('alert')).toContainText('Lenken virker ikke lenger');

    await page.goto('/logg-inn');
    await page.getByLabel('E-postadresse').fill(account.email);
    await page.getByLabel('Passord').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Logg inn' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Oversikt' })).toBeVisible();

    await waitForMail(account.email, /Subject: Passordet ditt i SmartMat er endret/);
  });
});
