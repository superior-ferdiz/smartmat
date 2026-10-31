import {
  entryDelta,
  mergeQuantity,
  type BaseUnit,
  type CategoryKey,
  type IngredientMatchMode,
  type PlanContribution,
  type ShoppingItemResponse,
} from '@smartmat/shared';
import type { Db } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { fromDbDate } from '../../lib/dbDates';
import { creatorSelect, toCreator } from '../../lib/creator';
import { insertBatchWithEvent, type NewBatch } from '../inventory/repo';
import { isPrismaError } from '../purchases/repo';

/*
 * Database access for the shopping list (spec 06). Every function takes the household id and every query
 * filters on it (NFR-SEC-001). Writes that could race – adding lines, merging a recipe into the list – lock
 * the household's list row first, so they run one at a time per household.
 */

export interface NewShoppingLine {
  text: string;
  ingredientId: string | null;
  quantityBase: number | null;
  unit: BaseUnit | null;
}

export interface ShoppingLinePatch {
  text?: string;
  quantityBase?: number | null;
  unit?: BaseUnit | null;
  checked?: boolean;
  checkedAt?: Date | null;
}

export interface RecipeLineWrite {
  ingredientId: string;
  /** The ingredient's name, used as the text of a new line. */
  text: string;
  quantityBase: number | null;
  unit: BaseUnit;
}

/**
 * FR-PLAN-004 (spec 09): one ingredient from the meal plan. `shortfalls` is what the inventory does not cover
 * per entry; what each entry already added is read again inside the transaction and subtracted.
 */
export interface PlanLineWrite {
  ingredientId: string;
  /** The ingredient's name, used as the text of a new line. */
  text: string;
  unit: BaseUnit;
  /** The amount the user chose; undefined = the sum of what is left to add. */
  quantityOverride: number | null | undefined;
  shortfalls: { entryId: string; shortfallBase: number | null; unmet: boolean }[];
}

/** FR-SHOP-003: one checked line into the inventory, onto an existing item or as a new one. */
export interface StockWrite {
  shoppingItemId: string;
  itemId: string | null;
  newItem: {
    name: string;
    categoryKey: CategoryKey;
    unit: BaseUnit;
    ingredientMatch: IngredientMatchMode;
    ingredientId: string | null;
  } | null;
  batch: NewBatch;
}

export type CreateLineResult =
  { kind: 'created'; id: string; similarItemId: string | null } | { kind: 'duplicate' };

export interface ShoppingRepo {
  list(householdId: string): Promise<ShoppingItemResponse[]>;
  get(householdId: string, itemId: string): Promise<ShoppingItemResponse | null>;
  findByDedupeKey(householdId: string, dedupeKey: string): Promise<string | null>;
  /**
   * Adds a line. If another open line already has the ingredient, the new line is saved without it and that
   * line's id is returned as `similarItemId`. 'duplicate' = a line with the same dedupe key exists.
   */
  create(
    householdId: string,
    actorId: string,
    line: NewShoppingLine,
    dedupeKey: string | null,
  ): Promise<CreateLineResult>;
  /** False if the line does not exist in the household. Throws P2002 if unchecking would give two open lines. */
  update(householdId: string, itemId: string, patch: ShoppingLinePatch): Promise<boolean>;
  remove(householdId: string, itemId: string): Promise<boolean>;
  clearChecked(householdId: string): Promise<number>;
  addFromRecipe(
    householdId: string,
    actorId: string,
    recipeId: string,
    lines: RecipeLineWrite[],
  ): Promise<{ created: number; merged: number; skipped: number }>;
  /** FR-PLAN-004: what these entries already put on the household's list, per ingredient. */
  mealContributions(householdId: string, entryIds: string[]): Promise<PlanContribution[]>;
  addFromMealPlan(
    householdId: string,
    actorId: string,
    lines: PlanLineWrite[],
  ): Promise<{ created: number; merged: number; skipped: number }>;
  /** The unit of each of these inventory items that belongs to the household (others are left out). */
  itemUnits(householdId: string, itemIds: string[]): Promise<Map<string, BaseUnit>>;
  /** The new batches' item ids, or null if a line was no longer there and checked (nothing is saved then). */
  toInventory(householdId: string, actorId: string, writes: StockWrite[]): Promise<string[] | null>;
}

