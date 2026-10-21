import type { BudgetSummary, PurchaseResponse } from '@smartmat/shared';
import { EMPTY_SUMMARY } from './mockApi';

let n = 0;
const uuid = () => `0199f0a0-0000-7000-8000-${String(900_000 + ++n).padStart(12, '0')}`;

export function summary(overrides: Partial<BudgetSummary> = {}): BudgetSummary {
  return { ...EMPTY_SUMMARY, ...overrides };
}

type Line = PurchaseResponse['lines'][number];

export function line(description: string, overrides: Partial<Line> = {}): Line {
  return {
    id: uuid(),
    position: 0,
    description,
    kind: 'food',
    categoryKey: 'dairy',
    amountOre: 2490,
    batch: null,
    ...overrides,
  };
}

export function purchase(overrides: Partial<PurchaseResponse> = {}): PurchaseResponse {
  const lines = overrides.lines ?? [line('Lettmelk')];
  return {
    id: uuid(),
    storeName: 'Rema 1000',
    purchasedOn: '2026-10-20',
    totalOre: lines.reduce((sum, l) => sum + l.amountOre, 0),
    source: 'manual',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    lines,
    ...overrides,
  };
}
