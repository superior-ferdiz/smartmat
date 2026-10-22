import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { BASE_URL, apiAs, expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/*
 * Phase 7 end-to-end tests: barcode scanning through the real UI, API and database.
 * IDs: FR-SCAN-001–005, NFR-REL-001, NFR-DATA-002, NFR-UX-001/002.
 * The API's Open Food Facts is fake (apps/api/test/fakeOff.ts, made-up products); nothing leaves the machine.
 * The real camera is not tested here (no camera in CI) – that is a manual test on a phone (chapter 11).
 */

const KNOWN = '7038010000737';
const UNKNOWN = '4006381333931';
const SLOW = '0036000291452';

async function typeCode(page: Page, code: string) {
  await page.getByLabel('Strekkode', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Slå opp' }).click();
}

/** Every request the page makes, to check that nothing but our own API is asked (and no picture is sent). */
function recordRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

test.describe('scanning', () => {
  test.use({ isolatedAccount: true });

  test('FR-SCAN-002/-005: type a known code → filled-in form → confirm → the item is in the pantry', async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await page.goto('/skann');
    await typeCode(page, KNOWN);

    await expect(page.getByText(/Funnet i Open Food Facts/)).toBeVisible();
    await expect(page.getByLabel(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk 1 %');
    await expect(page.getByLabel('Kategori')).toHaveValue('dairy');
    await expect(page.getByLabel('Mengde')).toHaveValue('1');
    await expect(page.getByLabel('Enhet', { exact: true })).toHaveValue('l');
    // The date is never filled in (spec 07).
    await expect(page.getByLabel('Dato på pakken')).toHaveValue('');

    await page.getByLabel('Dato på pakken').selectOption('best_before');
    await page.getByLabel('Dato', { exact: true }).fill('2027-01-15');
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    await expect(page.getByText('Testmeieriet Lettmelk 1 % er lagt i matlageret.')).toBeVisible();
    // Ready for the next one.
    await expect(page.getByLabel('Strekkode', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Se varen' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Testmeieriet Lettmelk 1 %' }),
    ).toBeVisible();
    await expect(page.getByText('1 l').first()).toBeVisible();

    await page.goto('/matlager');
    await expect(page.getByRole('link', { name: /Testmeieriet Lettmelk 1 %/ })).toBeVisible();

    // FR-SCAN-001: only our own server was asked – no Open Food Facts from the browser, no CDN.
    const hosts = new Set(urls.map((u) => new URL(u).origin));
    expect([...hosts]).toEqual([BASE_URL]);
  });

  test('FR-SCAN-004: an unknown code gives an empty form and is remembered next time', async ({
    page,
  }) => {
    await page.goto(`/skann?kode=${UNKNOWN}`);
    await expect(page.getByText(/Vi fant ikke denne strekkoden/)).toBeVisible();
    await expect(page.getByLabel(/Navn på varen/)).toHaveValue('');

    await page.getByLabel(/Navn på varen/).fill('Hjemmelaget syltetøy');
    await page.getByLabel('Kategori').selectOption('spreads');
    await page.getByLabel(/Måles i/).selectOption('g');
    await page.getByLabel('Mengde').fill('450');
    await page.getByLabel('Lagringssted').selectOption({ label: 'Skap' });
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    await expect(page.getByText('Hjemmelaget syltetøy er lagt i matlageret.')).toBeVisible();

    await typeCode(page, UNKNOWN);
    await expect(page.getByText(/Dere har skannet denne før/)).toBeVisible();
    await expect(page.getByLabel('Nytt parti på «Hjemmelaget syltetøy»')).toBeChecked();
    await expect(page.getByLabel('Mengde')).toHaveValue('450');
    await expect(page.getByLabel('Lagringssted').locator('option:checked')).toHaveText('Skap');
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    await page.getByRole('link', { name: 'Se varen' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Hjemmelaget syltetøy' }),
    ).toBeVisible();
    // FR-INV-002: the second pack is a new batch on the same item.
    await expect(page.getByRole('heading', { level: 3, name: 'Parti 2' })).toBeVisible();
  });

  test('NFR-REL-001: when the product lookup does not answer, the form still works', async ({
    page,
  }) => {
    await page.goto(`/skann?kode=${SLOW}`);
    await expect(
      page.getByText('Produktoppslaget svarer ikke akkurat nå. Fyll inn selv.'),
    ).toBeVisible();
    await page.getByLabel(/Navn på varen/).fill('Havregryn');
    await page.getByLabel('Kategori').selectOption('dryGoods');
    await page.getByLabel(/Måles i/).selectOption('g');
    await page.getByLabel('Mengde').fill('1');
    await page.getByLabel('Enhet', { exact: true }).selectOption('kg');
    await page.getByRole('button', { name: 'Legg i matlageret' }).click();
    await expect(page.getByText('Havregryn er lagt i matlageret.')).toBeVisible();
  });

  test('NFR-DATA-002: a double click on "Legg i matlageret" gives one batch', async ({
    page,
    account,
    playwright,
  }) => {
    await page.goto(`/skann?kode=${KNOWN}`);
    await expect(page.getByLabel(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk 1 %');
    await page.getByRole('button', { name: 'Legg i matlageret' }).dblclick();
    await expect(page.getByText(/er lagt i matlageret/)).toBeVisible();

    const api = await apiAs(playwright, account);
    const items = await api.inventory();
    await api.dispose();
    expect(items).toHaveLength(1);
    expect(items[0]?.batches).toHaveLength(1);
  });

  test('FR-SCAN-003: a code with a wrong check digit is refused before anything is sent', async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await page.goto('/skann');
    await typeCode(page, '7038010000738');
    await expect(
      page.getByText('Strekkoden stemmer ikke. Sjekk at alle sifrene er riktige.'),
    ).toBeVisible();
    expect(urls.filter((u) => u.includes('/barcodes/'))).toEqual([]);
  });
});

test.describe('FR-SCAN-001 camera states', () => {
  test('no camera access: says so, and the code can still be typed', async ({ page, context }) => {
    // Headless Chromium has no camera; without permission getUserMedia is refused.
    await context.clearPermissions();
    await page.goto('/skann');
    await page.getByRole('button', { name: 'Start kamera' }).click();
    await expect(
      page.getByText(/Ingen tilgang til kameraet|Fant ikke noe kamera|Kameraet startet ikke/),
    ).toBeVisible();
    await expect(page.getByText(/Du kan skrive inn strekkoden i stedet/)).toBeVisible();
    await typeCode(page, KNOWN);
    await expect(page.getByLabel(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk 1 %');
  });

  test('a browser without camera support', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    });
    await page.goto('/skann');
    await expect(page.getByText('Nettleseren støtter ikke kamera')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start kamera' })).toHaveCount(0);
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`scan page (${colorScheme})`, () => {
    test.use({ colorScheme });

    test(`(${colorScheme}) NFR-UX-001/002: no horizontal scroll and no axe violations, empty and with the form`, async ({
      page,
    }) => {
      await page.goto('/skann');
      await expect(page.getByRole('button', { name: 'Start kamera' })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);

      await page.goto(`/skann?kode=${KNOWN}`);
      await expect(page.getByLabel(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk 1 %');
      await expectNoHorizontalScroll(page);
      await useTallPhoneViewport(page);
      await expectNoAxeViolations(page);
    });
  });
}
