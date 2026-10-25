import { expectNoAxeViolations, expectNoHorizontalScroll, useTallPhoneViewport } from './checks';
import { expect, test } from './fixtures';

/*
 * Phase 1 end-to-end tests. Since phase 2 the pages need a logged-in user; the fixtures register one.
 * Run in two projects (see playwright.config.ts):
 *   mobil-360  – 360 × 800, touch
 *   desktop    – 1280 × 800
 */

const PAGES = [
  { path: '/', h1: 'Oversikt' },
  { path: '/matlager', h1: 'Matlager' },
  { path: '/skann', h1: 'Skann' },
  { path: '/oppskrifter', h1: 'Oppskrifter' },
  { path: '/handleliste', h1: 'Handleliste' },
  { path: '/budsjett', h1: 'Kjøp og budsjett' },
  { path: '/maltidsplan', h1: 'Måltidsplan' },
  { path: '/husholdning', h1: 'Husholdning' },
  { path: '/innstillinger', h1: 'Innstillinger' },
  { path: '/mer', h1: 'Mer' },
  { path: '/designsystem', h1: 'Designsystem' },
  { path: '/finnes-ikke', h1: 'Fant ikke siden' },
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const { path, h1 } of PAGES) {
      test(`${path}: renders, no horizontal scroll, no axe violations (NFR-UX-001, NFR-UX-002)`, async ({
        page,
      }) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible();
        // Wait for the web font, so axe measures contrast on the final rendering, and for the page's data: the
        // tall phone viewport below is measured from the page height, which grows when the data arrives (the meal
        // plan failed under load in phase 10 when it was measured too early).
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalScroll(page);
        await useTallPhoneViewport(page);
        await expectNoAxeViolations(page);
      });
    }
  });
}

test.describe('FR-UI-001 navigation per viewport', () => {
  test('phone shows the bottom menu, desktop the side menu', async ({ page, isMobile }) => {
    await page.goto('/');
    const bottom = page.getByRole('navigation', { name: 'Snarveier' });
    const side = page.getByRole('navigation', { name: 'Hovedmeny' });
    if (isMobile) {
      await expect(bottom).toBeVisible();
      await expect(side).toBeHidden();
    } else {
      await expect(side).toBeVisible();
      await expect(bottom).toBeHidden();
    }
  });

  test('phone: bottom menu labels are not cut off at 360 px', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only');
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const truncated = await page
      .getByRole('navigation', { name: 'Snarveier' })
      .locator('a span:last-child')
      .evaluateAll((labels) =>
        labels.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent),
      );
    expect(truncated).toEqual([]);
  });

  test('phone: all sections are reachable through "Mer"', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone only');
    await page.goto('/');
    await page
      .getByRole('navigation', { name: 'Snarveier' })
      .getByRole('link', { name: 'Mer' })
      .click();
    await page.getByRole('link', { name: /Handleliste/ }).click();
    await expect(page).toHaveURL(/\/handleliste$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Handleliste' })).toBeFocused();
  });

  test('desktop: side menu works with the keyboard alone', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only');
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Hopp til hovedinnhold' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Hopp til hovedinnhold' })).toBeVisible();

    // Tab to "Matlager" in the side menu and open it with Enter.
    const target = page
      .getByRole('navigation', { name: 'Hovedmeny' })
      .getByRole('link', { name: 'Matlager' });
    for (
      let i = 0;
      i < 10 && !(await target.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/matlager$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Matlager' })).toBeFocused();
  });

  test('focus is clearly visible on keyboard focus (outline present)', async ({ page }) => {
    await page.goto('/designsystem');
    await page.getByRole('button', { name: 'Lagre', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page
      .getByRole('button', { name: 'Lagre', exact: true })
      .evaluate(
        (el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth,
      );
    expect(outline).toBe('solid 3px');
  });
});

test.describe('FR-UI-003 overview grid', () => {
  test('one column at 360 px, three at 1280 px (≥ 1200 px breakpoint)', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');
    const columns = await page
      .locator('#card-expiring')
      .evaluate(
        (card) =>
          getComputedStyle(card.parentElement as HTMLElement).gridTemplateColumns.split(' ').length,
      );
    expect(columns).toBe(isMobile ? 1 : 3);
  });
});

test.describe('FR-UI-004 / FR-UI-005 settings survive a reload', () => {
  // The language is saved on the account, so these tests get a user of their own.
  test.use({ isolatedAccount: true });

  test('dark theme is applied before the app starts (no white flash)', async ({ page }) => {
    await page.goto('/innstillinger');
    await page.getByLabel('Tema').selectOption('dark');
    await page.reload({ waitUntil: 'commit' });
    // Read the attribute as early as possible, before React has run.
    await page.waitForSelector('html[data-theme="dark"]', { state: 'attached' });
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe('rgb(20, 26, 23)'); // --color-bg in the dark theme (#141a17)
  });

  test('English is remembered and sets <html lang>', async ({ page }) => {
    await page.goto('/innstillinger');
    await page.getByLabel('Språk').selectOption('en');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('FR-UI-006 form on a real browser', () => {
  test('invalid submit focuses the error summary; the link moves focus to the field', async ({
    page,
  }) => {
    await page.goto('/designsystem');
    await page.getByLabel('Pris (valgfritt)').fill('49,999');
    await page.getByRole('button', { name: 'Kontroller skjemaet' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'feil i skjemaet' });
    await expect(summary).toBeFocused();
    await summary.getByRole('link', { name: /høyst to desimaler/ }).click();
    await expect(page.getByLabel('Pris (valgfritt)')).toBeFocused();
    await expectNoAxeViolations(page);
  });
});
