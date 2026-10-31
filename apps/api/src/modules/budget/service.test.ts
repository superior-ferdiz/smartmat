import { describe, expect, it, vi } from 'vitest';
import { createFakeClock } from '../../test/fakes';
import type { BudgetRepo } from './repo';
import { BudgetService } from './service';

function setup(now = new Date('2026-10-21T10:00:00Z')) {
  const repo: BudgetRepo = {
    forMonth: vi.fn(async () => ({ amountOre: 500_000, validFrom: '2026-09-01' })),
    set: vi.fn(async () => undefined),
    spending: vi.fn(async () => ({
      rows: [
        { kind: 'food' as const, categoryKey: 'dairy' as const, amountOre: 4990 },
        { kind: 'nonFood' as const, categoryKey: null, amountOre: 3990 },
      ],
      unallocatedOre: 10_000,
      purchaseCount: 2,
    })),
  };
  const clock = createFakeClock(now);
  return { repo, service: new BudgetService({ repo, now: clock.now }) };
}

describe('FR-BUD-003/004 BudgetService', () => {
  it('a new budget is saved from the first of the current month in Norway', async () => {
    // 23:30 UTC on 31 October is already 1 November in Norway.
    const { repo, service } = setup(new Date('2026-10-31T23:30:00Z'));
    await service.set('h', 600_000);
    expect(repo.set).toHaveBeenCalledWith('h', '2026-11-01', 600_000);
  });

  it('the summary asks for the whole calendar month and adds up the figures', async () => {
    const { repo, service } = setup();
    const summary = await service.summary('h', '2026-12');
    expect(repo.forMonth).toHaveBeenCalledWith('h', '2026-12-01');
    expect(repo.spending).toHaveBeenCalledWith('h', '2026-12-01', '2027-01-01');
    expect(summary).toEqual({
      month: '2026-12',
      budgetOre: 500_000,
      spentOre: 14_990,
      remainingOre: 485_010,
      usedPercent: 2,
      byCategory: [{ categoryKey: 'dairy', amountOre: 4990 }],
      unallocatedOre: 10_000,
      nonFoodOre: 3990,
      purchaseCount: 2,
    });
  });

  it('without a month: the current month in Norway', async () => {
    const { service } = setup(new Date('2026-12-31T23:30:00Z'));
    expect((await service.summary('h')).month).toBe('2027-01');
  });

  it('a removed budget (null from some month) reads as no budget', async () => {
    const { repo, service } = setup();
    vi.mocked(repo.forMonth).mockResolvedValue({ amountOre: null, validFrom: '2026-10-01' });
    expect(await service.get('h')).toEqual({ amountOre: null, validFrom: null });
    expect((await service.summary('h')).remainingOre).toBeNull();
  });
});