const itemSelect = {
  id: true,
  householdId: true,
  text: true,
  ingredientId: true,
  quantityBase: true,
  unit: true,
  checked: true,
  checkedAt: true,
  createdAt: true,
  createdBy: creatorSelect,
  recipes: {
    orderBy: { recipe: { title: 'asc' } },
    select: { recipeId: true, quantityBase: true, recipe: { select: { title: true } } },
  },
  meals: {
    orderBy: [{ entry: { date: 'asc' } }, { entry: { meal: 'asc' } }],
    select: {
      entryId: true,
      quantityBase: true,
      entry: { select: { date: true, meal: true, recipeTitle: true } },
    },
  },
} satisfies Prisma.ShoppingListItemSelect;

type ItemRow = Prisma.ShoppingListItemGetPayload<{ select: typeof itemSelect }>;

function toItem(row: ItemRow): ShoppingItemResponse {
  return {
    id: row.id,
    text: row.text,
    ingredientId: row.ingredientId,
    quantityBase: row.quantityBase,
    unit: row.unit,
    checked: row.checked,
    checkedAt: row.checkedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: toCreator(row.householdId, row.createdBy),
    recipes: row.recipes.map((r) => ({
      recipeId: r.recipeId,
      title: r.recipe.title,
      quantityBase: r.quantityBase,
    })),
    meals: row.meals.map((m) => ({
      entryId: m.entryId,
      date: fromDbDate(m.entry.date),
      meal: m.entry.meal,
      // Only recipe entries add to the list, so the title is always there.
      title: m.entry.recipeTitle ?? '',
      quantityBase: m.quantityBase,
    })),
  };
}

/**
 * The household's list id, with the row locked until the transaction ends. Every household gets its list at
 * registration (and the migration made one for older households); the insert is only a safety net.
 */
async function lockList(tx: Prisma.TransactionClient, householdId: string): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO shopping_lists (id, household_id) VALUES (gen_random_uuid(), ${householdId}::uuid)
    ON CONFLICT (household_id) DO NOTHING`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM shopping_lists WHERE household_id = ${householdId}::uuid FOR UPDATE`;
  const id = rows[0]?.id;
  if (!id) throw new Error('shopping list missing after insert');
  return id;
}

/** Thrown inside a transaction to roll it back when the lines changed meanwhile. */
class LinesChanged extends Error {}

