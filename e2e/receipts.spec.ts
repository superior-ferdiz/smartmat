import sharp from 'sharp';
import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { apiAs, expect, test } from './fixtures';

/*
 * Phase 8 end-to-end: a receipt through the real UI, API, job queue (pg-boss) and database. The OCR is a fake in the
 * e2e server that "reads" every image as a made-up Coop receipt (Extra, 03.02.2026, 132,32 kr); no real receipt or
 * OCR engine is used. IDs: FR-RCPT-001/003/005/006/008, NFR-UX-001/002.
 */

/** A made-up photo: a light page; `seed` makes each one a different file. Narrower than 200 px reads as no text. */
async function photo(seed: number, width = 600) {
  return sharp({
    create: { width, height: Math.round(width * 1.5), channels: 3, background: '#f0eee6' },
  })
    .composite([
      {
        input: { create: { width: 6, height: 6, channels: 3, background: '#222222' } },
        left: seed % (width - 6),
        top: 10,
      },
    ])
    .jpeg()
    .toBuffer();
}

test.describe('receipts', () => {
  test.use({ isolatedAccount: true });

  test('FR-RCPT-001/005/006: upload → check → confirm → the purchase and the item exist', async ({
    page,
    account,
    playwright,
  }, testInfo) => {
    await page.goto('/budsjett');
    await page.getByRole('link', { name: 'Fra kvittering' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kvittering' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The camera button opens this input on a phone; here the file is given to it directly.
    await page.locator('#receipt-camera').setInputFiles({
      name: 'kvittering.jpg',
      mimeType: 'image/jpeg',
      buffer: await photo(testInfo.workerIndex * 100 + 1),
    });

    // FR-RCPT-003: it waits in the queue or is read, then the form is filled in.
    await expect(page.getByRole('heading', { level: 1, name: 'Sjekk kvitteringen' })).toBeVisible();
    await expect(page.getByLabel(/^Butikk/)).toHaveValue('Extra', { timeout: 15_000 });
    await expect(page.getByLabel('Kjøpsdato')).toHaveValue('2026-02-03');
    // ADR-0017: only store, date and total by default.
    await expect(page.getByRole('radio', { name: 'Bare totalsum' })).toBeChecked();
    await expect(page.getByRole('textbox', { name: 'Totalsum' })).toHaveValue('132,32');
    await expect(page.getByRole('img', { name: 'Bildet av kvitteringen' })).toBeVisible();
    await expectNoHorizontalScroll(page);

    // The user wants the bananas in the food stock: one line with the whole amount.
    await page.getByRole('radio', { name: 'Med linjer' }).check();
    const line = page.getByRole('group', { name: 'Linje 1' });
    await line.getByLabel('Hva').fill('Bananer');
    await line.getByLabel('Kategori').selectOption({ label: 'Frukt og grønt' });
    await line.getByLabel('Beløp').fill('132,32');
    await line.getByLabel('Legg i matlageret').check();
    await line.getByLabel('Måles i').selectOption({ label: 'Vekt (g, kg)' });
    await line.getByLabel('Mengde').fill('1196');
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Bekreft kjøpet' }).click();
    await expect(
      page.getByText('Kjøpet er registrert, og 1 vare er lagt i matlageret.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/budsjett\/kjop\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Extra').first()).toBeVisible();

    await page.goto('/matlager');
    await expect(page.getByRole('link', { name: /Bananer/ })).toBeVisible();

    // FR-RCPT-008: the image is gone once the purchase is confirmed.
    const api = await apiAs(playwright, account);
    expect((await api.receipts()).receipts).toEqual([]);
  });

  test('FR-RCPT-003: an unreadable photo fails with a reason; "fill in yourself" goes to the form', async ({
    page,
  }, testInfo) => {
    await page.goto('/budsjett/kvittering');
    await page.locator('#receipt-file').setInputFiles({
      name: 'liten.jpg',
      mimeType: 'image/jpeg',
      buffer: await photo(testInfo.workerIndex * 100 + 2, 120),
    });
    await expect(page.getByText(/Vi fant ingen tekst i bildet/)).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);
    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    await page.getByRole('link', { name: 'Fyll inn selv' }).click();
    await expect(page).toHaveURL(/\/budsjett\/kjop\/ny$/);
  });

  test('FR-RCPT-008: discarding a receipt deletes it', async ({ page }, testInfo) => {
    await page.goto('/budsjett/kvittering');
    await page.locator('#receipt-file').setInputFiles({
      name: 'k.jpg',
      mimeType: 'image/jpeg',
      buffer: await photo(testInfo.workerIndex * 100 + 3),
    });
    await expect(page.getByLabel(/^Butikk/)).toHaveValue('Extra', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Forkast kvitteringen' }).click();
    await page
      .getByRole('dialog', { name: 'Forkaste kvitteringen?' })
      .getByRole('button', { name: 'Forkast' })
      .click();
    await expect(page).toHaveURL(/\/budsjett\/kvittering$/);
    await expect(page.getByText('Ingen kvitteringer venter.')).toBeVisible();
  });
});
