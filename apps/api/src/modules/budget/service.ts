import {
  firstOfMonth,
  monthFigures,
  monthRange,
  osloDate,
  type BudgetResponse,
  type BudgetSummary,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import type { BudgetRepo } from './repo';

export interface BudgetServiceDeps {
  repo: BudgetRepo;
  now: Clock;
}

/** FR-BUD-003/004: the monthly food budget and the month's figures. Scoped to one household. */
export class BudgetService {
  constructor(private readonly deps: BudgetServiceDeps) {}

  /** The current month in Norway ("YYYY-MM"). */
  private currentMonth() {
    return osloDate(this.deps.now()).slice(0, 7);
  }

  async get(householdId: string): Promise<BudgetResponse> {
    const row = await this.deps.repo.forMonth(householdId, firstOfMonth(this.currentMonth()));
    return row?.amountOre
      ? { amountOre: row.amountOre, validFrom: row.validFrom }
      : { amountOre: null, validFrom: null };
  }

  /** Spec 04 decision 4: a change applies from the current month on; earlier months keep their amount. */
  async set(householdId: string, amountOre: number | null): Promise<BudgetResponse> {
    await this.deps.repo.set(householdId, firstOfMonth(this.currentMonth()), amountOre);
    return this.get(householdId);
  }

  async summary(householdId: string, month = this.currentMonth()): Promise<BudgetSummary> {
    const { start, next } = monthRange(firstOfMonth(month));
    const [budget, spending] = await Promise.all([
      this.deps.repo.forMonth(householdId, start),
      this.deps.repo.spending(householdId, start, next),
    ]);
    return {
      month,
      ...monthFigures(budget?.amountOre ?? null, spending.rows, spending.unallocatedOre),
      purchaseCount: spending.purchaseCount,
    };
  }
}
