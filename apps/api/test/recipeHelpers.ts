import type { FastifyInstance } from 'fastify';
import type {
  CreateHouseholdRecipeInput,
  HouseholdRecipeSaved,
  IngredientResponse,
} from '@smartmat/shared';
import { call, type Client } from './helpers';

/* Helpers for a household's own recipes (spec 16). The recipes are fictional, written for the tests. */

export const recipesPath = (client: Client, rest = '') =>
  `/households/${client.user.householdId}/recipes${rest}`;

export async function ingredientIdsByKey(app: FastifyInstance, client: Client) {
  const response = await call(app, 'GET', '/ingredients', { client });
  return new Map(response.json<IngredientResponse[]>().map((i) => [i.key, i.id]));
}

/** A valid body: "Testrett: egen omelett" with egg, milk, salt and one free-text line. */
export function ownRecipeBody(
  ids: Map<string, string>,
  overrides: Partial<CreateHouseholdRecipeInput> = {},
): CreateHouseholdRecipeInput {
  const id = (key: string) => {
    const found = ids.get(key);
    if (!found) throw new Error(`no ingredient ${key}`);
    return found;
  };
  return {
    title: 'Testrett: egen omelett',
    description: 'Fiktiv egen oppskrift for automatiske tester.',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    tags: ['frokost'],
    lines: [
      { kind: 'ingredient', ingredientId: id('egg'), amount: '3', unit: 'stk' },
      {
        kind: 'ingredient',
        ingredientId: id('melk'),
        amount: '1',
        unit: 'dl',
        text: '1 dl lettmelk',
      },
      { kind: 'ingredient', ingredientId: id('salt') },
      { kind: 'freeText', text: 'Litt gressløk fra hagen' },
    ],
    steps: ['Visp egg og melk.', 'Stek i panne.'],
    ...overrides,
  };
}

export async function createOwnRecipe(
  app: FastifyInstance,
  client: Client,
  body: CreateHouseholdRecipeInput,
): Promise<HouseholdRecipeSaved> {
  const response = await call(app, 'POST', recipesPath(client), { client, body });
  if (response.statusCode !== 201)
    throw new Error(`create failed: ${response.statusCode} ${response.body}`);
  return response.json<HouseholdRecipeSaved>();
}
