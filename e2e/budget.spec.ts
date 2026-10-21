import { expectNoAxeViolations, expectNoHorizontalScroll } from './checks';
import { apiAs, expect, test } from './fixtures';

/*
 * Phase 4 end-to-end tests: purchases and budget through the real UI, API and database.
 * IDs: FR-BUD-001–005, FR-DASH-001, NFR-UX-001/002.
 */

/** A date `days` from today in Norway (same rule as the app). */
function inDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** formatOre uses a no-break space before "kr" and between thousands. */
const kr = (text: string) => new RegExp(`${text.replace(/ /g, '\\s')}\\skr`);

test.describe('purchases and budget', () => {
  test.use({ isolatedAccount: true });

  test('FR-BUD-001–004: set a budget → register a purchase → items in the inventory → the budget is updated', async ({
    page,
  }) => {
    // Nothing yet.
    await page.goto('/budsjett');
    await expect(page.getByRole('heading', { name: 'Ingen kjøp denne måneden' })).toBeVisible();

    // FR-BUD-003: 4 000 kr a month.
    await page.getByRole('button', { name: 'Sett budsjett' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Månedlig matbudsjett' });
    await dialog.getByLabel('Beløp per måned').fill('4 000');
    await dialog.getByRole('button', { name: 'Lagre' }).click();
    await expect(dialog).toBeHidden();
    const summary = page.getByRole('region', { name: 'Matbudsjett' });
    await expect(summary).toContainText(kr('4 000,00'));

    // FR-BUD-001/002: a purchase with two food lines into the inventory and one non-food line.
    await page.getByRole('link', { name: 'Registrer kjøp' }).first().click();
    await page.getByLabel(/^Butikk/).fill('Rema 1000 Bø');
    const first = page.getByRole('group', { name: 'Linje 1' });
    await first.getByLabel('Hva').fill('Lettmelk');
    await first.getByLabel('Kategori').selectOption({ label: 'Meieri og egg' });
    await first.getByLabel('Beløp').fill('24,90');
    await first.getByLabel('Legg i matlageret').check();
    await first.getByLabel('Måles i').selectOption({ label: 'Volum (ml, dl, l)' });
    await first.getByLabel('Mengde').fill('1,75');
    await first.getByLabel('Enhet').selectOption('l');
    await first.getByLabel('Dato på pakken').selectOption({ label: 'Best før' });
    await first.getByLabel('Dato', { exact: true }).fill(inDays(5));

    await page.getByRole('button', { name: 'Legg til linje' }).click();
    const second = page.getByRole('group', { name: 'Linje 2' });
    await second.getByLabel('Hva').fill('Kjøttdeig');
    await second.getByLabel('Kategori').selectOption({ label: 'Kjøtt' });
    await second.getByLabel('Beløp').fill('59,90');
    await second.getByLabel('Legg i matlageret').check();
    await second.getByLabel('Måles i').selectOption({ label: 'Vekt (g, kg)' });
    await second.getByLabel('Mengde').fill('400');
    await second.getByLabel('Dato på pakken').selectOption({ label: 'Siste forbruksdag' });
    await second.getByLabel('Dato', { exact: true }).fill(inDays(1));

    await page.getByRole('button', { name: 'Legg til linje' }).click();
    const third = page.getByRole('group', { name: 'Linje 3' });
    await third.getByLabel('Hva').fill('Oppvaskmiddel');
    await third.getByLabel('Type').selectOption({ label: 'Ikke mat' });
    await third.getByLabel('Beløp').fill('39,90');
    await expect(page.getByText(kr('Sum: 124,70'))).toBeVisible();
    await page.getByRole('button', { name: 'Lagre kjøpet' }).click();

    // FR-BUD-004: back on the budget page with the new figures. Non-food is not spent.
    await expect(
      page.getByText('Kjøpet er registrert, og 2 varer er lagt i matlageret.'),
    ).toBeVisible();
    await expect(summary).toContainText(kr('84,80'));
    await expect(summary).toContainText(kr('3 915,20'));
    await expect(summary).toContainText('2 % av månedsbudsjettet er brukt');
    const categories = page.getByRole('region', { name: 'Forbruk per kategori' });
    await expect(categories.getByRole('listitem').first()).toContainText('Kjøtt');
    await expect(categories).toContainText(kr('Ikke mat: 39,90'));
    await expect(page.getByRole('link', { name: 'Rema 1000 Bø' })).toBeVisible();

    // FR-BUD-002: the food is in the inventory, with price and a link back to the purchase.
    await page.goto('/matlager');
    await page.getByRole('link', { name: 'Kjøttdeig' }).click();
    const batch = page.getByRole('region', { name: 'Parti 1' });
    await expect(batch).toContainText('400 g');
    await expect(batch).toContainText(kr('59,90'));
    await expect(batch).toContainText('Siste forbruksdag i morgen');
    await batch.getByRole('link', { name: 'Se kjøpet' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Rema 1000 Bø' })).toBeVisible();

    // FR-DASH-001: the overview shows the real figures, no longer sample data.
    await page.goto('/');
    const card = page.getByRole('region', { name: 'Matbudsjett denne måneden' });
    await expect(card).toContainText(kr('84,80'));
    await expect(card).toContainText(kr('3 915,20'));
    await expect(card).not.toContainText('Eksempeldata');
  });

  test('FR-BUD-005: correcting and deleting update every figure; used food stays', async ({
    page,
    playwright,
    account,
  }) => {
    const api = await apiAs(playwright, account);
    const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
    await api.setBudget(100_000);
    const purchase = await api.createPurchase({
      storeName: 'Coop Extra',
      purchasedOn: inDays(0),
      lines: [
        {
          description: 'Lettmelk',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 2490,
          toInventory: { unit: 'ml', quantityBase: 1000, locationId: fridge },
        },
        {
          description: 'Kjøttdeig',
          kind: 'food',
          categoryKey: 'meat',
          amountOre: 5990,
          toInventory: { unit: 'g', quantityBase: 400, locationId: fridge },
        },
      ],
    });
    // Some of the mince has been eaten: that batch is no longer untouched.
    await api.consume(purchase.lines[1]!.batch!.id, 100);
    await api.dispose();

    // Correct the milk's price: the total and the budget follow.
    await page.goto(`/budsjett/kjop/${purchase.id}`);
    await page.getByRole('link', { name: 'Rett kjøpet' }).click();
    const milk = page.getByRole('group', { name: 'Linje 1' });
    await expect(milk).toContainText('Lagt i matlageret som «Lettmelk»');
    await milk.getByLabel('Beløp').fill('29,90');
    await page.getByRole('button', { name: 'Lagre', exact: true }).click();
    await expect(page.getByText('Kjøpet er oppdatert.')).toBeVisible();
    await expect(page.getByText(kr('Sum: 89,80'))).toBeVisible();
    await page.getByRole('link', { name: 'Tilbake til budsjettet' }).click();
    await expect(page.getByRole('region', { name: 'Matbudsjett' })).toContainText(kr('89,80'));

    // Delete it: the untouched milk goes, the half-eaten mince stays (spec 04, decision 2).
    await page.getByRole('link', { name: 'Coop Extra' }).click();
    await page.getByRole('button', { name: 'Slett kjøpet' }).click();
    const dialog = page.getByRole('dialog', { name: 'Slette kjøpet?' });
    await expect(dialog.getByLabel('Fjern også 1 urørt vare fra matlageret')).toBeChecked();
    await expect(dialog).toContainText('1 vare fra kjøpet er brukt eller endret');
    await dialog.getByRole('button', { name: 'Slett kjøpet' }).click();
    await expect(
      page.getByText('Kjøpet er slettet, og 1 vare er fjernet fra matlageret.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Matbudsjett' })).toContainText(kr('0,00'));
    await expect(page.getByRole('heading', { name: 'Ingen kjøp denne måneden' })).toBeVisible();

    await page.goto('/matlager');
    await expect(page.getByRole('link', { name: 'Kjøttdeig' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Lettmelk' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Kjøttdeig' }).click();
    const batch = page.getByRole('region', { name: 'Parti 1' });
    await expect(batch).toContainText('300 g');
    await expect(batch.getByRole('link', { name: 'Se kjøpet' })).toHaveCount(0);
  });

  test('NFR-DATA-002: a double click on "Lagre kjøpet" gives one purchase', async ({ page }) => {
    await page.goto('/budsjett/kjop/ny');
    await page.getByLabel('Bare totalsum').check();
    await page.getByRole('textbox', { name: 'Totalsum' }).fill('250');
    await page.getByRole('button', { name: 'Lagre kjøpet' }).dblclick();
    await expect(page.getByText('Kjøpet er registrert.').first()).toBeVisible();
    const list = page.getByRole('region', { name: /^Kjøp i/ });
    await expect(list.getByRole('listitem')).toHaveCount(1);
  });

  test('NFR-UX-001/002: budget pages at 360 px and on desktop – no horizontal scroll, no axe violations', async ({
    page,
    playwright,
    account,
  }) => {
    const api = await apiAs(playwright, account);
    const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
    await api.setBudget(50_000);
    const purchase = await api.createPurchase({
      storeName: 'Kiwi',
      purchasedOn: inDays(0),
      lines: [
        {
          description: 'Lettmelk',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 62_490,
          toInventory: { unit: 'ml', quantityBase: 1000, locationId: fridge },
        },
        { description: 'Oppvaskmiddel', kind: 'nonFood', amountOre: 3990 },
      ],
    });
    await api.dispose();
    // As in phase 3: the sticky bottom menu covers controls on a short phone screen while axe runs.
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 600)
      await page.setViewportSize({ width: viewport.width, height: 2400 });
    for (const path of [
      '/budsjett',
      '/budsjett/kjop/ny',
      `/budsjett/kjop/${purchase.id}`,
      `/budsjett/kjop/${purchase.id}/rett`,
      '/',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path === '/budsjett/kjop/ny') {
        await page.getByLabel('Legg i matlageret').check();
        await page.getByLabel('Dato på pakken').selectOption({ label: 'Best før' });
      }
      if (path === '/budsjett') {
        // Over budget (624,90 kr of 500 kr) is shown in words.
        await expect(page.getByRole('region', { name: 'Matbudsjett' })).toContainText(
          'Over budsjett med',
        );
      }
      await page.evaluate(() => document.fonts.ready);
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    }
  });
});
