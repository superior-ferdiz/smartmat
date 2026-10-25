import {
  CATEGORY_KEYS,
  firstOfMonth,
  monthRange,
  osloDate,
  wasteMonthFigures,
  wasteTrend,
  wasteTrendStart,
  type WasteStats,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import type { WasteRepo } from './repo';

export interface WasteServiceDeps {
  repo: WasteRepo;
  now: Clock;
}

/** FR-WASTE-002: "mest kastet" shows this many items. */
export const TOP_ITEMS = 5;

/** Spec 11 (FR-WASTE-001–004): one month's waste figures and the 12 months up to it. One household. */
export class WasteService {
  constructor(private readonly deps: WasteServiceDeps) {}

  async stats(householdId: string, month?: string): Promise<WasteStats> {
    const selected = month ?? osloDate(this.deps.now()).slice(0, 7);
    const { start, next } = monthRange(firstOfMonth(selected));
    // One query for the whole trend; the selected month is its last month.
    const [groups, topItems] = await Promise.all([
      this.deps.repo.groups(householdId, firstOfMonth(wasteTrendStart(selected)), next),
      this.deps.repo.topItems(householdId, start, next, TOP_ITEMS),
    ]);
    return {
      month: selected,
      ...wasteMonthFigures(groups, selected, CATEGORY_KEYS),
      topItems,
      trend: wasteTrend(groups, selected),
    };
  }
}
