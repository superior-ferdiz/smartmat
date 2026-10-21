import type { FastifyInstance } from 'fastify';
import type {
  CreateShoppingItemResponse,
  IngredientResponse,
  RecipeListResponse,
  ShoppingListResponse,
} from '@smartmat/shared';
import { call, type Client } from './helpers';

export function shoppingPath(client: Client, path = '') {
  return `/households/${client.user.householdId}/shopping-list${path}`;
}

export async function shoppingList(app: FastifyInstance, client: Client) {
  const response = await call(app, 'GET', shoppingPath(client), { client });
  if (response.statusCode !== 200) throw new Error(`list failed: ${response.statusCode}`);
  return response.json<ShoppingListResponse>().items;
}

export async function addLine(app: FastifyInstance, client: Client, body: Record<string, unknown>) {
  const response = await call(app, 'POST', shoppingPath(client, '/items'), { client, body });
  if (response.statusCode !== 201)
    throw new Error(`add failed: ${response.statusCode} ${response.body}`);
  return response.json<CreateShoppingItemResponse>();
}

export async function recipeIdOf(app: FastifyInstance, client: Client, slug: string) {
  const response = await call(app, 'GET', `/households/${client.user.householdId}/recipes`, {
    client,
  });
  const recipe = response.json<RecipeListResponse>().recipes.find((r) => r.slug === slug);
  if (!recipe) throw new Error(`no recipe ${slug}`);
  return recipe.id;
}

export async function ingredientIds(app: FastifyInstance, client: Client) {
  const response = await call(app, 'GET', '/ingredients', { client });
  return new Map(response.json<IngredientResponse[]>().map((i) => [i.key, i.id]));
}
