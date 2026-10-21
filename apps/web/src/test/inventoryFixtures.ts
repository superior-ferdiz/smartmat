import { daysBetween, osloDate, type BatchResponse, type ItemResponse } from '@smartmat/shared';
import { TEST_LOCATIONS } from './mockApi';

/** A date `days` from today (Norwegian time), so tests do not depend on when they run. */
export function inDays(days: number): string {
  const today = osloDate(new Date());
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const result = date.toISOString().slice(0, 10);
  if (daysBetween(today, result) !== days) throw new Error('inDays is wrong');
  return result;
}

export const FRIDGE = TEST_LOCATIONS[0]!.id;
export const FREEZER = TEST_LOCATIONS[1]!.id;
export const PANTRY = TEST_LOCATIONS[2]!.id;

let n = 0;
const uuid = () => `0199f0a0-0000-7000-8000-${String(++n).padStart(12, '0')}`;

export function batch(overrides: Partial<BatchResponse> = {}): BatchResponse {
  return {
    id: uuid(),
    quantityBase: 1000,
    initialQuantityBase: 1000,
    locationId: FRIDGE,
    expiryKind: null,
    expiryDate: null,
    priceOre: null,
    purchasedOn: null,
    purchaseId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

export function item(name: string, overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: uuid(),
    name,
    categoryKey: 'dairy',
    unit: 'ml',
    ingredientMatch: 'auto',
    ingredientId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    batches: [batch()],
    ...overrides,
  };
}
