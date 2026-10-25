import { apiAs, BASE_URL, registerAccount, test, type Account } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npx playwright test screenshots
 * Phase 10 pages (shared household: members, invitation link, joining, "added by", sharing allergies), with a
 * seeded inventory, purchases and budget, and a second person who joins through the API.
 * (The phase 1–9 screenshots in docs/evidence/screenshots/ were made by earlier versions of this file; see Git
 * history.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = process.env.SCREENSHOT_DIR ?? 'docs/evidence/screenshots/fase-10';

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
  test.describe(`${colorScheme} – shared household`, () => {
    test.use({ colorScheme, isolatedAccount: true });
    test('husholdning', async ({ page, playwright, account, browser }, testInfo) => {
      await seed(playwright, account);
      const kari = await rawApi(playwright, account);
      await kari.patch('/me', { displayName: 'Kari' });
      await kari.patch(`/households/${kari.householdId}`, { name: 'Familien Nordmann' });

      // Ola joins through the API and adds a shopping line.
      const olaAccount = await renamed(playwright, 'Ola');
      const ola = await rawApi(playwright, olaAccount);
      const first = (await (
        await kari.post(`/households/${kari.householdId}/invitations`)
      ).json()) as {
        token: string;
      };
      await ola.post('/invitations/accept', { token: first.token });
      await ola.post(`/households/${kari.householdId}/shopping-list/items`, { text: 'Kaffe' });
      await kari.post(`/households/${kari.householdId}/shopping-list/items`, { text: 'Brød' });
      // A second, unused invitation for the join page.
      const second = (await (
        await kari.post(`/households/${kari.householdId}/invitations`)
      ).json()) as {
        token: string;
      };

      const suffix = colorScheme === 'light' ? 'lys' : 'mork';
      const shot = (target: typeof page, name: string, fullPage = true) =>
        target.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage,
        });
      const ready = (target: typeof page) => target.evaluate(() => document.fonts.ready);

      // FR-HH-001/003: the owner's page with members and invitations.
      await page.goto('/husholdning');
      await page.getByText(/Brukt av Ola/).waitFor();
      await ready(page);
      await shot(page, 'husholdning-eier');

      // FR-HH-001: the link, shown once.
      await page.getByRole('button', { name: 'Lag invitasjonslenke' }).click();
      await page.getByRole('dialog', { name: 'Invitasjonslenken er klar' }).waitFor();
      await ready(page);
      await shot(page, 'husholdning-lenke', false);
      await page.keyboard.press('Escape');

      // FR-HH-007: who added what.
      await page.goto('/handleliste');
      await page.getByText(/Lagt til av Ola/).waitFor();
      await ready(page);
      await shot(page, 'handleliste-lagt-til-av');

      // FR-HH-006: sharing allergies on the profile.
      await page.goto('/profil');
      await page.getByLabel('Ta hensyn til allergiene mine i «Familien Nordmann»').waitFor();
      await page.getByRole('heading', { name: 'Del med husholdningen' }).scrollIntoViewIfNeeded();
      await ready(page);
      await shot(page, 'profil-del-allergier', false);

      // FR-HH-002/004: Per opens the second link; Ola's view as a member with two households.
      const perAccount = await renamed(playwright, 'Per');
      const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
      const context = (state: Account['storageState']) =>
        browser.newContext({
          baseURL: BASE_URL,
          locale: 'nb-NO',
          timezoneId: 'Europe/Oslo',
          colorScheme,
          storageState: state,
          ...(viewport ? { viewport } : {}),
          ...(userAgent ? { userAgent } : {}),
          ...(deviceScaleFactor ? { deviceScaleFactor } : {}),
          ...(isMobile !== undefined ? { isMobile } : {}),
          ...(hasTouch !== undefined ? { hasTouch } : {}),
        });
      const perContext = await context(perAccount.storageState);
      const perPage = await perContext.newPage();
      await perPage.goto(`/bli-med#${second.token}`);
      await perPage.getByRole('button', { name: 'Bli med' }).waitFor();
      await ready(perPage);
      await shot(perPage, 'bli-med');
      await perContext.close();

      const olaContext = await context(olaAccount.storageState);
      const olaPage = await olaContext.newPage();
      await olaPage.goto('/husholdning');
      await olaPage.getByRole('heading', { name: 'Dine husholdninger' }).waitFor();
      await ready(olaPage);
      await shot(olaPage, 'husholdning-medlem');
      await olaContext.close();

      await kari.dispose();
      await ola.dispose();
    });
  });
}
