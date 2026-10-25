// @vitest-environment node
/// <reference types="node" />
// Runs in Node (Vitest) and reads source files, so it needs Node types; the app code does not.
import { describe, expect, it } from 'vitest';
import nb from './locales/nb-NO.json';
import en from './locales/en.json';
import {
  ALLERGENS,
  API_ERRORS,
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@smartmat/shared';
import { NETWORK_ERROR } from '../api/client';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string'
      ? { ...acc, [path]: value }
      : { ...acc, ...flatten(value, path) };
  }, {});
}

const nbKeys = flatten(nb);
const enKeys = flatten(en);

function filesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesIn(full) : [full];
  });
}

describe('NFR-UX-004 / FR-UI-005 translations', () => {
  it('Norwegian and English have exactly the same keys', () => {
    expect(Object.keys(enKeys).sort()).toEqual(Object.keys(nbKeys).sort());
  });

  it('no translation is empty', () => {
    const empty = [...Object.entries(nbKeys), ...Object.entries(enKeys)].filter(
      ([, v]) => v.trim() === '',
    );
    expect(empty).toEqual([]);
  });

  it('every validation key produced by @smartmat/shared has a translation', () => {
    // Collect 'validation.xxx' keys from the shared package source, so a new schema message cannot be forgotten.
    const sharedSrc = join(here, '../../../../packages/shared/src');
    const source = filesIn(sharedSrc)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    const literal = [...source.matchAll(/'(validation\.[a-zA-Z_.]+)'/g)].map((m) => m[1] ?? '');
    // parseOre error codes are added dynamically as `validation.ore.${error}`.
    const oreCodes = [...source.matchAll(/\| '([a-z_]+)'/g)].map(
      (m) => `validation.ore.${m[1] ?? ''}`,
    );
    const missing = [...new Set([...literal, ...oreCodes])].filter(
      (key) => !(key in nbKeys) || !(key in enKeys),
    );
    expect(literal.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('every error code the API can return (and the network error) has a translation', () => {
    const missing = [...Object.values(API_ERRORS), NETWORK_ERROR].filter(
      (key) => !(key in nbKeys) || !(key in enKeys),
    );
    expect(missing).toEqual([]);
  });

  it('the password message matches the minimum length in the shared schema', () => {
    expect(nbKeys['validation.password.tooShort']).toContain(String(PASSWORD_MIN_LENGTH));
    expect(enKeys['validation.password.tooShort']).toContain(String(PASSWORD_MIN_LENGTH));
  });

  it('the display-name message matches the limit in the shared schema', () => {
    expect(nbKeys['validation.displayName.tooLong']).toContain(String(DISPLAY_NAME_MAX_LENGTH));
    expect(enKeys['validation.displayName.tooLong']).toContain(String(DISPLAY_NAME_MAX_LENGTH));
  });
});

describe('FR-REC-004 allergen wording', () => {
  // The data only says which allergens are registered; the app must never claim that something is free of one.
  const forbidden = [
    /allergenfri/i,
    /\bfri for\b/i,
    /\b\w+fri\b.*allergen/i,
    /allergen-free/i,
    /free from/i,
    /\b(gluten|lactose|nut|milk)-free\b/i,
    /\b(glutenfri|laktosefri|nøttefri|melkefri)\b/i,
  ];

  it('no text in either language says that a recipe is free of an allergen', () => {
    const offenders = [...Object.entries(nbKeys), ...Object.entries(enKeys)].filter(([, text]) =>
      forbidden.some((pattern) => pattern.test(text)),
    );
    expect(offenders).toEqual([]);
  });

  it('the disclaimer exists in both languages and says to check the products', () => {
    expect(nbKeys['recipes.allergens.disclaimer']).toMatch(/veiledende.*Sjekk alltid/s);
    expect(enKeys['recipes.allergens.disclaimer']).toMatch(/guide.*Always check/s);
  });

  it('every allergen has a name in both languages', () => {
    for (const allergen of ALLERGENS) {
      expect(nbKeys[`recipes.allergenNames.${allergen}`], allergen).toBeTruthy();
      expect(enKeys[`recipes.allergenNames.${allergen}`], allergen).toBeTruthy();
    }
  });
});

describe('FR-NOTIF-001 use-by wording in notifications', () => {
  // A use-by date is about food safety: no notification about it may suggest the food can still be eaten.
  const useByKeys = Object.keys(nbKeys).filter((key) =>
    /^notifications\.(kinds|advice)\.useBy/.test(key),
  );
  const forbidden = [
    /kan spises/i,
    /fortsatt god/i,
    /se, lukt og smak/i,
    /tryg(g|t) å spise/i,
    /frys/i,
  ];
  const forbiddenEn = [
    /can (still )?be eaten/i,
    /still good/i,
    /look, smell/i,
    /safe to eat/i,
    /freez/i,
  ];

  it('exists, and never says the food can still be eaten', () => {
    expect(useByKeys.length).toBeGreaterThanOrEqual(6);
    for (const key of useByKeys) {
      expect(
        forbidden.filter((p) => p.test(nbKeys[key] ?? '')),
        key,
      ).toEqual([]);
      expect(
        forbiddenEn.filter((p) => p.test(enKeys[key] ?? '')),
        key,
      ).toEqual([]);
    }
  });

  it('best before and use by are worded differently', () => {
    expect(nbKeys['notifications.kinds.useByToday']).not.toBe(
      nbKeys['notifications.kinds.bestBeforeToday'],
    );
    expect(nbKeys['notifications.kinds.useByToday']).toContain('siste forbruksdag');
    expect(nbKeys['notifications.kinds.bestBeforeToday']).toContain('best før');
  });
});
