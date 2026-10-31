import { expectNoAxeViolations, expectNoHorizontalScroll } from './checks';
import { apiAs, expect, test, type Account } from './fixtures';
import type { Page, PlaywrightWorkerArgs } from '@playwright/test';

/*
 * Phase 3 end-to-end tests: the inventory through the real UI, API and database.
 * IDs: FR-INV-001–008, FR-DASH-001, NFR-UX-001/002.
 */

/** A date `days` from today in Norway (same rule as the app). */
function inDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

async function seed(playwright: PlaywrightWorkerArgs['playwright'], account: Account) {
  const api = await apiAs(playwright, account);
  const locations = await api.locations();
  const fridge = locations.find((l) => l.kind === 'fridge')!.id;
  const pantry = locations.find((l) => l.kind === 'pantry')!.id;
  await api.createItem({
    name: 'Kyllingfilet',
    categoryKey: 'meat',
    unit: 'g',
    batch: { quantityBase: 400, locationId: fridge, expiry: { kind: 'use_by', date: inDays(-1) } },
  });
  await api.createItem({
    name: 'Lettmelk',
    categoryKey: 'dairy',
    unit: 'ml',
    batch: {
      quantityBase: 1750,
      locationId: fridge,
      expiry: { kind: 'best_before', date: inDays(2) },
      priceOre: 2490,
    },
  });
  await api.createItem({
    name: 'Ris',
    categoryKey: 'dryGoods',
    unit: 'g',
    batch: { quantityBase: 1000, locationId: pantry },
  });
  await api.dispose();
}

