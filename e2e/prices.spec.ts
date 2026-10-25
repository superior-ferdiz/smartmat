import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { BASE_URL, apiAs, expect, test } from './fixtures';

/*
 * Phase 12 end-to-end tests: prices through the real UI, API and database.
 * IDs: FR-PRICE-001–005, NFR-REL-001, NFR-UX-001/002.
 * The API's Kassalapp is fake (apps/api/test/fakeKassalapp.ts, made-up prices and key); nothing leaves the machine.
 * For KNOWN it has two fresh prices (Spar 24,90, Meny 26,90), one stale (Oda) and one from a chain Kassalapp no
 * longer collects (Kiwi, 2024).
 */

const KNOWN = '7038010000737';
const SLOW = '0036000291452';
const NAME = 'Testmeieriet Lettmelk 1 %';

test.describe('prices', () => {
  test.use({ isolatedAccount: true });

  test('FR-PRICE-001–004: scan → chain prices and own prices → estimate on the shopping list', async ({
    page,
    playwright,
    account,
  }) => {
    const urls: string[] = [];
    page.on('request', (request) => urls.push(request.url()));

    // 1. Scan: the form comes first, the prices under it. Nothing of our own yet.
    await page.goto(`/skann?kode=${KNOWN}`);
    await expect(page.getByLabel(/Navn på varen/)).toHaveValue(NAME);
    const prices = page.getByRole('region', { name: 'Priser' });
    await expect(
      prices.getByText('Billigst sist observert: Spar, 24,90 kr', { exact: false }),
    ).toBeVisible();
    await expect(prices.getByText(/Rema 1000, Kiwi og Coop er ikke med/)).toBeVisible();
    await expect(prices.getByText('Eldre priser (2)')).toBeVisible();
    await expect(
      prices.getByText(/Dere har ikke lagt denne strekkoden i matlageret før/),
    ).toBeVisible();

    // The old prices are folded away; opened, they say why they are not counted.
    await prices.getByText('Eldre priser (2)').click();
    await expect(
      prices.getByText('Kassalapp henter ikke lenger priser fra denne kjeden'),
    ).toBeVisible();

    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);

    // 2. Confirm (no price on the batch: FR-PRICE-005, the chain price is never copied).
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    await expect(page.getByText(`${NAME} er lagt i matlageret.`)).toBeVisible();

    // 3. A purchase with a line for the same item gives an own price.
    const api = await apiAs(playwright, account);
    const [item] = await api.inventory();
    const fridge = (await api.locations()).find((l) => l.kind === 'fridge')!.id;
    await api.createPurchase({
      storeName: 'Testbutikken',
      purchasedOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo' }).format(new Date()),
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
    await api.dispose();

    await page.goto(`/skann?kode=${KNOWN}`);
    const own = page.getByRole('region', { name: 'Priser' });
    const paid = own.getByRole('listitem').filter({ hasText: 'Fra kjøp hos Testbutikken' });
    await expect(paid).toBeVisible();
    await expect(paid.getByText('26,90 kr per l')).toBeVisible();

    // 4. The shopping list: an estimate for 1 of 2 lines, never a total.
    await page.goto('/handleliste');
    const estimate = page.getByRole('region', { name: 'Anslått pris' });
    await expect(estimate.getByText('Anslag for 1 av 2 linjer: ca. 13,45 kr')).toBeVisible();
    await expect(estimate.getByText('1 linje mangler pris og er ikke med.')).toBeVisible();
    await estimate.getByText('Vis anslag per linje').click();
    await expect(estimate.getByText(/ca\. 13,45\skr \(regnet ut fra mengden/)).toBeVisible();
    await expect(estimate.getByText('ingen vare i matlageret med dette navnet')).toBeVisible();

    await useTallPhoneViewport(page);
    await expectNoAxeViolations(page);
    await expectNoHorizontalScroll(page);

    // Only our own server was asked – the browser never talks to Kassalapp.
    expect([...new Set(urls.map((u) => new URL(u).origin))]).toEqual([BASE_URL]);
  });

  test('NFR-REL-001: Kassalapp does not answer → a clear message, and the scan form still works', async ({
    page,
  }) => {
    await page.goto(`/skann?kode=${SLOW}`);
    const prices = page.getByRole('region', { name: 'Priser' });
    await expect(
      prices.getByText('Prisoppslaget svarer ikke akkurat nå. Prøv igjen senere.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Legg i matlageret' })).toBeVisible();
  });
});
