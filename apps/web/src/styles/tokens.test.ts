// @vitest-environment node
/// <reference types="node" />
// Runs in Node (Vitest) and reads source files, so it needs Node types; the app code does not.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/*
 * NFR-UX-002: checks the WCAG contrast ratio of the colour pairs we actually use, in both themes,
 * straight from tokens.css. If someone changes a colour so that text becomes hard to read, this test fails.
 */
const css = readFileSync(join(here, 'tokens.css'), 'utf8');

function block(selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  if (start === -1) throw new Error(`Block not found: ${selectorStart}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('Unbalanced braces');
}

function colours(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of source.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    result[match[1] ?? ''] = (match[2] ?? '').toLowerCase();
  }
  return result;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = colours(block(':root {'));
const darkMedia = { ...light, ...colours(block(":root:not([data-theme='light'])")) };
const darkManual = { ...light, ...colours(block(":root[data-theme='dark']")) };

// [foreground, background, minimum ratio]. 4.5 = normal text, 3 = UI components and focus indicators.
const PAIRS: [string, string, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surface-sunken', 4.5],
  ['text-muted', 'bg', 4.5],
  ['text-muted', 'surface', 4.5],
  ['text-muted', 'surface-sunken', 4.5],
  ['primary', 'bg', 4.5],
  ['primary', 'surface', 4.5],
  ['primary', 'primary-soft', 4.5],
  ['on-primary', 'primary', 4.5],
  ['on-primary', 'primary-hover', 4.5],
  ['on-accent', 'accent', 4.5],
  ['accent-text', 'surface', 4.5],
  ['warning-text', 'warning-soft', 4.5],
  ['danger-text', 'danger-soft', 4.5],
  ['danger-text', 'surface', 4.5],
  ['on-danger', 'danger', 4.5],
  ['success-text', 'success-soft', 4.5],
  ['info-text', 'info-soft', 4.5],
  ['text', 'info-soft', 4.5],
  ['text', 'danger-soft', 4.5],
  ['text', 'warning-soft', 4.5],
  ['text', 'surface-raised', 4.5],
  ['control-border', 'surface', 3],
  ['control-border', 'bg', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
];

describe('NFR-UX-002 colour contrast in tokens.css', () => {
  it('the two dark-theme blocks are identical', () => {
    expect(colours(block(":root[data-theme='dark']"))).toEqual(
      colours(block(":root:not([data-theme='light'])")),
    );
  });

  for (const [theme, palette] of [
    ['light', light],
    ['dark', darkMedia],
    ['dark (manual)', darkManual],
  ] as const) {
    it.each(PAIRS)(`${theme}: %s on %s ≥ %d:1`, (fg, bg, min) => {
      const a = palette[fg];
      const b = palette[bg];
      expect(a, `--color-${fg} missing`).toBeDefined();
      expect(b, `--color-${bg} missing`).toBeDefined();
      expect(contrast(a as string, b as string)).toBeGreaterThanOrEqual(min);
    });
  }
});
