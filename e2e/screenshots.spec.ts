import sharp from 'sharp';
import { COOP_RECEIPT } from '@smartmat/shared/test-fixtures/receipts';
import { apiAs, test, type Account } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npm run test:e2e -- screenshots
 * Phase 8 pages (receipts), with a seeded inventory, purchases and budget. The receipt photo is generated here from
 * the made-up Coop receipt text that the e2e API's fake OCR "reads" (no real receipt). (The phase 1–7 screenshots in
 * docs/evidence/screenshots/ were made by earlier versions of this file; see Git history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-8';

function inDays(days: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** A small, realistic inventory so the screenshots show real states (passed, today, soon, no date). */
async function seed(
  playwright: Parameters<Parameters<typeof test>[2]>[0]['playwright'],
  account: Account,
) {
  const api = await apiAs(playwright, account);
  const locations = await api.locations();
  const at = (kind: string) => locations.find((l) => l.kind === kind)!.id;
  const items = [
    ['Kyllingfilet', 'meat', 'g', 400, 'fridge', 'use_by', 0, 7990],
    ['Kjøttdeig', 'meat', 'g', 400, 'fridge', 'use_by', -1, 4990],
    ['Lettmelk', 'dairy', 'ml', 1750, 'fridge', 'best_before', 2, 2490],
    ['Yoghurt naturell', 'dairy', 'g', 500, 'fridge', 'best_before', -2, 2290],
    ['Laks', 'fish', 'g', 600, 'freezer', 'best_before', 60, 11990],
    ['Ris', 'dryGoods', 'g', 1000, 'pantry', null, 0, 3490],
    ['Hermetiske tomater', 'canned', 'g', 400, 'pantry', 'best_before', 400, 1290],
  ] as const;
  const created: { id: string; batches: { id: string }[] }[] = [];
  for (const [name, categoryKey, unit, quantityBase, place, kind, days, priceOre] of items) {
    created.push(
      await api.createItem({
        name,
        categoryKey,
        unit,
        batch: {
          quantityBase,
          locationId: at(place),
          expiry: kind ? { kind, date: inDays(days) } : null,
          priceOre,
        },
      }),
    );
  }
  // Phase 4: a budget and three purchases this month (lines into the inventory, non-food, only a total).
  await api.setBudget(400_000);
  const purchase = await api.createPurchase({
    storeName: 'Rema 1000 Bø',
    purchasedOn: inDays(0),
    lines: [
      {
        description: 'Smør',
        kind: 'food',
        categoryKey: 'dairy',
        amountOre: 4590,
        toInventory: { unit: 'g', quantityBase: 500, locationId: at('fridge') },
      },
      {
        description: 'Kyllingfilet',
        kind: 'food',
        categoryKey: 'meat',
        amountOre: 11_990,
        toInventory: {
          unit: 'g',
          quantityBase: 800,
          locationId: at('fridge'),
          expiry: { kind: 'use_by', date: inDays(3) },
        },
      },
      { description: 'Epler', kind: 'food', categoryKey: 'fruitVeg', amountOre: 3490 },
      { description: 'Oppvaskmiddel', kind: 'nonFood', amountOre: 3990 },
    ],
  });
  await api.createPurchase({ storeName: 'Kiwi', purchasedOn: inDays(0), totalOre: 64_550 });
  // Phase 5: one allergen, so the list shows a hidden recipe and the warnings.
  await api.setAllergens(['egg']);
  await api.dispose();
  return { created, purchaseId: purchase.id };
}

/** A picture of the made-up receipt: its lines (without the confidence) on light paper on a dark table. */
async function receiptPhoto(seed: number, width = 620) {
  const rows = COOP_RECEIPT.map((line) => line.text.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  const height = 60 + rows.length * 30;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    '<rect width="100%" height="100%" fill="#f4f2ec"/><g font-family="DejaVu Sans Mono" font-size="19" fill="#222">' +
    rows
      .map((row, i) => `<text x="24" y="${44 + i * 30}" xml:space="preserve">${row}</text>`)
      .join('') +
    `</g><rect x="${seed % 40}" y="2" width="2" height="2" fill="#f4f2ec"/></svg>`;
  const paper = await sharp(Buffer.from(svg)).png().toBuffer();
  return sharp({
    create: { width: width + 160, height: height + 160, channels: 3, background: '#2a2a2a' },
  })
    .composite([{ input: paper, left: 80, top: 80 }])
    .jpeg({ quality: 85 })
    .toBuffer();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – receipts`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('kvittering', async ({ page, playwright, account }, testInfo) => {
      await seed(playwright, account);
      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (name: string, fullPage = false) =>
        page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage,
        });
      const ready = () => page.evaluate(() => document.fonts.ready);

      // FR-RCPT-001: the upload page.
      await page.goto('/budsjett/kvittering');
      await page.getByRole('button', { name: 'Ta bilde' }).waitFor();
      await ready();
      await shot('kvittering-start', true);

      // FR-RCPT-003: a photo that cannot be read.
      await page.locator('#receipt-file').setInputFiles({
        name: 'liten.jpg',
        mimeType: 'image/jpeg',
        buffer: await sharp({
          create: { width: 120, height: 180, channels: 3, background: '#f0eee6' },
        })
          .jpeg()
          .toBuffer(),
      });
      await page.getByText(/Vi fant ingen tekst i bildet/).waitFor({ timeout: 15_000 });
      await ready();
      await shot('kvittering-feilet');

      // FR-RCPT-005: the review, filled in with store, date and total (ADR-0017).
      await page.goto('/budsjett/kvittering');
      await page.locator('#receipt-file').setInputFiles({
        name: 'kvittering.jpg',
        mimeType: 'image/jpeg',
        buffer: await receiptPhoto(testInfo.workerIndex + (colorScheme === 'light' ? 1 : 2)),
      });
      await page
        .getByLabel(/^Butikk/)
        .and(page.locator('[value="Extra"]'))
        .waitFor({ timeout: 15_000 });
      await page
        .getByRole('img', { name: 'Bildet av kvitteringen' })
        .evaluate((img: HTMLImageElement) => img.decode());
      await ready();
      await shot('kvittering-sjekk', true);

      // FR-RCPT-006: confirmed.
      await page.getByRole('button', { name: 'Bekreft kjøpet' }).click();
      await page.getByText('Kjøpet er registrert.').waitFor();
      await ready();
      await shot('kvittering-bekreftet', true);
    });
  });
}
