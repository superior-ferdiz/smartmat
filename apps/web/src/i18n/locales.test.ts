// @vitest-environment node
/// <reference types="node" />
// Runs in Node (Vitest) and reads source files, so it needs Node types; the app code does not.
import { describe, expect, it } from 'vitest';
import nb from './locales/nb-NO.json';
import en from './locales/en.json';
import { API_ERRORS, DISPLAY_NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@smartmat/shared';
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
