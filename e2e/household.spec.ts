import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import {
  apiAs,
  BASE_URL,
  expect,
  LOGGED_OUT,
  PASSWORD,
  registerAccount,
  test,
  type Account,
} from './fixtures';

/*
 * Phase 10 end-to-end tests (spec 10): two people in two browsers, through the real UI, API and database.
 * IDs: FR-HH-001–007, NFR-SEC-001, NFR-UX-001/002.
 */

/** A second browser for another person, with the same viewport and language as this project. */
async function secondBrowser(
  browser: Browser,
  testInfo: TestInfo,
  storageState: Account['storageState'] | typeof LOGGED_OUT,
): Promise<BrowserContext> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  return browser.newContext({
    baseURL: BASE_URL,
    locale: 'nb-NO',
    timezoneId: 'Europe/Oslo',
    storageState,
    ...(viewport ? { viewport } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(deviceScaleFactor ? { deviceScaleFactor } : {}),
    ...(isMobile !== undefined ? { isMobile } : {}),
    ...(hasTouch !== undefined ? { hasTouch } : {}),
  });
}

/** The owner makes an invitation link in the UI and reads it from the field (shown once). */
async function makeInvitationLink(page: Page): Promise<string> {
  await page.goto('/husholdning');
  await page.getByRole('button', { name: 'Lag invitasjonslenke' }).click();
  const dialog = page.getByRole('dialog', { name: 'Invitasjonslenken er klar' });
  const link = await dialog.getByLabel('Invitasjonslenke').inputValue();
  expect(link).toMatch(/\/bli-med#[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole('button', { name: 'Lukk' }).click();
  return link;
}

test.describe('owner invites → new member joins → both see the same → member leaves', () => {
  test.use({ isolatedAccount: true });

  test('the whole flow', async ({ page, account, browser, playwright }, testInfo) => {
    // Kari's household has an item and a shopping line; Ola has his own item.
    const kari = await apiAs(playwright, account);
    await kari.createItem({
      name: 'Felles smør',
      categoryKey: 'dairy',
      unit: 'g',
      batch: {
        quantityBase: 500,
        locationId: (await kari.locations())[0]!.id,
        expiry: { kind: 'best_before', date: '2030-01-01' },
      },
    });
    await kari.addShoppingItem({ text: 'Brød' });
    const olaAccount = await registerAccount(playwright, 'ola');
    const olaApi = await apiAs(playwright, olaAccount);
    await olaApi.addShoppingItem({ text: 'Olas egen kaffe' });

    // FR-HH-003: the owner renames the household and makes a link.
    await page.goto('/husholdning');
    await expect(page.getByText('Du er alene i husholdningen')).toBeVisible();
    const name = page.getByLabel('Navn på husholdningen');
    await name.fill('Familien E2E');
    await page.getByRole('button', { name: 'Lagre navnet' }).click();
    await expect(page.getByText('Navnet er lagret.')).toBeVisible();
    const link = await makeInvitationLink(page);

    // FR-HH-002: Ola opens the link in his own browser and joins.
    const olaContext = await secondBrowser(browser, testInfo, olaAccount.storageState);
    const ola = await olaContext.newPage();
    await ola.goto(link);
    await expect(ola.getByText('Testbruker inviterer deg til «Familien E2E».')).toBeVisible();
    await expect(ola.getByText(/blir værende der/)).toBeVisible();
    // The token left the address bar at once.
    await expect(ola).toHaveURL(/\/bli-med$/);
    await ola.getByRole('button', { name: 'Bli med' }).click();
    await expect(ola.getByText('Du er nå med i Familien E2E.')).toBeVisible();
    await expect(ola).toHaveURL(`${BASE_URL}/`);

    // Both see the same inventory and shopping list; Ola's own data is not in it.
    await ola.goto('/matlager');
    await expect(ola.getByText('Husholdning: Familien E2E')).toBeVisible();
    await expect(ola.getByText('Felles smør', { exact: true })).toBeVisible();
    await ola.goto('/handleliste');
    await expect(ola.getByText('Brød', { exact: true })).toBeVisible();
    await expect(ola.getByText('Olas egen kaffe', { exact: true })).toHaveCount(0);
    // FR-HH-007: in a shared household the line says who added it.
    await expect(ola.getByText(/Lagt til av Testbruker/)).toBeVisible();

    // Ola adds a line; Kari sees it.
    await ola.getByLabel('Vare', { exact: true }).fill('Melk fra Ola');
    await ola.keyboard.press('Enter');
    await expect(ola.getByText('Melk fra Ola', { exact: true })).toBeVisible();
    await page.goto('/handleliste');
    await expect(page.getByText('Melk fra Ola', { exact: true })).toBeVisible();
    await page.goto('/husholdning');
    await expect(page.getByRole('region', { name: 'Medlemmer' }).getByRole('listitem')).toHaveCount(
      2,
    );

    // FR-HH-005: Ola leaves and no longer sees the household.
    await ola.goto('/husholdning');
    await ola.getByRole('button', { name: 'Forlat husholdningen' }).click();
    const confirm = ola.getByRole('dialog', { name: 'Forlate Familien E2E?' });
    await confirm.getByRole('button', { name: 'Ja, forlat husholdningen' }).click();
    await expect(ola.getByText('Du har forlatt Familien E2E.')).toBeVisible();
    await ola.goto('/matlager');
    await expect(ola.getByRole('heading', { level: 1, name: 'Matlager' })).toBeVisible();
    await expect(ola.getByText('Felles smør', { exact: true })).toHaveCount(0);
    await ola.goto('/handleliste');
    await expect(ola.getByText('Olas egen kaffe', { exact: true })).toBeVisible();
    await expect(ola.getByText('Brød', { exact: true })).toHaveCount(0);
    // The server refuses too (not only the UI).
    // (From the page, so the browser sends its session cookie – Playwright's request context drops Secure
    // cookies over http.)
    const status = await ola.evaluate(
      async (path) => (await fetch(path)).status,
      `/api/v1/households/${kari.householdId}/inventory`,
    );
    expect(status).toBe(404);

    // Kari keeps Ola's line, without his name.
    await page.goto('/handleliste');
    await expect(page.getByText('Melk fra Ola', { exact: true })).toBeVisible();
    await expect(page.getByText(/Tidligere medlem/)).toBeVisible();

    await olaContext.close();
    await kari.dispose();
    await olaApi.dispose();
  });
});

test.describe('a logged-out person opens the link', () => {
  test.use({ isolatedAccount: true });

  test('logs in and comes back to the invitation', async ({
    page,
    browser,
    playwright,
  }, testInfo) => {
    const link = await makeInvitationLink(page);
    const per = await registerAccount(playwright, 'per');
    const context = await secondBrowser(browser, testInfo, LOGGED_OUT);
    const guest = await context.newPage();
    await guest.goto(link);
    await expect(guest.getByText(/Logg inn eller lag en konto/)).toBeVisible();
    await guest.getByRole('link', { name: 'Logg inn' }).click();
    await guest.getByLabel('E-postadresse').fill(per.email);
    await guest.getByLabel('Passord').fill(PASSWORD);
    await guest.getByRole('button', { name: 'Logg inn' }).click();
    await expect(guest).toHaveURL(/\/bli-med$/);
    await expect(guest.getByRole('button', { name: 'Bli med' })).toBeVisible();
    await guest.getByRole('button', { name: 'Bli med' }).click();
    await expect(guest.getByText(/Du er nå med i/)).toBeVisible();
    // Used once: the same link no longer works for anyone.
    await guest.goto(link);
    await expect(guest.getByText('Invitasjonen virker ikke')).toBeVisible();
    await context.close();
  });
});

test.describe('NFR-UX-001/002 household pages', () => {
  test.use({ isolatedAccount: true });

  test('/husholdning and /bli-med: no horizontal scroll and no axe violations', async ({
    page,
    browser,
    playwright,
  }, testInfo) => {
    const link = await makeInvitationLink(page);
    await page.goto('/husholdning');
    await expect(
      page.getByRole('heading', { name: 'Invitasjoner de siste 30 dagene' }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);

    const guest = await registerAccount(playwright, 'axe');
    const context = await secondBrowser(browser, testInfo, guest.storageState);
    const other = await context.newPage();
    await other.goto(link);
    await expect(other.getByRole('button', { name: 'Bli med' })).toBeVisible();
    await expectNoHorizontalScroll(other);
    await expectNoAxeViolations(other);
    await context.close();
  });

  test('keyboard: make a link and close the dialog without a mouse', async ({ page }) => {
    await page.goto('/husholdning');
    const button = page.getByRole('button', { name: 'Lag invitasjonslenke' });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Invitasjonslenken er klar' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });
});
