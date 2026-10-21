import { fileURLToPath } from 'node:url';
import type { Db } from '../src/db';
import { applySeed, readSeedDirectory } from '../src/modules/recipes/seed';

/** The fictional test recipes (source=test). Only ever written to the *_test and *_e2e databases. */
export const FIXTURE_SEED_DIR = fileURLToPath(new URL('./fixtures/seed', import.meta.url));

export async function seedFixtureRecipes(db: Db) {
  await applySeed(db, readSeedDirectory(FIXTURE_SEED_DIR));
}
