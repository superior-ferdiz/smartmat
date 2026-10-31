import type { Page } from '@playwright/test';
import { apiAs, expect, LOGGED_OUT, test } from './fixtures';
import { expectNoHorizontalScroll } from './checks';

/*
 * Spec 13 (NFR-UX-005): the parts of WCAG 2.2 AA that a browser can check on every page, beyond axe:
 *   - 2.1.1 / 2.4.7 / 2.4.11: every stop on the Tab path has a visible focus indicator and is not hidden behind the
 *     sticky top bar or bottom menu
 *   - 1.4.4 / 1.4.10: 200 % zoom (1280 px window → 640 CSS px) and 320 CSS px wide without horizontal scrolling
 *   - 1.4.12: text spacing increased as the criterion describes, still no horizontal scrolling
 *   - 2.3.3: with "reduce motion" no animation or transition runs longer than 0.01 ms
 * What only a person can judge (screen reader wording, order that makes sense, VoiceOver/TalkBack gestures) is in
 * docs/development/testing/tilgjengelighet.md.
 */

const MAX_TAB_STOPS = 150;

interface FocusInfo {
  description: string;
  indicator: boolean;
  visible: boolean;
}

/** Where focus is now, whether it is marked, and whether any part of it can be seen (not covered by our menus). */
function focusInfo(page: Page) {
  return page.evaluate((): FocusInfo | null => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) return null;
    const label =
      el.getAttribute('aria-label') ??
      (el as HTMLInputElement).labels?.[0]?.textContent ??
      el.textContent ??
      '';
    const description = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} "${label.trim().replace(/\s+/g, ' ').slice(0, 50)}"`;

    // The indicator is either on the element, or – for a visually hidden native control (checkbox, radio) – on the
    // label or box drawn next to it.
    const marked = (node: Element | null) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      return outline || (style.boxShadow !== 'none' && style.boxShadow !== '');
    };
    const rect = el.getBoundingClientRect();
    const tiny = rect.width <= 2 || rect.height <= 2;
    const control = el as HTMLInputElement;
    const label0 = control.labels?.[0] ?? null;
    // A card whose link draws the ring around the whole card (`.card:focus-within`) counts too.
    let ancestor: Element | null = el.parentElement;
    let ringOnAncestor = false;
    for (let i = 0; ancestor && i < 4; i++, ancestor = ancestor.parentElement) {
      // Outline only: a card may have a shadow anyway, which says nothing about focus.
      const style = getComputedStyle(ancestor);
      if (
        ancestor.matches(':focus-within') &&
        style.outlineStyle !== 'none' &&
        parseFloat(style.outlineWidth) > 0
      ) {
        ringOnAncestor = true;
      }
    }
    const indicator =
      marked(el) ||
      ringOnAncestor ||
      (tiny && (marked(label0) || marked(el.nextElementSibling) || marked(el.parentElement)));

    // Any of five points inside the element (or its label, for a hidden control) is the top element there.
    const target = tiny && label0 ? label0 : el;
    const r = target.getBoundingClientRect();
    const points = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ];
    const visible = points.some(([x, y]) => {
      if (x! < 0 || y! < 0 || x! >= innerWidth || y! >= innerHeight) return false;
      const hit = document.elementFromPoint(x!, y!);
      return (
        !!hit &&
        (hit === target || target.contains(hit) || hit.contains(target) || el.contains(hit))
      );
    });
    return { description, indicator, visible };
  });
}

async function tabThrough(page: Page) {
  const problems: string[] = [];
  const seen = new Set<string>();
  let stops = 0;
  for (; stops < MAX_TAB_STOPS; stops++) {
    await page.keyboard.press('Tab');
    const info = await focusInfo(page);
    if (!info) continue;
    if (seen.has(info.description) && stops > 3) {
      // Back at the start: the whole page has been walked.
      if ([...seen][0] === info.description) break;
    }
    seen.add(info.description);
    if (!info.indicator) problems.push(`no visible focus indicator: ${info.description}`);
    if (!info.visible)
      problems.push(`focus hidden (behind a menu or off screen): ${info.description}`);
  }
  return { problems, stops: seen.size };
}

/** Pages inside the app. Detail pages get their ids from data made in beforeAll. */
const APP_PAGES = [
  '/',
  '/matlager',
  '/matlager/ny',
  '/matlager/steder',
  '/skann',
  '/oppskrifter',
  '/oppskrifter/kilder',
  '/handleliste',
  '/budsjett',
  '/budsjett/kjop/ny',
  '/budsjett/kvittering',
  '/maltidsplan',
  '/svinn',
  '/varsler',
  '/husholdning',
  '/innstillinger',
  '/mer',
  '/profil',
  '/personvern',
];

test.describe('NFR-UX-005 WCAG 2.2 AA checks on every page', () => {
  let detailPages: string[] = [];

  test.beforeEach(async ({ playwright, account }) => {
    const api = await apiAs(playwright, account);
    const [fridge] = (await api.locations()).filter((l) => l.kind === 'fridge');
    const item = await api.createItem({
      name: 'Tilgjengelighetsmelk',
      categoryKey: 'dairy',
      unit: 'ml',
      batch: {
        quantityBase: 1000,
        locationId: fridge!.id,
        expiry: { kind: 'use_by', date: '2026-12-01' },
        priceOre: 2490,
      },
    });
    const purchase = await api.createPurchase({
      storeName: 'Testbutikk',
      purchasedOn: '2026-10-20',
      totalOre: 4990,
    });
    await api.addShoppingItem({ text: 'Brød' });
    const [recipe] = await api.recipes();
    await api.dispose();
    detailPages = [
      `/matlager/${item.id}`,
      `/budsjett/kjop/${purchase.id}`,
      `/oppskrifter/${recipe!.id}`,
    ];
  });

  test('2.1.1 / 2.4.7 / 2.4.11: every Tab stop has a visible focus indicator and is not hidden', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const problems: string[] = [];
    for (const path of [...APP_PAGES, ...detailPages]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const result = await tabThrough(page);
      expect(result.stops, `${path}: hardly anything to tab to`).toBeGreaterThan(3);
      problems.push(...result.problems.map((p) => `${path}: ${p}`));
    }
    expect(problems).toEqual([]);
  });

  test('1.4.4 / 1.4.10: 200 % zoom (640 CSS px) and 320 CSS px wide without horizontal scrolling', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const width of [640, 320]) {
      await page.setViewportSize({ width, height: 400 });
      for (const path of [...APP_PAGES, ...detailPages]) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await test.step(`${width} px ${path}`, () => expectNoHorizontalScroll(page));
      }
    }
  });

  test('1.4.12: larger line, letter, word and paragraph spacing does not make pages scroll sideways', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const path of [...APP_PAGES, ...detailPages]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.addStyleTag({
        content: `* { line-height: 1.5 !important; letter-spacing: 0.12em !important;
                     word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`,
      });
      await test.step(path, () => expectNoHorizontalScroll(page));
    }
  });

  test('2.3.3: with "reduce motion", nothing animates for longer than 0.01 ms', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of [...APP_PAGES, ...detailPages]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const moving = await page.evaluate(() => {
        const seconds = (value: string) =>
          Math.max(
            ...value.split(',').map((v) => parseFloat(v) * (v.trim().endsWith('ms') ? 0.001 : 1)),
          );
        return [...document.querySelectorAll('*')]
          .map((el) => {
            const style = getComputedStyle(el);
            const longest = Math.max(
              seconds(style.animationDuration),
              seconds(style.transitionDuration),
            );
            return longest > 0.00001
              ? `${el.tagName.toLowerCase()}.${el.className}: ${longest}s`
              : null;
          })
          .filter(Boolean);
      });
      expect(moving, path).toEqual([]);
    }
  });
});

test.describe('NFR-UX-005 logged-out pages', () => {
  test.use({ storageState: LOGGED_OUT });

  test('login, registration and the privacy notice: keyboard, zoom and spacing', async ({
    page,
  }) => {
    const problems: string[] = [];
    for (const path of ['/logg-inn', '/registrer', '/personvern']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const result = await tabThrough(page);
      problems.push(...result.problems.map((p) => `${path}: ${p}`));
    }
    expect(problems).toEqual([]);
    await page.setViewportSize({ width: 320, height: 400 });
    for (const path of ['/logg-inn', '/registrer', '/personvern']) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
  });
});
