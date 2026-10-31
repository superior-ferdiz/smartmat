import {
  API_ERRORS,
  buildAliasIndex,
  newItemIngredientLink,
  textIngredientId,
  type AddFromRecipeBody,
  type AddFromRecipeResponse,
  type BaseUnit,
  type CreateShoppingItemBody,
  type CreateShoppingItemResponse,
  type MatchableIngredient,
  type ShoppingItemResponse,
  type ShoppingListResponse,
  type ToInventoryBody,
  type ToInventoryResponse,
  type UpdateShoppingItemBody,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { LocationRepo } from '../locations/repo';
import { isPrismaError } from '../purchases/repo';
import type { ShoppingLinePatch, ShoppingRepo, StockWrite } from './repo';

export interface CatalogEntry extends MatchableIngredient {
  baseUnit: BaseUnit;
}

export interface ShoppingServiceDeps {
  repo: ShoppingRepo;
  locations: Pick<LocationRepo, 'exists'>;
  /** The ingredients and the recipes the household can see (global and its own, ADR-0023). Read only. */
  recipes: {
    catalog(): Promise<CatalogEntry[]>;
    recipe(
      householdId: string,
      recipeId: string,
    ): Promise<{ lines: { ingredientId: string }[] } | null>;
  };
  now: Clock;
}

const fieldError = (fields: Record<string, string>) =>
  new AppError(400, API_ERRORS.validation, fields);
const changedMeanwhile = () => new AppError(409, API_ERRORS.shoppingChangedMeanwhile);

/** Business rules for the shopping list (FR-SHOP-001–003). All methods are scoped to one household. */
export class ShoppingService {
  constructor(private readonly deps: ShoppingServiceDeps) {}

  async list(householdId: string): Promise<ShoppingListResponse> {
    return { items: await this.deps.repo.list(householdId) };
  }

  async get(householdId: string, itemId: string): Promise<ShoppingItemResponse> {
    const item = await this.deps.repo.get(householdId, itemId);
    if (!item) throw notFound();
    return item;
  }

  /**
   * FR-SHOP-001. Returns the line and whether it is new (false when the same form was sent before).
   * The text is linked to an ingredient when it matches exactly one (spec 05 rules).
   */
  async create(
    householdId: string,
    actorId: string,
    body: CreateShoppingItemBody,
  ): Promise<{ response: CreateShoppingItemResponse; created: boolean }> {
    const { repo } = this.deps;
    const dedupeKey = body.clientRequestId ? `manual:${body.clientRequestId}` : null;
    const existing = dedupeKey ? await repo.findByDedupeKey(householdId, dedupeKey) : null;
    if (existing) return this.repeated(householdId, existing);

    const index = buildAliasIndex(await this.deps.recipes.catalog());
    const result = await repo.create(
      householdId,
      actorId,
      {
        text: body.text,
        ingredientId: textIngredientId(body.text, index),
        quantityBase: body.quantity?.quantityBase ?? null,
        unit: body.quantity?.unit ?? null,
      },
      dedupeKey,
    );
    if (result.kind === 'duplicate') {
      // Lost the race against an identical request: answer with the one that was saved.
      const saved = dedupeKey ? await repo.findByDedupeKey(householdId, dedupeKey) : null;
      if (!saved) throw changedMeanwhile();
      return this.repeated(householdId, saved);
    }
    return {
      response: {
        item: await this.get(householdId, result.id),
        similarItemId: result.similarItemId,
      },
      created: true,
    };
  }

  async update(householdId: string, itemId: string, body: UpdateShoppingItemBody) {
    const patch: ShoppingLinePatch = {};
    if (body.text !== undefined) patch.text = body.text;
    if (body.quantity !== undefined) {
      patch.quantityBase = body.quantity?.quantityBase ?? null;
      patch.unit = body.quantity?.unit ?? null;
    }
    if (body.checked !== undefined) {
      patch.checked = body.checked;
      patch.checkedAt = body.checked ? this.deps.now() : null;
    }
    try {
      if (!(await this.deps.repo.update(householdId, itemId, patch))) throw notFound();
    } catch (error) {
      // Unchecking would give a second open line for the same ingredient (partial unique index).
      if (isPrismaError(error, 'P2002')) throw new AppError(409, API_ERRORS.shoppingAlreadyOnList);
      throw error;
    }
    return this.get(householdId, itemId);
  }

  async remove(householdId: string, itemId: string) {
    if (!(await this.deps.repo.remove(householdId, itemId))) throw notFound();
  }

  async clearChecked(householdId: string) {
    return { removed: await this.deps.repo.clearChecked(householdId) };
  }

  /**
   * FR-SHOP-002. The web app suggests what is missing; the user picks and may change the amounts. Here each
   * ingredient must belong to the recipe, and the amount is in the ingredient's base unit.
   */
  async addFromRecipe(
    householdId: string,
    actorId: string,
    recipeId: string,
    body: AddFromRecipeBody,
  ): Promise<AddFromRecipeResponse> {
    // Another household's own recipe is "not found", like an unknown one (FR-REC-009). Free-text lines are not in
    // `lines`, so they can never be added.
    const recipe = await this.deps.recipes.recipe(householdId, recipeId);
    if (!recipe) throw notFound();
    const inRecipe = new Set(recipe.lines.map((l) => l.ingredientId));
    const catalog = new Map((await this.deps.recipes.catalog()).map((i) => [i.id, i]));

    const fields: Record<string, string> = {};
    const lines = body.lines.flatMap((line, index) => {
      const ingredient = catalog.get(line.ingredientId);
      if (!ingredient || !inRecipe.has(line.ingredientId)) {
        fields[`lines.${index}.ingredientId`] = 'validation.shopping.notInRecipe';
        return [];
      }
      return [
        {
          ingredientId: ingredient.id,
          text: ingredient.name,
          quantityBase: line.quantityBase,
          unit: ingredient.baseUnit,
        },
      ];
    });
    if (Object.keys(fields).length > 0) throw fieldError(fields);
    return this.deps.repo.addFromRecipe(householdId, actorId, recipeId, lines);
  }

  /** FR-SHOP-003: checked lines into the inventory, all or nothing. */
  async toInventory(
    householdId: string,
    actorId: string,
    body: ToInventoryBody,
  ): Promise<ToInventoryResponse> {
    const { repo } = this.deps;
    const lines = new Map((await repo.list(householdId)).map((l) => [l.id, l]));
    // A line that is gone, unchecked or from another household: someone changed the list meanwhile.
    if (body.lines.some((l) => !lines.get(l.shoppingItemId)?.checked)) throw changedMeanwhile();

    const fields: Record<string, string> = {};
    const itemIds = body.lines.flatMap((l) =>
      l.target.kind === 'existing' ? [l.target.itemId] : [],
    );
    const units = await repo.itemUnits(householdId, [...new Set(itemIds)]);
    const knownLocations = new Set<string>();
    for (const id of new Set(body.lines.map((l) => l.locationId))) {
      if (await this.deps.locations.exists(householdId, id)) knownLocations.add(id);
    }
    const index = buildAliasIndex(await this.deps.recipes.catalog());

    const writes: StockWrite[] = body.lines.map((line, i) => {
      if (!knownLocations.has(line.locationId))
        fields[`lines.${i}.locationId`] = 'validation.location.notFound';
      const target = line.target;
      if (target.kind === 'existing' && !units.has(target.itemId))
        fields[`lines.${i}.target.itemId`] = 'validation.shopping.itemNotFound';
      const ingredientId = lines.get(line.shoppingItemId)?.ingredientId ?? null;
      return {
        shoppingItemId: line.shoppingItemId,
        itemId: target.kind === 'existing' ? target.itemId : null,
        newItem:
          target.kind === 'new'
            ? {
                name: target.name,
                categoryKey: target.categoryKey,
                unit: target.unit,
                ...newItemIngredientLink(target.name, ingredientId, index),
              }
            : null,
        // ADR-0007 (decision 4): stock only. No price and no purchase, so nothing is counted as spending.
        batch: {
          quantityBase: line.quantityBase,
          locationId: line.locationId,
          expiryKind: line.expiry?.kind ?? null,
          expiryDate: line.expiry?.date ?? null,
          priceOre: null,
          purchasedOn: null,
        },
      };
    });
    if (Object.keys(fields).length > 0) throw fieldError(fields);

    let saved: string[] | null;
    try {
      saved = await repo.toInventory(householdId, actorId, writes);
    } catch (error) {
      // An item or place deleted between the check and the write trips a foreign key.
      if (isPrismaError(error, 'P2003')) throw changedMeanwhile();
      throw error;
    }
    if (saved === null) throw changedMeanwhile();
    return { added: saved.length, itemIds: saved };
  }

  private async repeated(householdId: string, itemId: string) {
    return {
      response: { item: await this.get(householdId, itemId), similarItemId: null },
      created: false,
    };
  }
}
