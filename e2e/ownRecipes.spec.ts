import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { BASE_URL, expect, LOGGED_OUT, registerAccount, test } from './fixtures';

/*
 * Spec 16 end-to-end, through the real UI, API and database with the fictional test ingredients:
 * FR-REC-007/008/009 (own recipes, and another household gets "not found"), FR-ALG-001/002 (allergies and foods in
 * the settings hide recipes), FR-PRICE-007 (the estimate card), NFR-UX-001/002 (phone, axe).
 */

test.describe('own recipes', () => {
  test.use({ isolatedAccount: true });

  test('make one in the form, find it in the list, change it – another household gets "not found"', async ({
    page,
    browser,
    playwright,
  }) => {
    await page.goto('/oppskrifter');
    await page.getByRole('link', { name: 'Ny oppskrift' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ny oppskrift' })).toBeVisible();
    await page.getByLabel('Navn', { exact: true }).fill('E2E-omelett');
    await page.getByLabel('Ingrediens 1', { exact: true }).selectOption({ label: 'Egg' });
    await page.getByLabel(/^Mengde/).fill('3');
    await page.getByLabel(/^Enhet/).selectOption('stk');
    await page.getByRole('button', { name: 'Legg til fritekstlinje' }).click();
    await page.getByLabel('Fritekstlinje 2', { exact: true }).fill('Gressløk fra hagen');
    await expect(page.getByText('1 linje er fritekst', { exact: false })).toBeVisible();
    await page.getByLabel('Trinn 1', { exact: true }).fill('Visp og stek.');
    await expectNoHorizontalScroll(page);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Lagre oppskriften' }).click();

    // The recipe page: own, who added it, the free text apart, and a price card that never says "total".
    await expect(page.getByRole('heading', { level: 1, name: 'E2E-omelett' })).toBeVisible();
    await expect(page.getByText('Egen oppskrift', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Lagt inn av/)).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Ingredienser' }).getByText('Gressløk fra hagen'),
    ).toBeVisible();
    const price = page.getByRole('region', { name: 'Anslått pris på ingrediensene' });
    await expect(price.getByText(/Ingen av ingrediensene har pris ennå/)).toBeVisible();
    await expect(price).not.toContainText(/Totalt/);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    const url = page.url();

    // Change it.
    await page.getByRole('link', { name: 'Endre' }).click();
    await page.getByLabel('Navn', { exact: true }).fill('E2E-omelett med ost');
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'E2E-omelett med ost' }),
    ).toBeVisible();

    // In the list, with the "own only" filter.
    await page.goto('/oppskrifter?egne=1');
    const list = page.getByRole('list', { name: /Oppskrifter/ });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByText('E2E-omelett med ost')).toBeVisible();

    // FR-REC-009: someone in another household opens the same address – not found, and the API says 404.
    const stranger = await registerAccount(playwright, 'stranger');
    const other = await browser.newContext({
      baseURL: BASE_URL,
      locale: 'nb-NO',
      storageState: stranger.storageState,
    });
    try {
      const strangerPage = await other.newPage();
      await strangerPage.goto(url);
      await expect(
        strangerPage.getByRole('heading', { level: 1, name: 'Fant ikke oppskriften' }),
      ).toBeVisible();
      await expect(strangerPage.getByText('E2E-omelett')).toHaveCount(0);
      const recipeId = new URL(url).pathname.split('/').pop();
      const status = await strangerPage.evaluate(async (id) => {
        const session = await (await fetch('/api/v1/auth/session')).json();
        const response = await fetch(
          `/api/v1/households/${session.user.householdId}/recipes/${id}`,
        );
        return response.status;
      }, recipeId);
      expect(status).toBe(404);
      await strangerPage.goto('/oppskrifter');
      await expect(strangerPage.getByText('E2E-omelett')).toHaveCount(0);
    } finally {
      await other.close();
    }

    // Delete it.
    await page.goto(url);
    await page.getByRole('button', { name: 'Slett', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Slett oppskriften' }).click();
    await expect(page.getByText('Oppskriften er slettet')).toBeVisible();
    await expect(page).toHaveURL(/\/oppskrifter$/);
  });
});

test.describe('allergies and foods in the settings', () => {
  test.use({ isolatedAccount: true });

  test('a food registered in the settings hides recipes that have it, with the wording "registrert"', async ({
    page,
  }) => {
    await useTallPhoneViewport(page);
    await page.goto('/innstillinger');
    const card = page.getByRole('region', { name: 'Allergier og matvarer' });
    await card.getByLabel(/Legg til en matvare/).selectOption({ label: 'Tomat' });
    await card.getByRole('button', { name: 'Legg til' }).click();
    await expect(card.getByText('Tomat', { exact: true })).toBeVisible();
    // Sharing stays off: nothing turns it on for the user.
    await expect(card.getByLabel(/Ta hensyn til allergiene og matvarene mine/)).not.toBeChecked();
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);
    await card.getByRole('button', { name: 'Lagre', exact: true }).click();
    await expect(page.getByText('Allergiene er lagret')).toBeVisible();

    await page.goto('/oppskrifter');
    await expect(
      page.getByText(
        /1 oppskrift er skjult fordi den har et registrert allergen eller en registrert matvare/,
      ),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Vis dem likevel' }).click();
    await expect(page.getByText('Inneholder Tomat (registrert av deg)').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/fri for|allergenfri/i);
  });
});

test.describe('logged out', () => {
  test.use({ storageState: LOGGED_OUT });

  test('the new-recipe form needs a login', async ({ page }) => {
    await page.goto('/oppskrifter/ny');
    await expect(page).toHaveURL(/\/logg-inn/);
  });
});