export function createShoppingRepo(db: Db): ShoppingRepo {
  return {
    async list(householdId) {
      const rows = await db.shoppingListItem.findMany({
        where: { householdId },
        select: itemSelect,
        orderBy: [{ checked: 'asc' }, { checkedAt: 'desc' }, { createdAt: 'asc' }],
      });
      return rows.map(toItem);
    },

    async get(householdId, itemId) {
      const row = await db.shoppingListItem.findFirst({
        where: { id: itemId, householdId },
        select: itemSelect,
      });
      return row ? toItem(row) : null;
    },

    async findByDedupeKey(householdId, dedupeKey) {
      const row = await db.shoppingListItem.findFirst({
        where: { householdId, dedupeKey },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    async create(householdId, actorId, line, dedupeKey) {
      try {
        return await db.$transaction(async (tx) => {
          const listId = await lockList(tx, householdId);
          let similarItemId: string | null = null;
          if (line.ingredientId) {
            const open = await tx.shoppingListItem.findFirst({
              where: { householdId, listId, ingredientId: line.ingredientId, checked: false },
              select: { id: true },
            });
            similarItemId = open?.id ?? null;
          }
          const created = await tx.shoppingListItem.create({
            data: {
              householdId,
              listId,
              text: line.text,
              ingredientId: similarItemId ? null : line.ingredientId,
              quantityBase: line.quantityBase,
              unit: line.unit,
              dedupeKey,
              createdById: actorId,
            },
            select: { id: true },
          });
          return { kind: 'created' as const, id: created.id, similarItemId };
        });
      } catch (error) {
        // The same form arrived twice at the same moment: the unique dedupe key stopped the second one.
        if (dedupeKey && isPrismaError(error, 'P2002')) return { kind: 'duplicate' };
        throw error;
      }
    },

    async update(householdId, itemId, patch) {
      const { count } = await db.shoppingListItem.updateMany({
        where: { id: itemId, householdId },
        data: patch,
      });
      return count === 1;
    },

    async remove(householdId, itemId) {
      const { count } = await db.shoppingListItem.deleteMany({
        where: { id: itemId, householdId },
      });
      return count === 1;
    },

    async clearChecked(householdId) {
      const { count } = await db.shoppingListItem.deleteMany({
        where: { householdId, checked: true },
      });
      return count;
    },

    async addFromRecipe(householdId, actorId, recipeId, lines) {
      return db.$transaction(async (tx) => {
        const listId = await lockList(tx, householdId);
        const result = { created: 0, merged: 0, skipped: 0 };
        for (const line of lines) {
          const open = await tx.shoppingListItem.findFirst({
            where: { householdId, listId, ingredientId: line.ingredientId, checked: false },
            select: {
              id: true,
              quantityBase: true,
              unit: true,
              recipes: { where: { recipeId }, select: { recipeId: true } },
            },
          });
          if (open && open.recipes.length > 0) {
            // This recipe already added to the line: adding it again changes nothing (spec 06).
            result.skipped++;
            continue;
          }
          let itemId: string;
          if (open) {
            const merged = mergeQuantity(open, line);
            await tx.shoppingListItem.update({
              where: { id: open.id },
              data: { quantityBase: merged.quantityBase, unit: merged.unit },
            });
            itemId = open.id;
            result.merged++;
          } else {
            const created = await tx.shoppingListItem.create({
              data: {
                householdId,
                listId,
                text: line.text,
                ingredientId: line.ingredientId,
                quantityBase: line.quantityBase,
                unit: line.quantityBase === null ? null : line.unit,
                createdById: actorId,
              },
              select: { id: true },
            });
            itemId = created.id;
            result.created++;
          }
          await tx.shoppingListItemRecipe.create({
            data: { itemId, householdId, recipeId, quantityBase: line.quantityBase },
          });
        }
        return result;
      });
    },

    async mealContributions(householdId, entryIds) {
      if (entryIds.length === 0) return [];
      const rows = await db.shoppingListItemMeal.findMany({
        where: { householdId, entryId: { in: entryIds } },
        select: { entryId: true, quantityBase: true, item: { select: { ingredientId: true } } },
      });
      return rows.flatMap((r) =>
        r.item.ingredientId
          ? [
              {
                entryId: r.entryId,
                ingredientId: r.item.ingredientId,
                quantityBase: r.quantityBase,
              },
            ]
          : [],
      );
    },

    async addFromMealPlan(householdId, actorId, lines) {
      return db.$transaction(async (tx) => {
        const listId = await lockList(tx, householdId);
        const result = { created: 0, merged: 0, skipped: 0 };
        for (const line of lines) {
          // Read under the list lock: two requests at once cannot both see "nothing added yet".
          const shares = await tx.shoppingListItemMeal.findMany({
            where: {
              householdId,
              entryId: { in: line.shortfalls.map((s) => s.entryId) },
              item: { ingredientId: line.ingredientId },
            },
            select: { entryId: true, quantityBase: true },
          });
          const addedBy = new Map<string, { quantityBase: number; any: boolean }>();
          for (const share of shares) {
            const sum = addedBy.get(share.entryId) ?? { quantityBase: 0, any: false };
            addedBy.set(share.entryId, {
              quantityBase: sum.quantityBase + (share.quantityBase ?? 0),
              any: true,
            });
          }
          const deltas: { entryId: string; quantityBase: number | null }[] = [];
          for (const s of line.shortfalls) {
            const added = addedBy.get(s.entryId);
            const delta = entryDelta({
              shortfallBase: s.shortfallBase,
              addedBase: added?.quantityBase ?? null,
            });
            if (delta > 0) deltas.push({ entryId: s.entryId, quantityBase: delta });
            // "Etter smak" with nothing in the house: added once, without an amount.
            else if (s.shortfallBase === null && s.unmet && !added?.any)
              deltas.push({ entryId: s.entryId, quantityBase: null });
          }
          if (deltas.length === 0) {
            // Everything this plan needs of it was added before (FR-PLAN-004).
            result.skipped++;
            continue;
          }
          const sum = deltas.reduce((total, d) => total + (d.quantityBase ?? 0), 0);
          const quantityBase =
            line.quantityOverride !== undefined ? line.quantityOverride : sum > 0 ? sum : null;

          const open = await tx.shoppingListItem.findFirst({
            where: { householdId, listId, ingredientId: line.ingredientId, checked: false },
            select: { id: true, quantityBase: true, unit: true },
          });
          let itemId: string;
          if (open) {
            const merged = mergeQuantity(open, { quantityBase, unit: line.unit });
            await tx.shoppingListItem.update({
              where: { id: open.id },
              data: { quantityBase: merged.quantityBase, unit: merged.unit },
            });
            itemId = open.id;
            result.merged++;
          } else {
            const created = await tx.shoppingListItem.create({
              data: {
                householdId,
                listId,
                text: line.text,
                ingredientId: line.ingredientId,
                quantityBase,
                unit: quantityBase === null ? null : line.unit,
                createdById: actorId,
              },
              select: { id: true },
            });
            itemId = created.id;
            result.created++;
          }
          for (const delta of deltas) {
            const key = { itemId_entryId: { itemId, entryId: delta.entryId } };
            const existing = await tx.shoppingListItemMeal.findUnique({
              where: key,
              select: { quantityBase: true },
            });
            if (existing) {
              await tx.shoppingListItemMeal.update({
                where: key,
                data: {
                  quantityBase:
                    delta.quantityBase === null
                      ? existing.quantityBase
                      : (existing.quantityBase ?? 0) + delta.quantityBase,
                },
              });
            } else {
              await tx.shoppingListItemMeal.create({
                data: {
                  itemId,
                  entryId: delta.entryId,
                  householdId,
                  quantityBase: delta.quantityBase,
                },
              });
            }
          }
        }
        return result;
      });
    },

    async itemUnits(householdId, itemIds) {
      if (itemIds.length === 0) return new Map();
      const rows = await db.inventoryItem.findMany({
        where: { householdId, id: { in: itemIds } },
        select: { id: true, unit: true },
      });
      return new Map(rows.map((r) => [r.id, r.unit]));
    },

    async toInventory(householdId, actorId, writes) {
      try {
        return await db.$transaction(async (tx) => {
          // The lines leave the list first, on condition that they are still there and checked. A second
          // request with the same lines (double click, two phones) deletes nothing and is rolled back, so it
          // can never add the batches twice (spec 06, FR-SHOP-003).
          const { count } = await tx.shoppingListItem.deleteMany({
            where: { householdId, checked: true, id: { in: writes.map((w) => w.shoppingItemId) } },
          });
          if (count !== writes.length) throw new LinesChanged();

          const itemIds: string[] = [];
          for (const write of writes) {
            let itemId = write.itemId;
            if (!itemId) {
              if (!write.newItem) throw new Error('a stock line needs an item id or a new item');
              const item = await tx.inventoryItem.create({
                data: { householdId, ...write.newItem },
                select: { id: true },
              });
              itemId = item.id;
            }
            await insertBatchWithEvent(tx, householdId, actorId, itemId, write.batch);
            itemIds.push(itemId);
          }
          return itemIds;
        });
      } catch (error) {
        if (error instanceof LinesChanged) return null;
        throw error;
      }
    },
  };
}
