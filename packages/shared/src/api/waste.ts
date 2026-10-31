import { z } from 'zod';
import { BASE_UNITS } from '../quantity/quantity';
import { CATEGORY_KEYS, WASTE_REASONS } from '../schemas/inventory';

/* Spec 11 (FR-WASTE-001–004): GET /households/:householdId/waste-stats?month=YYYY-MM. */

const ore = z.number().int().nonnegative();
const value = {
  count: z.number().int().nonnegative(),
  actualOre: ore,
  estimatedOre: ore,
  knownOre: ore,
  unknownCount: z.number().int().nonnegative(),
};
const share = { ...value, percent: z.number().int().min(0).max(100) };

export const wasteStatsSchema = z.object({
  /** "YYYY-MM", in Norwegian time. */
  month: z.string(),
  ...value,
  /** floor(estimated × 100 / known), or null without a known value. */
  estimatedPercent: z.number().int().min(0).max(100).nullable(),
  quantities: z.array(z.object({ unit: z.enum(BASE_UNITS), quantityBase: z.number().int() })),
  byReason: z.array(z.object({ reason: z.enum(WASTE_REASONS), ...share })),
  byCategory: z.array(z.object({ categoryKey: z.enum(CATEGORY_KEYS), ...share })),
  /** The items thrown away most often this month (at most 5). */
  topItems: z.array(
    z.object({
      itemId: z.uuid(),
      name: z.string(),
      unit: z.enum(BASE_UNITS),
      count: z.number().int().positive(),
      quantityBase: z.number().int().nonnegative(),
      knownOre: ore,
      unknownCount: z.number().int().nonnegative(),
    }),
  ),
  /** 12 months up to and including `month`, oldest first. */
  trend: z.array(z.object({ month: z.string(), ...value })),
});
export type WasteStats = z.infer<typeof wasteStatsSchema>;
