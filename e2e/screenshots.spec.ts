import { LOGGED_OUT, test } from './fixtures';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npm run test:e2e -- screenshots
 * Phase 2 pages. (The phase 1 screenshots in docs/evidence/screenshots/fase-1 were made by the
 * phase 1 version of this file, before login existed.)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = 'docs/evidence/screenshots/fase-2';
const LOGGED_OUT_PAGES = [
  ['logg-inn', '/logg-inn'],
  ['registrer', '/registrer'],
] as const;
const LOGGED_IN_PAGES = [
  ['profil', '/profil'],
  ['innstillinger', '/innstillinger'],
] as const;

for (const colorScheme of ['light', 'dark'] as const) {
  const suffix = colorScheme === 'light' ? 'lys' : 'mork';

  test.describe(`${colorScheme} – logged out`, () => {
    test.use({ colorScheme, storageState: LOGGED_OUT });
    for (const [name, path] of LOGGED_OUT_PAGES) {
      test(name, async ({ page }, testInfo) => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${suffix}.png`,
          fullPage: !testInfo.project.name.startsWith('mobil'),
        });
      });
    }
  });

  test.describe(`${colorScheme} – logged in`, () => {
    test.use({ colorScheme });
    for (const [name, path] of LOGGED_IN_PAGES) {
      test(name, async ({ page }, testInfo) => {
        await page.goto(path);
        await page.getByRole('heading', { level: 1 }).waitFor();
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
