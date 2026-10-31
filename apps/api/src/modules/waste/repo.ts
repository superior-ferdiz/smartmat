import {
  BASE_UNITS,
  CATEGORY_KEYS,
  WASTE_REASONS,
  WASTE_VALUE_BASIS_KEYS,
  type BaseUnit,
  type CategoryKey,
  type WasteGroup,
  type WasteReason,
  type WasteStats,
} from '@smartmat/shared';
import type { Db } from '../../db';

/*
 * Spec 11 (FR-WASTE-001–003): the waste log summed by the database. Nothing is stored (ADR-0007): the figures
 * come from the discard events every time, so an undo or a deleted item changes them at once.
 *
 * Month boundaries are midnight in Norway: "date::timestamp AT TIME ZONE 'Europe/Oslo'" is the exact instant,
 * and to_char(created_at AT TIME ZONE 'Europe/Oslo') gives the Norwegian month of an event.
 * Undone discards do not count (the same rule as the overview card, phase 3).
 */

export type TopItem = WasteStats['topItems'][number];

export interface WasteRepo {
  /** Discards from `start` (first of a month) up to, not including, `next`, grouped. */
  groups(householdId: string, start: string, next: string): Promise<WasteGroup[]>;
  /** FR-WASTE-002: the items discarded most often in [start, next), at most `limit`. */
  topItems(householdId: string, start: string, next: string, limit: number): Promise<TopItem[]>;
}

/** Postgres returns sum() as bigint; the API works with safe integers only. */
function toSafeNumber(value: bigint | number | null): number {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number)) throw new RangeError('sum is too large');
  return number;
}

const REASON_FROM_DB: Record<string, WasteReason> = { too_much: 'tooMuch' };

function reasonOf(value: string): WasteReason {
  const reason = REASON_FROM_DB[value] ?? value;
  if (!(WASTE_REASONS as readonly string[]).includes(reason))
    throw new Error('unknown waste reason');
  return reason as WasteReason;
}

function oneOf<T extends string>(values: readonly T[], value: string): T {
  if (!(values as readonly string[]).includes(value)) throw new Error('unexpected value');
  return value as T;
}

export function createWasteRepo(db: Db): WasteRepo {
  return {
    async groups(householdId, start, next) {
      const rows = await db.$queryRaw<
        {
          month: string;
          reason: string;
          category_key: string;
          unit: string;
          basis: string;
          count: number;
          value: bigint | null;
          quantity: bigint | null;
        }[]
      >`
        SELECT to_char(e.created_at AT TIME ZONE 'Europe/Oslo', 'YYYY-MM') AS month,
               e.waste_reason::text AS reason,
               i.category_key,
               i.unit::text AS unit,
               e.waste_value_basis::text AS basis,
               count(*)::int AS count,
               sum(e.waste_value_ore) AS value,
               sum(-e.delta_base) AS quantity
        FROM inventory_events e
        JOIN inventory_items i ON i.id = e.item_id AND i.household_id = e.household_id
        WHERE e.household_id = ${householdId}::uuid
          AND e.type = 'discard'
          AND NOT EXISTS (
            -- An undo is always written in the same household (spec 13: keeps the scan inside it, not the
            -- whole table – the planner chose a full scan of every household's events with 100 000 rows).
            SELECT 1 FROM inventory_events u
            WHERE u.reverts_event_id = e.id AND u.household_id = e.household_id
          )
          AND e.created_at >= (${start}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
          AND e.created_at < (${next}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
        GROUP BY 1, 2, 3, 4, 5`;
      return rows.map((row) => {
        const basis = oneOf(WASTE_VALUE_BASIS_KEYS, row.basis);
        return {
          month: row.month,
          reason: reasonOf(row.reason),
          categoryKey: oneOf<CategoryKey>(CATEGORY_KEYS, row.category_key),
          unit: oneOf<BaseUnit>(BASE_UNITS, row.unit),
          basis,
          count: row.count,
          // An unknown value is never given one, whatever the column says.
          valueOre: basis === 'unknown' ? 0 : toSafeNumber(row.value),
          quantityBase: toSafeNumber(row.quantity),
        };
      });
    },

    async topItems(householdId, start, next, limit) {
      const rows = await db.$queryRaw<
        {
          item_id: string;
          name: string;
          unit: string;
          count: number;
          quantity: bigint | null;
          known: bigint | null;
          unknown: number;
        }[]
      >`
        SELECT i.id AS item_id, i.name, i.unit::text AS unit,
               count(*)::int AS count,
               sum(-e.delta_base) AS quantity,
               sum(e.waste_value_ore) FILTER (WHERE e.waste_value_basis <> 'unknown') AS known,
               (count(*) FILTER (WHERE e.waste_value_basis = 'unknown'))::int AS unknown
        FROM inventory_events e
        JOIN inventory_items i ON i.id = e.item_id AND i.household_id = e.household_id
        WHERE e.household_id = ${householdId}::uuid
          AND e.type = 'discard'
          AND NOT EXISTS (
            -- An undo is always written in the same household (spec 13: keeps the scan inside it, not the
            -- whole table – the planner chose a full scan of every household's events with 100 000 rows).
            SELECT 1 FROM inventory_events u
            WHERE u.reverts_event_id = e.id AND u.household_id = e.household_id
          )
          AND e.created_at >= (${start}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
          AND e.created_at < (${next}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
        GROUP BY i.id, i.name, i.unit
        ORDER BY count(*) DESC, known DESC NULLS LAST, i.name, i.id
        LIMIT ${limit}`;
      return rows.map((row) => ({
        itemId: row.item_id,
        name: row.name,
        unit: oneOf<BaseUnit>(BASE_UNITS, row.unit),
        count: row.count,
        quantityBase: toSafeNumber(row.quantity),
        knownOre: toSafeNumber(row.known),
        unknownCount: row.unknown,
      }));
    },
  };
}
