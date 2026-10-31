import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.0, 2.1 and 2.2 level A and AA rules (NFR-UX-002 target: WCAG 2.2 AA).
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'page is wider than the viewport').toBeLessThanOrEqual(clientWidth);
}

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`,
  );
  expect(summary).toEqual([]);
}

/**
 * On phones the sticky bottom menu covers whatever sits behind it, and axe's target-size rule then reports that
 * control (WCAG 2.5.8), although the user can scroll it into view. Making the viewport as tall as the page (same
 * width) lets everything fit, so every control is checked without the menu in front of it. Call it after the page
 * has rendered, right before the axe check. See chapter 11, "Begrensninger". (Phase 5: a fixed 2400 px was not
 * enough for the design system page, so the height now follows the page.)
 */
export async function useTallPhoneViewport(page: Page) {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width >= 600) return;
  // Phase 12: under heavy load the profile page's last card arrived after the height was measured, and its button
  // ended up behind the menu again. Wait until the page has stopped fetching before measuring.
  await page.waitForLoadState('networkidle');
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({
    width: viewport.width,
    height: Math.max(viewport.height, height + 100),
  });
}
