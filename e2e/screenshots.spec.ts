import { apiAs, BASE_URL, registerAccount, test, type Account } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npx playwright test screenshots
 * Phase 11 pages (notifications, the bell, food waste figures, notification settings), with a seeded inventory,
 * purchases, budget and waste log, and a second person who adds to the shopping list through the API.
 * (The phase 1–10 screenshots in docs/evidence/screenshots/ were made by earlier versions of this file; see Git
 * history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-11';

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

type Playwright = Parameters<Parameters<typeof test>[2]>[0]['playwright'];

/** The raw API as a logged-in account (for the invitation calls apiAs does not have). */
async function rawApi(playwright: Playwright, account: Account) {
  const cookie = account.storageState.cookies.find((c) => c.name === 'smartmat_session');
  const api = await playwright.request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL, cookie: `smartmat_session=${cookie?.value ?? ''}` },
  });
  const session = await (await api.get('/api/v1/auth/session')).json();
  const headers = { 'x-csrf-token': session.csrfToken as string };
  return {
    householdId: session.user.householdId as string,
    post: (path: string, data?: unknown) =>
      api.post(`/api/v1${path}`, { headers, ...(data === undefined ? {} : { data }) }),
    patch: (path: string, data: unknown) => api.patch(`/api/v1${path}`, { headers, data }),
    put: (path: string, data: unknown) => api.put(`/api/v1${path}`, { headers, data }),
    dispose: () => api.dispose(),
  };
}

async function renamed(playwright: Playwright, displayName: string): Promise<Account> {
  const account = await registerAccount(playwright, 'skjerm');
  const api = await rawApi(playwright, account);
  await api.patch('/me', { displayName });
  await api.patch(`/households/${api.householdId}`, { name: `${displayName}s` });
  await api.dispose();
  return { ...account, displayName };
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} – notifications and food waste`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('varsler og svinn', async ({ page, playwright, account }, testInfo) => {
      const { created } = await seed(playwright, account);
      const kari = await rawApi(playwright, account);
      await kari.patch('/me', { displayName: 'Kari' });
      // 84 % of the budget is used: the "nearly used" notification.
      await kari.put(`/households/${kari.householdId}/budget`, { amountOre: 100_000 });
      // Three days before, so the best-before milk also gives a notification.
      await kari.put('/me/notification-settings', {
        useBy: true,
        bestBefore: true,
        daysBefore: 3,
        budget: true,
        shopping: true,
      });
      // The waste log: estimated (from the price), entered and unknown values, different reasons.
      const batch = (name: string) =>
        created[
          [
            'Kyllingfilet',
            'Kjøttdeig',
            'Lettmelk',
            'Yoghurt naturell',
            'Laks',
            'Ris',
            'Hermetiske tomater',
          ].indexOf(name)
        ]!.batches[0]!.id;
      const base = `/households/${kari.householdId}/inventory/batches`;
      await kari.post(`${base}/${batch('Yoghurt naturell')}/discard`, {
        quantityBase: 250,
        reason: 'expired',
      });
      await kari.post(`${base}/${batch('Kjøttdeig')}/discard`, {
        quantityBase: 400,
        reason: 'expired',
        valueOre: 4990,
      });
      await kari.post(`${base}/${batch('Ris')}/discard`, { quantityBase: 200, reason: 'tooMuch' });
      await kari.post(`${base}/${batch('Laks')}/discard`, {
        quantityBase: 150,
        reason: 'leftovers',
      });

      // Ola joins through the API and adds a shopping line.
      const olaAccount = await renamed(playwright, 'Ola');
      const ola = await rawApi(playwright, olaAccount);
      const invitation = (await (
        await kari.post(`/households/${kari.householdId}/invitations`)
      ).json()) as { token: string };
      await ola.post('/invitations/accept', { token: invitation.token });
      await ola.post(`/households/${kari.householdId}/shopping-list/items`, { text: 'Kaffe' });

      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (name: string, fullPage = true) =>
        page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage,
        });
      const ready = () => page.evaluate(() => document.fonts.ready);

      // FR-NOTIF-004: the bell with the number of new notifications.
      await page.goto('/');
      await page
        .getByRole('link', { name: /^Varsler, \d+ nye$/ })
        .filter({ visible: true })
        .waitFor();
      await ready();
      await shot('oversikt-bjelle', false);

      // FR-NOTIF-001–003: the list (use by passed/today/soon, best before, budget, shopping list).
      await page.goto('/varsler');
      await page.getByRole('link', { name: /Ola la til Kaffe/ }).waitFor();
      await ready();
      await shot('varsler');

      // FR-WASTE-001–005: this month's waste figures and the 12-month table.
      await page.goto('/svinn');
      await page.getByRole('table', { name: /Kastet per måned/ }).waitFor();
      await ready();
      await shot('svinn');

      // FR-NOTIF-005: the settings.
      await page.goto('/innstillinger');
      await page.getByRole('button', { name: 'Lagre varslene' }).waitFor();
      await page.getByRole('heading', { name: 'Varsler' }).scrollIntoViewIfNeeded();
      await ready();
      await shot('innstillinger-varsler', false);

      await kari.dispose();
      await ola.dispose();
    });
  });
}
