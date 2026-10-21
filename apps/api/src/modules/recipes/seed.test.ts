import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readSeedDirectory } from './seed';

/*
 * Spec 05 / ADR-0009: every seed file in the repo passes the same check `npm run db:seed` runs,
 * so a broken recipe file cannot be committed with green tests.
 */
const repoSeed = fileURLToPath(new URL('../../../../../prisma/seed', import.meta.url));
const fixtureSeed = fileURLToPath(new URL('../../../test/fixtures/seed', import.meta.url));

describe('spec 05 seed files in the repo', () => {
  it('prisma/seed/ is valid', () => {
    const seed = readSeedDirectory(repoSeed);
    expect(seed.ingredients.length).toBeGreaterThan(0);
  });

  it('every team recipe in prisma/seed/ has source "team" and at least one author', () => {
    for (const recipe of readSeedDirectory(repoSeed).recipes) {
      expect(recipe.source, recipe.slug).toBe('team');
      expect(recipe.authors.length, recipe.slug).toBeGreaterThan(0);
    }
  });

  it('the test fixtures are valid, and are all marked source "test"', () => {
    const seed = readSeedDirectory(fixtureSeed);
    expect(seed.recipes.length).toBeGreaterThan(0);
    expect(new Set(seed.recipes.map((r) => r.source))).toEqual(new Set(['test']));
  });

  it('the fixtures resolve spoon measures and conversions to whole base units', () => {
    const pancakes = readSeedDirectory(fixtureSeed).recipes.find(
      (r) => r.slug === 'testrett-pannekaker',
    );
    expect(pancakes?.ingredients.map((l) => [l.ingredientKey, l.quantityBase])).toEqual([
      ['hvetemel', 150], // 2,5 dl × 60 g per dl
      ['melk', 500],
      ['egg', 3],
      ['salt', 4], // 1/2 ts = 2,5 ml → 3 ml (rounded) → 3 × 6/5 = 3,6 → 4 g
    ]);
  });
});
