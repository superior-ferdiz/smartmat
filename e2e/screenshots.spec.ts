import { test } from '@playwright/test';

/*
 * Not a test: saves real screenshots of the app as evidence for the report.
 * Only runs when asked for:  SCREENSHOTS=1 npm run test:e2e -- screenshots
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to save screenshots');

const OUT = 'docs/evidence/screenshots/fase-1';
const PAGES = [
  ['oversikt', '/'],
  ['mer', '/mer'],
  ['matlager', '/matlager'],
  ['innstillinger', '/innstillinger'],
  ['designsystem', '/designsystem'],
] as const;

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });
    for (const [name, path] of PAGES) {
      test(`${name}`, async ({ page }, testInfo) => {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `${OUT}/${name}-${testInfo.project.name}-${colorScheme === 'light' ? 'lys' : 'mork'}.png`,
          // Phones: just the screen (a full-page capture draws the sticky bottom menu mid-page).
          fullPage: !testInfo.project.name.startsWith('mobil'),
        });
      });
    }
  });
}