async function openDialogAndSubmit(
  page: Page,
  button: string,
  dialogName: RegExp,
  submit: string,
  fill?: () => Promise<void>,
) {
  await page.getByRole('button', { name: button, exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  await fill?.();
  await dialog.getByRole('button', { name: submit }).click();
  await expect(dialog).toBeHidden();
}

test.describe('inventory', () => {
  test.use({ isolatedAccount: true });

  test('FR-INV-001/002/006/007/008: add → second batch → use part → throw away → history → undo', async ({
    page,
  }) => {
    // Add an item through the form.
    await page.goto('/matlager');
    await expect(page.getByRole('heading', { name: 'Matlageret er tomt' })).toBeVisible();
    await page.getByRole('link', { name: 'Legg til vare' }).first().click();
    await page.getByLabel(/Navn på varen/).fill('Kjøttdeig');
    await page.getByLabel('Kategori').selectOption({ label: 'Kjøtt' });
    await page.getByLabel(/Måles i/).selectOption({ label: 'Vekt (g, kg)' });
    await page.getByLabel('Mengde').fill('0,4');
    await page.getByLabel('Enhet').selectOption('kg');
    await page.getByLabel('Dato på pakken').selectOption({ label: 'Siste forbruksdag' });
    await page.getByLabel('Dato', { exact: true }).fill(inDays(1));
    await page.getByLabel(/^Pris/).fill('49,90');
    await page.getByRole('button', { name: 'Legg til', exact: true }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Kjøttdeig' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Parti 1' })).toContainText('400 g');
    await expect(page.getByRole('region', { name: 'Parti 1' })).toContainText(
      'Siste forbruksdag i morgen',
    );

    // A second batch in the freezer, without a date.
    await openDialogAndSubmit(page, 'Legg til parti', /Nytt parti/, 'Legg til parti', async () => {
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Mengde').fill('800');
      await dialog.getByLabel('Lagringssted').selectOption({ label: 'Fryser' });
    });
    await expect(page.getByRole('region', { name: 'Parti 2' })).toContainText('800 g');
    await expect(page.getByText(/1,2\s*kg/).first()).toBeVisible();

    // Use 150 g of the first batch.
    await page
      .getByRole('region', { name: 'Parti 1' })
      .getByRole('button', { name: 'Bruk' })
      .click();
    let dialog = page.getByRole('dialog', { name: 'Bruk Kjøttdeig' });
    await dialog.getByLabel(/^Alt/).uncheck();
    await dialog.getByLabel('Mengde').fill('150');
    await dialog.getByLabel('Enhet').selectOption('g');
    await dialog.getByRole('button', { name: 'Registrer bruk' }).click();
    await expect(page.getByRole('region', { name: 'Parti 1' })).toContainText('250 g');

    // Throw away the rest of it, value estimated from the price.
    await page
      .getByRole('region', { name: 'Parti 1' })
      .getByRole('button', { name: 'Kast' })
      .click();
    dialog = page.getByRole('dialog', { name: 'Kast Kjøttdeig' });
    await dialog.getByLabel(/Hvorfor/).selectOption({ label: 'Gått ut på dato' });
    await dialog.getByRole('button', { name: 'Registrer kassering' }).click();
    await expect(page.getByRole('region', { name: 'Parti 2' })).toBeHidden();

    // History, newest first; 250 of 400 g at 49,90 kr = 31,19 kr (rounded half up).
    const history = page.getByRole('region', { name: 'Historikk' });
    const entries = history.getByRole('listitem');
    await expect(entries.first()).toContainText('Kastet 250 g (Gått ut på dato)');
    await expect(entries.first()).toContainText('anslått verdi 31,19');
    await expect(entries.nth(1)).toContainText('Brukte 150 g');

    // Undo the discard: the 250 g are back.
    await history.getByRole('button', { name: 'Angre siste endring' }).click();
    await expect(entries.first()).toContainText('Angret: kastet');
    await expect(page.getByRole('region', { name: 'Parti 1' })).toContainText('250 g');
    await expect(history.getByRole('button', { name: 'Angre siste endring' })).toBeHidden();

    // The overview shows it under "Går ut snart".
    await page.goto('/');
    const expiring = page.getByRole('region', { name: 'Går ut snart' });
    await expect(expiring.getByRole('link', { name: 'Kjøttdeig' })).toBeVisible();
    await expect(expiring).toContainText('Siste forbruksdag i morgen');
  });

  test('FR-INV-004/005: summary, search and filters, kept in the URL', async ({
    page,
    playwright,
    account,
  }) => {
    await seed(playwright, account);
    await page.goto('/matlager');
    const summary = page.getByRole('navigation', { name: 'Holdbarhet' });
    await expect(summary.getByRole('link')).toHaveText([
      /1\s*går ut snart/,
      /1\s*har passert datoen/,
      /1\s*mangler dato/,
    ]);

    await summary.getByRole('link', { name: /har passert datoen/ }).click();
    await expect(page).toHaveURL(/status=passert/);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Kyllingfilet']);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
    await expect(page.getByText('Siste forbruksdag passert')).toBeVisible();

    await page.goto('/matlager');
    await page.getByRole('searchbox', { name: /Søk/ }).fill('melk');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Lettmelk']);
    await expect(page).toHaveURL(/q=melk/);
    await page.reload();
    await expect(page.getByRole('searchbox', { name: /Søk/ })).toHaveValue('melk');

    await page.goto('/matlager?sortering=navn');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Kyllingfilet',
      'Lettmelk',
      'Ris',
    ]);
  });

  test('dialog: Esc closes it and focus goes back to the button; Tab stays inside', async ({
    page,
    playwright,
    account,
  }) => {
    await seed(playwright, account);
    await page.goto('/matlager');
    await page.getByRole('link', { name: 'Ris' }).click();
    const use = page.getByRole('region', { name: 'Parti 1' }).getByRole('button', { name: 'Bruk' });
    await use.click();
    const dialog = page.getByRole('dialog', { name: 'Bruk Ris' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      // A modal <dialog> makes the page behind it inert: focus is inside the dialog, or has gone to the
      // browser's own controls (activeElement = body) – never on the page behind.
      expect(
        await dialog.evaluate(
          (d) => d.contains(document.activeElement) || document.activeElement === document.body,
        ),
      ).toBe(true);
    }
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(use).toBeFocused();
  });

  test('FR-INV-003: a new storage place, used, then refused deletion while it has food', async ({
    page,
  }) => {
    await page.goto('/matlager/steder');
    await page.getByRole('button', { name: 'Nytt sted' }).click();
    await page.getByRole('dialog').getByLabel('Navn').fill('Kjeller');
    await page.getByRole('dialog').getByRole('button', { name: 'Lagre' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Kjeller' })).toBeVisible();

    await page.goto('/matlager/ny');
    await page.getByLabel(/Navn på varen/).fill('Poteter');
    await page.getByLabel('Kategori').selectOption({ label: 'Frukt og grønt' });
    await page.getByLabel(/Måles i/).selectOption({ label: 'Vekt (g, kg)' });
    await page.getByLabel('Mengde').fill('2');
    await page.getByLabel('Enhet').selectOption('kg');
    await page.getByLabel('Lagringssted').selectOption({ label: 'Kjeller' });
    await page.getByRole('button', { name: 'Legg til', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Poteter' })).toBeVisible();

    await page.goto('/matlager/steder');
    await page.getByRole('button', { name: 'Slett Kjeller' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Slett stedet' }).click();
    await expect(page.getByRole('dialog').getByText('Stedet har fortsatt varer')).toBeVisible();
  });
});

test.describe('inventory pages: layout and accessibility', () => {
  test.use({ isolatedAccount: true });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`(${colorScheme}) /matlager, /matlager/ny, an item and /matlager/steder: no horizontal scroll, no axe violations`, async ({
      page,
      playwright,
      account,
    }) => {
      await seed(playwright, account);
      await page.emulateMedia({ colorScheme });
      // On the phone the sticky bottom menu covers whatever is behind it while scrolling, and axe's
      // target-size rule then reports the control that happens to sit at the menu's edge when the page
      // loads. A tall viewport (same 360px width) lets the whole page fit, so every control is checked
      // without the menu in front of it. See chapter 11, "Begrensninger".
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 600)
        await page.setViewportSize({ width: viewport.width, height: 2400 });
      for (const path of ['/matlager', '/matlager/ny', '/matlager/steder']) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await expectNoHorizontalScroll(page);
        await expectNoAxeViolations(page);
      }
      await page.goto('/matlager');
      await page.getByRole('link', { name: 'Kyllingfilet' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Kyllingfilet' })).toBeVisible();
      await expect(
        page.getByRole('region', { name: 'Historikk' }).getByRole('listitem'),
      ).toHaveCount(1);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
