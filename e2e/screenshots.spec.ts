import { apiAs, test, type Account } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npm run test:e2e -- screenshots
 * Phase 4 pages, with a seeded inventory, purchases and budget. (The phase 1–3 screenshots in
 * docs/evidence/screenshots/ were made by earlier versions of this file; see Git history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-4';
const LOGGED_IN_PAGES = [
  ['oversikt', '/'],
  ['budsjett', '/budsjett'],
  ['nytt-kjop', '/budsjett/kjop/ny'],
] as const;

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
  await api.dispose();
  return { created, purchaseId: purchase.id };
}

for (const colorScheme of ['light', 'dark'] as const) {
  const suffix = colorScheme === 'light' ? 'lys' : 'mork';

  test.describe(`${colorScheme} – logged in`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    for (const [name, path] of LOGGED_IN_PAGES) {
      test(name, async ({ page, playwright, account }, testInfo) => {
        await seed(playwright, account);
        await page.goto(path);
        await page.getByRole('heading', { level: 1 }).waitFor();
        if (path === '/budsjett/kjop/ny') {
          // Show the inventory part of a line, the most involved part of the form.
          await page.getByLabel('Legg i matlageret').check();
        } else {
          await page
            .getByRole('region', { name: /Matbudsjett/ })
            .getByText(/kr/)
            .first()
            .waitFor();
        }
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          // Phones: just the screen (a full-page capture draws the sticky bottom menu mid-page).
          fullPage: !testInfo.project.name.startsWith('mobil'),
        });
      });
    }
  });
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – purchase page and delete dialog`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('kjop-og-dialog', async ({ page, playwright, account }, testInfo) => {
      const { purchaseId } = await seed(playwright, account);
      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const full = !testInfo.project.name.startsWith('mobil');
      await page.goto(`/budsjett/kjop/${purchaseId}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `${OUT}/kjop-${testInfo.project.name}-${suffix}.png`,
        fullPage: full,
      });
      await page.goto(`/budsjett/kjop/${purchaseId}/rett`);
      await page.getByRole('group', { name: 'Linje 1' }).waitFor();
      await page.screenshot({
        path: `${OUT}/rett-kjop-${testInfo.project.name}-${suffix}.png`,
        fullPage: full,
      });
      await page.goto(`/budsjett/kjop/${purchaseId}`);
      await page.getByRole('button', { name: 'Slett kjøpet' }).click();
      await page.getByRole('dialog').waitFor();
      await page.screenshot({
        path: `${OUT}/slett-kjop-dialog-${testInfo.project.name}-${suffix}.png`,
      });
    });
  });
}
