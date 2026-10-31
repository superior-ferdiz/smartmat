import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * Spec 16, FR-REC-009 (ADR-0023): every recipe query in the API goes through one file, recipes/repo.ts, where the
 * household filter is. A new `db.recipe…` or raw SQL against the recipe tables anywhere else fails here, so it
 * has to be moved into the repo (or added below with a reason).
 */

const API_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** File → why it may touch the tables directly. */
const ALLOWED: Record<string, string> = {
  'src/modules/recipes/repo.ts': 'the one place (household filter: visibleTo)',
  'src/modules/recipes/seed.ts':
    'writes global recipes only, limited to GLOBAL_RECIPES from the repo',
  'scripts/perf-explain.ts': 'counts rows in the separate smartmat_perf database for the report',
};

const QUERY = [
  /\b(db|tx|prisma|client)\.(recipe|recipeIngredient)\b/,
  /\b(FROM|JOIN|INTO|UPDATE|TABLE)\s+"?(recipes|recipe_ingredients)\b/i,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'generated' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe('FR-REC-009 all recipe queries go through recipes/repo.ts', () => {
  it('no other file in src/ or scripts/ queries the recipe tables', () => {
    const offenders = ['src', 'scripts']
      .flatMap((dir) => sourceFiles(join(API_ROOT, dir)))
      .map((path) => relative(API_ROOT, path).replaceAll('\\', '/'))
      .filter((path) => !(path in ALLOWED))
      .filter((path) => {
        const text = readFileSync(join(API_ROOT, path), 'utf8');
        return QUERY.some((pattern) => pattern.test(text));
      });
    expect(offenders).toEqual([]);
  });

  it('the check finds a query when there is one (the allowed files do have them)', () => {
    for (const path of Object.keys(ALLOWED)) {
      const text = readFileSync(join(API_ROOT, path), 'utf8');
      expect(
        QUERY.some((pattern) => pattern.test(text)),
        path,
      ).toBe(true);
    }
  });
});
