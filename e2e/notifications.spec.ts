import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { apiAs, expect, registerAccount, test } from './fixtures';
import type { Page } from '@playwright/test';

/*
 * Phase 11 end-to-end tests: notifications in the app and the food waste page, through the real UI, API and
 * database, on a 360 px phone and a desktop. IDs: FR-NOTIF-001–006, FR-WASTE-001–005, NFR-UX-001/002.
 */

/** A date `days` from today in Norway (same rule as the app). */
function inDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The bell is in the top bar on a phone and in the side menu on a desktop: use the one that is shown. */
const bell = (page: Page, name: string | RegExp) =>
  page.getByRole('link', { name, exact: true }).filter({ visible: true });

test.describe('notifications', () => {
  test.use({ isolatedAccount: true });

  test('FR-NOTIF-001/004: use-by date tomorrow → notification → open the item → dismiss → gone', async ({
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
      batch: { quantityBase: 400, locationId: fridge, expiry: { kind: 'use_by', date: inDays(1) } },
    });
    await api.dispose();

    await page.goto('/');
    await bell(page, 'Varsler, 1 nytt').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Varsler' })).toBeVisible();
    const notification = page.getByRole('link', {
      name: 'Kyllingfilet har siste forbruksdag i morgen',
    });
    await expect(notification).toBeVisible();
    await expect(
      page.getByText('Siste forbruksdag handler om mattrygghet. Bruk den før datoen.'),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    // Shown = seen: the bell no longer counts it.
    await expect(bell(page, 'Varsler')).toBeVisible();

    await notification.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kyllingfilet' })).toBeVisible();
    await page.goBack();

    await page
      .getByRole('button', { name: 'Avvis varselet: Kyllingfilet har siste forbruksdag i morgen' })
      .click();
    await expect(page.getByText('Varselet er avvist')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ingen varsler nå' })).toBeVisible();

    // Gone for good, also after a reload.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ingen varsler nå' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Kyllingfilet/ })).toHaveCount(0);
  });

  test('FR-NOTIF-005: settings – more days before gives an earlier notification', async ({
    page,
    playwright,
    account,
  }) => {
    const api = await apiAs(playwright, account);
    const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
    await api.createItem({
      name: 'Lettmelk',
      categoryKey: 'dairy',
      unit: 'ml',
      batch: {
        quantityBase: 1000,
        locationId: fridge,
        expiry: { kind: 'best_before', date: inDays(3) },
      },
    });
    await api.dispose();

    await page.goto('/varsler');
    await expect(page.getByRole('heading', { name: 'Ingen varsler nå' })).toBeVisible();
    await page.getByRole('link', { name: 'Velg hvilke varsler du vil ha' }).click();
    await page.getByLabel('Når skal varselet komme?').selectOption({ label: '3 dager før' });
    await page.getByRole('button', { name: 'Lagre varslene' }).click();
    await expect(page.getByText('Innstillingen er lagret')).toBeVisible();

    await page.goto('/varsler');
    await expect(page.getByRole('link', { name: 'Lettmelk er best før om 3 dager' })).toBeVisible();
    await expect(page.getByText('Ofte fortsatt god etter datoen. Se, lukt og smak.')).toBeVisible();
  });

  test('FR-NOTIF-003/006: a line another member adds is named; opening the list clears it', async ({
    page,
    playwright,
    account,
  }) => {
    const owner = await apiAs(playwright, account);
    const memberAccount = await registerAccount(playwright, 'member');
    const member = await apiAs(playwright, memberAccount);
    await member.acceptInvitation(await owner.invite());
    await owner.dispose();
    await member.dispose();
    // The member's session now has the owner's household active.
    const memberInHousehold = await apiAs(playwright, memberAccount);
    await memberInHousehold.addShoppingItem({ text: 'Havregryn' });
    await memberInHousehold.dispose();

    await page.goto('/varsler');
    const notification = page.getByRole('link', {
      name: 'Testbruker la til Havregryn på handlelisten',
    });
    await expect(notification).toBeVisible();
    await notification.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Handleliste' })).toBeVisible();
    await expect(page.getByText('Havregryn')).toBeVisible();

    await page.goto('/varsler');
    await expect(page.getByRole('heading', { name: 'Ingen varsler nå' })).toBeVisible();
  });
});

test.describe('food waste page', () => {
  test.use({ isolatedAccount: true });

  test('FR-WASTE-001–005: figures as text, the 12-month table, no horizontal scroll, no axe violations', async ({
    page,
    playwright,
    account,
  }) => {
    const api = await apiAs(playwright, account);
    const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
    const milk = await api.createItem({
      name: 'Lettmelk',
      categoryKey: 'dairy',
      unit: 'ml',
      batch: { quantityBase: 1000, locationId: fridge, priceOre: 2490 },
    });
    const bread = await api.createItem({
      name: 'Brød',
      categoryKey: 'bread',
      unit: 'stk',
      batch: { quantityBase: 1, locationId: fridge },
    });
    await api.discard(milk.batches[0]!.id, { quantityBase: 500, reason: 'expired' });
    await api.discard(bread.batches[0]!.id, { quantityBase: 1, reason: 'tooMuch' });
    await api.dispose();

    await page.goto('/');
    await page.getByRole('link', { name: 'Se svinnstatistikken' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Svinn' })).toBeVisible();
    const summary = page.getByRole('region', { name: /^Kastet i / });
    await expect(summary).toContainText('12,45 kr');
    await expect(summary).toContainText('2 kasseringer');
    await expect(summary).toContainText('100 % av den kjente verdien er anslått.');
    await expect(summary).toContainText('1 kassering har ukjent verdi og er ikke med i summen.');
    await expect(page.getByRole('region', { name: 'Hvorfor' })).toContainText('Kjøpt for mye');
    const table = page.getByRole('table', { name: /Kastet per måned/ });
    await expect(table.getByRole('row')).toHaveCount(13);

    await expectNoHorizontalScroll(page);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
  });
});
