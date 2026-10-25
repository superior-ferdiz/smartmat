import { apiAs, test } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npx playwright test screenshots
 * Phase 12 pages (prices on the scan page and the item page, the estimate on the shopping list). The chain prices come
 * from the API's fake Kassalapp (apps/api/test/fakeKassalapp.ts): made-up prices, never real ones.
 * (The phase 1–11 screenshots in docs/evidence/screenshots/ were made by earlier versions of this file; see Git
 * history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-12';
const KNOWN = '7038010000737';
const NAME = 'Testmeieriet Lettmelk 1 %';

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date());
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – prices`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('priser', async ({ page, playwright, account }, testInfo) => {
      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (name: string) =>
        page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage: true,
        });
      const ready = () => page.evaluate(() => document.fonts.ready);

      // Scan the made-up milk into the inventory through the UI, then one purchase line with a price for it.
      await page.goto(`/skann?kode=${KNOWN}`);
      await page.getByRole('button', { name: 'Legg i matlageret' }).click();
      await page.getByText(`${NAME} er lagt i matlageret.`).waitFor();
      const api = await apiAs(playwright, account);
      const [item] = await api.inventory();
      const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
      await api.createPurchase({
        storeName: 'Testbutikken',
        purchasedOn: today(),
        lines: [
          {
            description: NAME,
            kind: 'food',
            categoryKey: 'dairy',
            amountOre: 2690,
            toInventory: { itemId: item!.id, quantityBase: 1000, locationId: fridge },
          },
        ],
      });
      await api.addShoppingItem({ text: NAME, quantity: { quantityBase: 500, unit: 'ml' } });
      await api.addShoppingItem({ text: 'Tannkrem' });
      await api.addShoppingItem({ text: 'Egg', quantity: { quantityBase: 6, unit: 'stk' } });
      await api.dispose();

      // FR-PRICE-001/-002/-004: the scan page with own prices, chain prices and the older ones opened.
      await page.goto(`/skann?kode=${KNOWN}`);
      const prices = page.getByRole('region', { name: 'Priser' });
      await prices.getByText('Fra kjøp hos Testbutikken').waitFor();
      await prices.getByText(/^Eldre priser/).click();
      await ready();
      await shot('skann-priser');

      // FR-PRICE-002: the item page.
      await page.goto(`/matlager/${item!.id}`);
      await page
        .getByRole('region', { name: 'Priser' })
        .getByText(/Billigst sist observert/)
        .waitFor();
      await ready();
      await shot('vare-priser');

      // FR-PRICE-003: the shopping list estimate with the lines opened.
      await page.goto('/handleliste');
      const estimate = page.getByRole('region', { name: 'Anslått pris' });
      await estimate.getByText(/^Anslag for/).waitFor();
      await estimate.getByText('Vis anslag per linje').click();
      await ready();
      await shot('handleliste-anslag');
    });
  });
}
