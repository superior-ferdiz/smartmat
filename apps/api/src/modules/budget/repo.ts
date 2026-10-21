import type { CategoryKey, SpendingRow } from '@smartmat/shared';
import type { Db } from '../../db';
import { fromDbDate, toDbDate } from '../../lib/dbDates';

/*
 * Database access for the food budget (spec 04). Spending is never stored: it is summed from the purchases
 * every time (ADR-0007), so correcting or deleting a purchase changes every figure at once (FR-BUD-005).
 */

export interface BudgetRow {
  /** null = no budget from validFrom on. */
  amountOre: number | null;
  validFrom: string;
}

export interface MonthSpending {
  rows: SpendingRow[];
  /** Purchases with only a total (no lines). */
  unallocatedOre: number;
  purchaseCount: number;
}

export interface BudgetRepo {
  /** The budget row that applies to the month starting on `monthStart`: the latest one not after it. */
  forMonth(householdId: string, monthStart: string): Promise<BudgetRow | null>;
  /** Sets the budget from `monthStart` on (insert or replace that month's row). */
  set(householdId: string, monthStart: string, amountOre: number | null): Promise<void>;
  spending(householdId: string, start: string, next: string): Promise<MonthSpending>;
}

/** Postgres returns sum() as bigint; the API works with safe integers only. */
function toSafeNumber(value: bigint | number | null): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number)) throw new RangeError('sum is too large');
  return number;
}

export function createBudgetRepo(db: Db): BudgetRepo {
  return {
    async forMonth(householdId, monthStart) {
      const row = await db.foodBudget.findFirst({
        where: { householdId, validFrom: { lte: toDbDate(monthStart) } },
        orderBy: { validFrom: 'desc' },
        select: { amountOre: true, validFrom: true },
      });
      return row ? { amountOre: row.amountOre, validFrom: fromDbDate(row.validFrom) } : null;
    },

    async set(householdId, monthStart, amountOre) {
      const validFrom = toDbDate(monthStart);
      await db.foodBudget.upsert({
        where: { householdId_validFrom: { householdId, validFrom } },
        create: { householdId, validFrom, amountOre },
        update: { amountOre },
      });
    },

    async spending(householdId, start, next) {
      // purchased_on is a calendar date, so the month is a plain date range: no time zone can move it.
      const lines = await db.$queryRaw<
        { kind: 'food' | 'non_food'; category_key: string | null; amount: bigint }[]
      >`
        SELECT l.kind, l.category_key, sum(l.amount_ore) AS amount
        FROM purchase_lines l
        JOIN purchases p ON p.id = l.purchase_id AND p.household_id = l.household_id
        WHERE p.household_id = ${householdId}::uuid
          AND p.purchased_on >= ${start}::date
          AND p.purchased_on < ${next}::date
        GROUP BY l.kind, l.category_key`;
      const [totals] = await db.$queryRaw<{ count: number; unallocated: bigint | null }[]>`
        SELECT count(*)::int AS count,
               sum(p.total_ore) FILTER (
                 WHERE NOT EXISTS (SELECT 1 FROM purchase_lines l WHERE l.purchase_id = p.id)
               ) AS unallocated
        FROM purchases p
        WHERE p.household_id = ${householdId}::uuid
          AND p.purchased_on >= ${start}::date
          AND p.purchased_on < ${next}::date`;
      return {
        rows: lines.map((row) => ({
          kind: row.kind === 'food' ? 'food' : 'nonFood',
          categoryKey: row.category_key as CategoryKey | null,
          amountOre: toSafeNumber(row.amount),
        })),
        unallocatedOre: toSafeNumber(totals?.unallocated ?? null),
        purchaseCount: totals?.count ?? 0,
      };
    },
  };
}
