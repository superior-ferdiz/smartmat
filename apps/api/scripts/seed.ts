import { fileURLToPath } from 'node:url';
import { loadRootEnvFile } from '../src/config';
import { createDb } from '../src/db';
import { applySeed, readSeedDirectory, SeedError } from '../src/modules/recipes/seed';

/*
 * `npm run db:seed`: checks prisma/seed/ (ingredients.json + recipes/*.json) and writes it to the database
 * in DATABASE_URL (spec 05). `npm run db:seed -- --check` only checks the files.
 * Safe to run again: it upserts on key/slug and removes recipes that are no longer in the files.
 */
const dir = fileURLToPath(new URL('../../../prisma/seed', import.meta.url));
const checkOnly = process.argv.includes('--check');

let seed;
try {
  seed = readSeedDirectory(dir);
} catch (error) {
  if (!(error instanceof SeedError)) throw error;
  console.error(`Frødataene har ${error.errors.length} feil:`);
  for (const message of error.errors) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`OK: ${seed.ingredients.length} ingredienser, ${seed.recipes.length} oppskrifter.`);
if (checkOnly) process.exit(0);

loadRootEnvFile();
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
const db = createDb(url);
try {
  const summary = await applySeed(db, seed);
  console.log(
    `Lagt inn. Fjernet ${summary.removedRecipes} oppskrifter og ${summary.removedIngredients} ingredienser.`,
  );
  if (summary.keptIngredients.length > 0)
    console.log(`Beholdt fordi varer er koblet til dem: ${summary.keptIngredients.join(', ')}`);
} finally {
  await db.$disconnect();
}
