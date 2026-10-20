import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core on a rendered component and fails with a readable list of violations.
 * Colour contrast is checked in Playwright instead: jsdom does not compute styles, so axe cannot measure it here.
 */
export async function expectNoAxeViolations(container: Element) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  );
  expect(summary).toEqual([]);
}
