import { apiAs, test, type Account } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npm run test:e2e -- screenshots
 * Phase 7 pages (barcode scanning), with a seeded inventory, purchases and budget. Open Food Facts is the e2e API's
 * fake (made-up products). (The phase 1–6 screenshots in docs/evidence/screenshots/ were made by earlier versions of
 * this file; see Git history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-7';

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

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – scanning`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('skann', async ({ page, playwright, account }, testInfo) => {
      await seed(playwright, account);
      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (name: string, fullPage = false) =>
        page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage,
        });
      const ready = () => page.evaluate(() => document.fonts.ready);

      // FR-SCAN-001/-003: the start of the page (camera button, typed code, credit to Open Food Facts).
      await page.goto('/skann');
      await page.getByRole('button', { name: 'Start kamera' }).waitFor();
      await ready();
      await shot('skann-start', true);

      // FR-SCAN-002: a known code fills in the form.
      await page.goto('/skann?kode=7038010000737');
      await page.getByText(/Funnet i Open Food Facts/).waitFor();
      await page.getByLabel(/Navn på varen/).waitFor();
      await ready();
      await shot('skann-funnet', true);

      // FR-SCAN-004 / NFR-REL-001: unknown code and a lookup that does not answer.
      await page.goto('/skann?kode=4006381333931');
      await page.getByText(/Vi fant ikke denne strekkoden/).waitFor();
      await ready();
      await shot('skann-ukjent');
      await page.goto('/skann?kode=0036000291452');
      await page.getByText(/svarer ikke akkurat nå/).waitFor();
      await ready();
      await shot('skann-svarer-ikke');

      // FR-SCAN-001: no camera access.
      await page.goto('/skann');
      await page.getByRole('button', { name: 'Start kamera' }).click();
      await page.getByText(/Du kan skrive inn strekkoden i stedet/).waitFor();
      await ready();
      await shot('skann-kamera-feil');
    });
  });
}
