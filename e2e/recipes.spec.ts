import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { apiAs, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/*
 * Phase 5 end-to-end tests: recipes through the real UI, API and database. The e2e API is seeded with the
 * three FICTIONAL test recipes from apps/api/test/fixtures/seed/ (source=test), never the team's.
 * IDs: FR-REC-001–004, FR-DASH-001, NFR-UX-001/002.
 */

const DISCLAIMER = /Allergeninformasjonen er veiledende/;

function inDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const cards = (page: Page) =>
  page.getByRole('list', { name: 'Oppskrifter, best egnet først' }).getByRole('listitem');

test.describe('recipes ranked by the inventory', () => {
  test.use({ isolatedAccount: true });

  test('FR-REC-002/003: an item in the inventory → the recipe ranks higher and shows what is missing', async ({
    page,
  }) => {
    // Empty inventory: every recipe scores 0; the one with fewest missing ingredients comes first.
    await page.goto('/oppskrifter');
    await expect(cards(page)).toHaveCount(3);
    await expect(cards(page).first()).toContainText('Testrett: pasta med tomat');
    await expect(cards(page).first()).toContainText('0 poeng');
    await expect(page.getByText(DISCLAIMER)).toBeVisible();

    // Add chicken through the inventory form, with a use-by date tomorrow.
    await page.goto('/matlager/ny');
    await page.getByLabel(/Navn på varen/).fill('Kyllingfilet');
    await page.getByLabel('Kategori').selectOption({ label: 'Kjøtt' });
    await page.getByLabel(/Måles i/).selectOption({ label: 'Vekt (g, kg)' });
    await page.getByLabel('Mengde').fill('400');
    await page.getByLabel('Enhet').selectOption('g');
    await page.getByLabel('Dato på pakken').selectOption({ label: 'Siste forbruksdag' });
    await page.getByLabel('Dato', { exact: true }).fill(inDays(1));
    await page.getByRole('button', { name: 'Legg til', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kyllingfilet' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Ingrediens i oppskrifter' })).toContainText(
      'Kyllingfilet (automatisk, fra navnet)',
    );

    // The chicken recipe is now first: 25 for 1 of 4 ingredients + 10 because it goes off tomorrow.
    await page.getByRole('link', { name: 'Oppskrifter' }).first().click();
    const first = cards(page).first();
    await expect(first).toContainText('Testrett: kylling og ris');
    await expect(first).toContainText('35 poeng');
    await expect(first).toContainText('Har 1 av 4 · 3 mangler · 1 går snart ut');

    // The recipe shows what is there, what is missing, and why it ranks where it does.
    await first.getByRole('link').click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Testrett: kylling og ris' }),
    ).toBeVisible();
    await expect(page.getByText('Testdata', { exact: true })).toBeVisible();
    const have = page.getByRole('heading', { level: 3, name: 'Har' }).locator('..');
    await expect(have).toContainText('400 g kyllingfilet');
    await expect(have).toContainText('Kyllingfilet: siste forbruksdag i morgen');
    const missing = page.getByRole('heading', { level: 3, name: 'Mangler' }).locator('..');
    await expect(missing).toContainText('250 g ris');
    await expect(missing).toContainText('1 løk');
    await expect(missing).toContainText('2 dl fløte');
    await expect(
      page.getByRole('heading', { level: 3, name: 'Basisvarer' }).locator('..'),
    ).toContainText('Salt');
    const why = page.getByRole('region', { name: 'Hvorfor denne plasseringen' });
    await expect(why).toContainText('Du har nok av 1 av 4 ingredienser');
    await expect(why).toContainText('+25');
    await expect(why).toContainText('+10');
    await expect(why).toContainText('Mangler: Ris, Løk og Fløte');

    // FR-DASH-001: the dashboard suggests it too – real data, no sample label.
    await page.goto('/');
    const dinner = page.getByRole('region', { name: 'Forslag til middag' });
    await expect(dinner.getByRole('link', { name: 'Testrett: kylling og ris' })).toBeVisible();
    await expect(dinner).toContainText(DISCLAIMER);
    await expect(page.getByText('Eksempeldata')).toHaveCount(0);
  });

  test('FR-REC-003: food past its use-by date is not counted, and the recipe says so', async ({
    page,
    playwright,
    account,
  }) => {
    const api = await apiAs(playwright, account);
    const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
    await api.createItem({
      name: 'Kyllingfilet',
      categoryKey: 'meat',
      unit: 'g',
      batch: {
        quantityBase: 400,
        locationId: fridge,
        expiry: { kind: 'use_by', date: inDays(-1) },
      },
    });
    await api.dispose();
    await page.goto('/oppskrifter');
    await cards(page).filter({ hasText: 'Testrett: kylling og ris' }).getByRole('link').click();
    const missing = page.getByRole('heading', { level: 3, name: 'Mangler' }).locator('..');
    await expect(missing).toContainText('400 g kyllingfilet');
    await expect(missing).toContainText(/passert siste forbruksdag.*bør ikke spises/);
  });
});

