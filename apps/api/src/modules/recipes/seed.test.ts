import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('every recipe in prisma/seed/ is from the team or an open source, never test data, and has authors', () => {
    for (const recipe of readSeedDirectory(repoSeed).recipes) {
      expect(['team', 'external'], recipe.slug).toContain(recipe.source);
      expect(recipe.authors.length, recipe.slug).toBeGreaterThan(0);
    }
  });

  it('spec 09: every external recipe links to the exact revision it was translated from', () => {
    const sources = JSON.parse(readFileSync(join(repoSeed, 'sources/wikibooks.json'), 'utf8')) as {
      slug: string;
    }[];
    for (const recipe of readSeedDirectory(repoSeed).recipes) {
      if (recipe.source !== 'external') continue;
      expect(
        sources.map((s) => s.slug),
        recipe.slug,
      ).toContain(recipe.slug);
      const original = JSON.parse(
        readFileSync(join(repoSeed, 'sources/wikibooks', `${recipe.slug}.json`), 'utf8'),
      ) as { revisionUrl: string; retrievedOn: string; license: string };
      expect(recipe.sourceUrl, recipe.slug).toBe(original.revisionUrl);
      expect(recipe.retrievedOn, recipe.slug).toBe(original.retrievedOn);
      expect(recipe.license, recipe.slug).toBe(original.license);
      // Until someone in the team has checked it, it is shown as an AI draft (spec 09, decision 6).
      expect(recipe.aiAssisted, recipe.slug).toBe(true);
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
      ['salt', 3], // 1/2 ts = 2,5 ml × 6/5 = 3 g (rounded once, at the end, since phase 9)
    ]);
  });
});
