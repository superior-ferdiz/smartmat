import type { CreatorRef, Meal } from '@smartmat/shared';
import type { Db } from '../../db';
import type { Prisma } from '../../generated/prisma/client';
import { creatorSelect, toCreator } from '../../lib/creator';
import { fromDbDate, toDbDate } from '../../lib/dbDates';
import { isPrismaError } from '../purchases/repo';

/*
 * Database access for the meal plan (spec 09). Every function takes the household id and every query
 * filters on it (NFR-SEC-001): an entry id from another household is simply not found.
 */

export interface MealEntryRecord {
  id: string;
  date: string;
  meal: Meal;
  /** Null for a note, and when the recipe was removed (the title copy stays). */
  recipeId: string | null;
  recipeTitle: string | null;
  servings: number | null;
  note: string | null;
  createdAt: Date;
  createdBy: CreatorRef;
}

export type NewMealEntry =
  | { date: string; meal: Meal; recipeId: string; recipeTitle: string; servings: number }
  | { date: string; meal: Meal; note: string };

export interface MealEntryPatch {
  date?: string;
  meal?: Meal;
  servings?: number;
  note?: string;
}

export type CreateEntryResult = { kind: 'created'; id: string } | { kind: 'duplicate' };

export interface MealPlanRepo {
  /** Entries from `from` to `to` (both included), by date, meal and the order they were added. */
  list(householdId: string, from: string, to: string): Promise<MealEntryRecord[]>;
  get(householdId: string, entryId: string): Promise<MealEntryRecord | null>;
  findByDedupeKey(householdId: string, dedupeKey: string): Promise<string | null>;
  countOnDay(householdId: string, date: string): Promise<number>;
  create(
    householdId: string,
    actorId: string,
    entry: NewMealEntry,
    dedupeKey: string | null,
  ): Promise<CreateEntryResult>;
  /** False if the entry does not exist in the household. */
  update(householdId: string, entryId: string, patch: MealEntryPatch): Promise<boolean>;
  remove(householdId: string, entryId: string): Promise<boolean>;
}

const entrySelect = {
  id: true,
  householdId: true,
  date: true,
  meal: true,
  recipeId: true,
  recipeTitle: true,
  servings: true,
  note: true,
  createdAt: true,
  createdBy: creatorSelect,
} satisfies Prisma.MealPlanEntrySelect;

type EntryRow = Prisma.MealPlanEntryGetPayload<{ select: typeof entrySelect }>;

const toEntry = ({ householdId, createdBy, ...row }: EntryRow): MealEntryRecord => ({
  ...row,
  date: fromDbDate(row.date),
  createdBy: toCreator(householdId, createdBy),
});

export function createMealPlanRepo(db: Db): MealPlanRepo {
  return {
    async list(householdId, from, to) {
      const rows = await db.mealPlanEntry.findMany({
        where: { householdId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
        select: entrySelect,
        // The meal enum sorts in its declared order: breakfast, lunch, dinner.
        orderBy: [{ date: 'asc' }, { meal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toEntry);
    },

    async get(householdId, entryId) {
      const row = await db.mealPlanEntry.findFirst({
        where: { id: entryId, householdId },
        select: entrySelect,
      });
      return row ? toEntry(row) : null;
    },

    async findByDedupeKey(householdId, dedupeKey) {
      const row = await db.mealPlanEntry.findFirst({
        where: { householdId, dedupeKey },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    async countOnDay(householdId, date) {
      return db.mealPlanEntry.count({ where: { householdId, date: toDbDate(date) } });
    },

    async create(householdId, actorId, entry, dedupeKey) {
      try {
        const row = await db.mealPlanEntry.create({
          data: {
            householdId,
            date: toDbDate(entry.date),
            meal: entry.meal,
            ...('note' in entry
              ? { note: entry.note }
              : {
                  recipeId: entry.recipeId,
                  recipeTitle: entry.recipeTitle,
                  servings: entry.servings,
                }),
            dedupeKey,
            createdById: actorId,
          },
          select: { id: true },
        });
        return { kind: 'created', id: row.id };
      } catch (error) {
        // The same form arrived twice at the same moment: the unique dedupe key stopped the second one.
        if (dedupeKey && isPrismaError(error, 'P2002')) return { kind: 'duplicate' };
        throw error;
      }
    },

    async update(householdId, entryId, patch) {
      const { count } = await db.mealPlanEntry.updateMany({
        where: { id: entryId, householdId },
        data: {
          ...(patch.date !== undefined ? { date: toDbDate(patch.date) } : {}),
          ...(patch.meal !== undefined ? { meal: patch.meal } : {}),
          ...(patch.servings !== undefined ? { servings: patch.servings } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
        },
      });
      return count === 1;
    },

    async remove(householdId, entryId) {
      const { count } = await db.mealPlanEntry.deleteMany({ where: { id: entryId, householdId } });
      return count === 1;
    },
  };
}