test.describe('FR-REC-004 allergens', () => {
  test.use({ isolatedAccount: true });

  test('registered on the profile → recipes with them are hidden, can be shown with a warning', async ({
    page,
  }) => {
    await page.goto('/profil');
    const allergies = page.getByRole('region', { name: 'Allergier' });
    await allergies.getByLabel('melk').check();
    await allergies.getByRole('button', { name: 'Lagre allergier' }).click();
    await expect(page.getByText('Allergiene er lagret')).toBeVisible();

    await page.goto('/oppskrifter');
    // Kylling og ris (fløte) and pannekaker (melk) are hidden; pasta med tomat is left.
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).first()).toContainText('Testrett: pasta med tomat');
    await expect(
      page.getByText('2 oppskrifter er skjult fordi en ingrediens har et av dine allergener.'),
    ).toBeVisible();
    await expect(page.getByText(DISCLAIMER)).toBeVisible();

    // The hidden count links to the list with the switch on (the switch itself sits under "Filtrer").
    await page.getByRole('link', { name: 'Vis dem likevel' }).click();
    await expect(page.getByLabel('Vis oppskrifter med mine allergener')).toBeChecked();
    await expect(cards(page)).toHaveCount(3);
    const pancakes = cards(page).filter({ hasText: 'Testrett: pannekaker' });
    await expect(pancakes).toContainText('Inneholder melk');
    await expect(page).toHaveURL(/allergener=vis/);

    await pancakes.getByRole('link').click();
    await expect(page.getByText('melk: 5 dl melk')).toBeVisible();
    await expect(page.getByText(DISCLAIMER)).toBeVisible();

    // A recipe without the user's allergens is never called "free of" anything.
    await page.goto('/oppskrifter');
    await cards(page).filter({ hasText: 'Testrett: pasta med tomat' }).getByRole('link').click();
    await expect(
      page.getByText('Ingen av dine registrerte allergener er registrert i ingrediensene.'),
    ).toBeVisible();
    await expect(page.getByText(/allergenfri|fri for/i)).toHaveCount(0);
  });
});

test.describe('recipe pages: layout and accessibility', () => {
  test.use({ isolatedAccount: true });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`(${colorScheme}) /oppskrifter, a recipe, /profil and the overview: no horizontal scroll, no axe violations`, async ({
      page,
      playwright,
      account,
    }) => {
      const api = await apiAs(playwright, account);
      const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
      await api.createItem({
        name: 'Matfløte',
        categoryKey: 'dairy',
        unit: 'ml',
        batch: {
          quantityBase: 100,
          locationId: fridge,
          expiry: { kind: 'best_before', date: inDays(1) },
        },
      });
      await api.setAllergens(['egg']);
      await api.dispose();
      await page.emulateMedia({ colorScheme });

      await page.goto('/oppskrifter?allergener=vis');
      await expect(cards(page)).toHaveCount(3);
      await page.evaluate(() => document.fonts.ready);
      await expectNoHorizontalScroll(page);
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);

      await cards(page).filter({ hasText: 'Testrett: kylling og ris' }).getByRole('link').click();
      await expect(
        page.getByRole('heading', { level: 3, name: 'For lite eller usikker mengde' }),
      ).toBeVisible();
      await expectNoHorizontalScroll(page);
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);

      await page.goto('/profil');
      await expect(page.getByRole('region', { name: 'Allergier' }).getByLabel('egg')).toBeChecked();
      await expectNoHorizontalScroll(page);
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);

      await page.goto('/');
      await expect(
        page.getByRole('region', { name: 'Forslag til middag' }).getByRole('link').first(),
      ).toBeVisible();
      await expectNoHorizontalScroll(page);
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);
    });
  }
});
