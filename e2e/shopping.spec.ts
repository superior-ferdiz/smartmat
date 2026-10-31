import type { Page } from '@playwright/test';
import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { apiAs, expect, test } from './fixtures';

/*
 * Phase 6 end-to-end tests: the shopping list through the real UI, API and database, with the FICTIONAL
 * test recipes (source=test). IDs: FR-SHOP-001–003, NFR-DATA-002, NFR-UX-001/002, KURS-03.
 */

const openSection = (page: Page) =>
  page.getByRole('region', { name: /Skal kjøpes/ }).getByRole('listitem');
const checkedSection = (page: Page) =>
  page.getByRole('region', { name: /Huket av/ }).getByRole('listitem');

async function scoreOf(page: Page) {
  const text = await page
    .getByRole('region', { name: 'Hvorfor denne plasseringen' })
    .getByRole('listitem')
    .last()
    .textContent();
  return Number(/(\d+) poeng/.exec(text ?? '')?.[1]);
}

test.describe('recipe → shopping list → inventory → the recipe ranks higher', () => {
  test.use({ isolatedAccount: true });

  test('FR-SHOP-002/003: the whole flow', async ({ page }) => {
    await page.goto('/oppskrifter');
    await page.getByRole('link', { name: 'Testrett: pannekaker' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Testrett: pannekaker' }),
    ).toBeVisible();
    const before = await scoreOf(page);

    // FR-SHOP-002: only what is missing is ticked; the staple (salt) is offered, not ticked.
    await page.getByRole('button', { name: 'Legg manglende i handlelisten' }).click();
    const suggestions = page.getByRole('dialog', { name: 'Legg i handlelisten' });
    await expect(suggestions.getByLabel('Melk')).toBeChecked();
    await expect(suggestions.getByLabel('Egg')).toBeChecked();
    await expect(suggestions.getByLabel('Hvetemel')).toBeChecked();
    await expect(suggestions.getByLabel('Salt')).not.toBeChecked();
    await expect(suggestions.getByText('Basisvare – sjekk at du har')).toBeVisible();
    await suggestions.getByRole('button', { name: 'Legg i handlelisten' }).click();
    await expect(page.getByText('Lagt i handlelisten: 3 nye')).toBeVisible();

    // The lines carry the missing amounts and where they came from.
    await page.goto('/handleliste');
    await expect(openSection(page)).toHaveCount(3);
    const melk = openSection(page).filter({ hasText: 'Melk' });
    await expect(melk).toContainText('500 ml');
    await expect(melk).toContainText('Fra Testrett: pannekaker');

    // Tick off two lines; they move to "Huket av" at once, and stay ticked after a reload.
    await page.getByRole('checkbox', { name: /^Melk/ }).click();
    await page.getByRole('checkbox', { name: /^Egg/ }).click();
    await expect(checkedSection(page)).toHaveCount(2);
    await expect(openSection(page)).toHaveCount(1);
    await page.reload();
    await expect(checkedSection(page)).toHaveCount(2);

    // FR-SHOP-003: confirm and put them in the inventory (new items, amounts filled in from the lines).
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    const stock = page.getByRole('dialog', { name: 'Legg i matlageret' });
    const melkLine = stock.getByRole('group', { name: 'Melk' });
    await expect(melkLine.getByLabel('Mengde')).toHaveValue('500');
    await expect(melkLine.getByText('Matcher oppskrifter med Melk.')).toBeVisible();
    await melkLine.getByLabel('Dato', { exact: true }).first().selectOption({ label: 'Best før' });
    await expect(stock.getByRole('group', { name: 'Egg' }).getByLabel('Mengde')).toHaveValue('3');
    await expect(stock.getByText(/registreres ikke som et kjøp/)).toBeVisible();
    // The date input appears once a kind of date is chosen.
    await melkLine.locator('input[type="date"]').fill('2030-01-01');
    await stock.getByRole('button', { name: 'Legg i matlageret' }).click();
    await expect(page.getByText('2 varer er lagt i matlageret.')).toBeVisible();
    await expect(checkedSection(page)).toHaveCount(0);
    await expect(openSection(page)).toHaveCount(1);
    await expect(openSection(page)).toContainText('Hvetemel');

    // The items are in the inventory and linked to the recipe again: it ranks higher.
    await page.goto('/oppskrifter');
    await page.getByRole('link', { name: 'Testrett: pannekaker' }).click();
    const have = page.getByRole('heading', { level: 3, name: 'Har' }).locator('..');
    await expect(have).toContainText('5 dl melk');
    await expect(have).toContainText('3 egg');
    expect(await scoreOf(page)).toBeGreaterThan(before);

    // ADR-0007 (decision 4): no purchase was recorded.
    await page.goto('/budsjett');
    await expect(page.getByText('Ingen kjøp denne måneden')).toBeVisible();
  });

  test('NFR-DATA-002: a double click on "Legg i matlageret" gives one batch', async ({
    page,
    playwright,
    account,
  }) => {
    const api = await apiAs(playwright, account);
    const { item } = await api.addShoppingItem({
      text: 'Tannkrem',
      quantity: { quantityBase: 1, unit: 'stk' },
    });
    await api.setShoppingItemChecked(item.id, true);
    await api.dispose();

    await page.goto('/handleliste');
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    const stock = page.getByRole('dialog', { name: 'Legg i matlageret' });
    await stock.getByRole('group', { name: 'Tannkrem' }).waitFor();
    await stock.getByRole('button', { name: 'Legg i matlageret' }).dblclick();
    await expect(page.getByText('1 vare er lagt i matlageret.')).toBeVisible();

    await page.goto('/matlager');
    await expect(page.getByRole('link', { name: /Tannkrem/ })).toHaveCount(1);
    await page.getByRole('link', { name: /Tannkrem/ }).click();
    await expect(page.getByText('1 stk').first()).toBeVisible();
  });
});

test.describe('FR-SHOP-001 the list by hand', () => {
  test.use({ isolatedAccount: true });

  test('add with Enter, tick, edit and remove', async ({ page }) => {
    await page.goto('/handleliste');
    await expect(page.getByRole('heading', { name: 'Handlelisten er tom' })).toBeVisible();

    const text = page.getByRole('textbox', { name: 'Vare' });
    await text.fill('Tannkrem');
    await text.press('Enter');
    await expect(openSection(page)).toHaveCount(1);
    await expect(text).toHaveValue('');
    await expect(text).toBeFocused();

    await text.fill('Melk');
    await page
      .getByLabel(/Mengde/)
      .first()
      .fill('1,5');
    await page.getByLabel('Enhet').first().selectOption('l');
    await text.press('Enter');
    await expect(openSection(page).filter({ hasText: 'Melk' })).toContainText('1,5 l');

    await page.getByRole('checkbox', { name: /^Tannkrem/ }).click();
    await expect(checkedSection(page)).toHaveCount(1);
    await page.getByRole('checkbox', { name: /^Tannkrem/ }).click();
    await expect(checkedSection(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Endre Melk' }).click();
    const edit = page.getByRole('dialog', { name: 'Endre linje' });
    await edit.getByLabel(/Mengde/).fill('2');
    await edit.getByRole('button', { name: 'Lagre' }).click();
    await expect(openSection(page).filter({ hasText: 'Melk' })).toContainText('2 l');

    await page.getByRole('button', { name: 'Fjern Tannkrem' }).click();
    await expect(openSection(page)).toHaveCount(1);
    await expect(page.getByRole('checkbox', { name: /^Melk/ })).toBeFocused();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`(${colorScheme}) NFR-UX-001/002: no horizontal scroll, big tap targets, no axe violations`, async ({
      page,
      playwright,
      account,
    }) => {
      const api = await apiAs(playwright, account);
      await api.addShoppingItem({
        text: 'Hvetemel til pannekaker og vafler i helgen, helst økologisk',
        quantity: { quantityBase: 2000, unit: 'g' },
      });
      const { item } = await api.addShoppingItem({ text: 'Egg' });
      await api.setShoppingItemChecked(item.id, true);
      await api.dispose();
      await page.emulateMedia({ colorScheme });

      await page.goto('/handleliste');
      await expect(openSection(page)).toHaveCount(1);
      await page.evaluate(() => document.fonts.ready);
      await expectNoHorizontalScroll(page);
      // Every row and its buttons are at least 44 px high (WCAG 2.5.5 target, Apple HIG).
      for (const box of await page.locator('li[data-item-id]').all()) {
        expect((await box.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      for (const button of await page.locator('li[data-item-id] button').all()) {
        expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);

      await page.getByRole('button', { name: 'Legg i matlageret' }).click();
      await page.getByRole('dialog', { name: 'Legg i matlageret' }).getByRole('group').waitFor();
      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });
  }
});
