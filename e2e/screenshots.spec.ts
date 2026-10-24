import { apiAs, test, type Account } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  E2E_RECIPE_SEED=repo SCREENSHOTS=1 npm run test:e2e -- screenshots
 * Phase 9 pages (meal plan, recipes from Wikibooks), with a seeded inventory, purchases and budget. With
 * E2E_RECIPE_SEED=repo the e2e API has the translated recipes from prisma/seed/ instead of the test fixtures.
 * (The phase 1–8 screenshots in docs/evidence/screenshots/ were made by earlier versions of this file; see Git
 * history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-9';

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

/** Monday of the week after this one, so every day of the shown week is still to come. */
function nextMonday() {
  const today = inDays(0);
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return inDays(7 - weekday);
}

const addDays = (date: string, days: number) => {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – meal plan`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('maltidsplan', async ({ page, playwright, account }, testInfo) => {
      await seed(playwright, account);
      const api = await apiAs(playwright, account);
      const bySlug = new Map((await api.recipes()).map((r) => [r.slug, r.id]));
      const monday = nextMonday();
      const plan = [
        [0, 'farikal', 4],
        [1, 'rod-linsesuppe', 4],
        [3, 'svenske-kjottboller', 2],
        [4, 'laks-med-ris-og-saus', 3],
      ] as const;
      for (const [day, slug, servings] of plan) {
        const recipeId = bySlug.get(slug);
        if (!recipeId) throw new Error(`run with E2E_RECIPE_SEED=repo (no recipe ${slug})`);
        await api.addMealEntry({
          kind: 'recipe',
          recipeId,
          servings,
          date: addDays(monday, day),
          meal: 'dinner',
        });
      }
      await api.addMealEntry({
        kind: 'note',
        note: 'Rester',
        date: addDays(monday, 2),
        meal: 'dinner',
      });
      await api.addMealEntry({
        kind: 'note',
        note: 'Spise ute',
        date: addDays(monday, 5),
        meal: 'dinner',
      });
      await api.dispose();

      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (name: string, fullPage = true) =>
        page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage,
        });
      const ready = () => page.evaluate(() => document.fonts.ready);

      // FR-PLAN-001/003: next week, with what is missing.
      await page.goto('/maltidsplan');
      await page.getByRole('link', { name: 'Neste uke' }).click();
      await page.getByRole('checkbox', { name: /^Lammekjøtt/ }).waitFor();
      await ready();
      await shot('maltidsplan-uke');

      // FR-PLAN-005: the add dialog, ranked for the day.
      await page.getByRole('button', { name: /^Legg til Middag, søndag/ }).click();
      await page.getByRole('radio', { name: /Fårikål/ }).waitFor();
      await ready();
      await shot('maltidsplan-legg-til', false);
      await page.keyboard.press('Escape');

      // FR-PLAN-004: on the shopping list.
      await page.getByRole('button', { name: 'Legg på handlelisten' }).click();
      await page.getByText(/Lagt på handlelisten:/).waitFor();
      await page.goto('/handleliste');
      await page
        .getByText(/Måltidsplan .*: Fårikål/)
        .first()
        .waitFor();
      await ready();
      await shot('maltidsplan-handleliste');

      // FR-REC-006 / FR-PLAN-002: a translated recipe for 6 servings, with source and licence.
      await page.goto(`/oppskrifter/${bySlug.get('farikal')}?porsjoner=6`);
      await page.getByRole('heading', { name: 'Kilde og lisens' }).waitFor();
      await ready();
      await shot('oppskrift-wikibooks');

      await page.goto('/oppskrifter/kilder');
      await page.getByRole('link', { name: 'Fårikål', exact: true }).waitFor();
      await ready();
      await shot('oppskrifter-kilder');
    });
  });
}
