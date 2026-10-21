import { describe, expect, it, vi } from 'vitest';
import {
  createPurchaseSchema,
  updatePurchaseSchema,
  type PurchaseResponse,
} from '@smartmat/shared';
import { AppError } from '../../lib/errors';
import { createFakeClock } from '../../test/fakes';
import type { LocationRepo } from '../locations/repo';
import type { PurchaseRepo, PurchaseWrite } from './repo';
import { purchaseTotal, PurchaseService } from './service';

const H = '0199f0a0-0000-7000-8000-000000000001';
const FRIDGE = '0199f0a0-0000-7000-8000-00000000f001';
const ITEM = '0199f0a0-0000-7000-8000-00000000a001';
const LINE = '0199f0a0-0000-7000-8000-00000000b001';

function stored(lines: PurchaseResponse['lines'] = []): PurchaseResponse {
  return {
    id: 'p1',
    storeName: null,
    purchasedOn: '2026-10-20',
    totalOre: 0,
    source: 'manual',
    createdAt: '',
    updatedAt: '',
    lines,
  };
}

function setup(existing: PurchaseResponse | null = stored()) {
  const writes: PurchaseWrite[] = [];
  const repo: PurchaseRepo = {
    listMonth: vi.fn(async () => []),
    get: vi.fn(async () => existing),
    findByDedupeKey: vi.fn(async () => null),
    itemUnits: vi.fn(
      async (_h, ids: string[]) =>
        new Map(ids.filter((id) => id === ITEM).map((id) => [id, 'g' as const])),
    ),
    create: vi.fn(async (_h, _a, write: PurchaseWrite) => {
      writes.push(write);
      return 'p1';
    }),
    update: vi.fn(async (_h, _a, _id, write: PurchaseWrite) => {
      writes.push(write);
      return true;
    }),
    remove: vi.fn(async () => ({ removedBatches: 0, keptBatches: 0 })),
  };
  const locations = {
    exists: vi.fn(async (_h, id: string) => id === FRIDGE),
  } as unknown as LocationRepo;
  const clock = createFakeClock(new Date('2026-10-21T10:00:00Z'));
  return { service: new PurchaseService({ repo, locations, now: clock.now }), repo, writes };
}

async function fieldsOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).fields;
}

const milk = {
  description: 'Lettmelk',
  kind: 'food',
  categoryKey: 'dairy',
  amountOre: 2490,
} as const;

describe('FR-BUD-001 purchaseTotal', () => {
  it('with lines: the sum of the lines, whatever total was given', () => {
    expect(purchaseTotal([{ amountOre: 2490 }, { amountOre: 5990 }], 1)).toBe(8480);
  });
  it('without lines: the given total (0 if none)', () => {
    expect(purchaseTotal([], 45_000)).toBe(45_000);
    expect(purchaseTotal([], null)).toBe(0);
  });
});

describe('FR-BUD-001/002 PurchaseService.create', () => {
  it('each batch gets the line’s price and the purchase date; a new item is named after the line', async () => {
    const { service, writes } = setup();
    await service.create(
      H,
      'u1',
      createPurchaseSchema.parse({
        purchasedOn: '2026-10-19',
        lines: [
          {
            ...milk,
            toInventory: {
              unit: 'ml',
              quantityBase: 1000,
              locationId: FRIDGE,
              expiry: { kind: 'best_before', date: '2026-10-28' },
            },
          },
        ],
      }),
    );
    expect(writes[0]).toEqual({
      storeName: null,
      purchasedOn: '2026-10-19',
      totalOre: 2490,
      lines: [
        {
          id: undefined,
          position: 0,
          description: 'Lettmelk',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 2490,
          toInventory: {
            itemId: null,
            newItem: { name: 'Lettmelk', categoryKey: 'dairy', unit: 'ml' },
            batch: {
              quantityBase: 1000,
              locationId: FRIDGE,
              expiryKind: 'best_before',
              expiryDate: '2026-10-28',
              priceOre: 2490,
              purchasedOn: '2026-10-19',
            },
          },
        },
      ],
    });
  });

  it('an existing item is used in its own unit (a unit sent along is ignored)', async () => {
    const { service, writes } = setup();
    await service.create(
      H,
      'u1',
      createPurchaseSchema.parse({
        purchasedOn: '2026-10-21',
        lines: [
          {
            ...milk,
            toInventory: { itemId: ITEM, unit: 'ml', quantityBase: 500, locationId: FRIDGE },
          },
        ],
      }),
    );
    expect(writes[0]!.lines[0]!.toInventory).toMatchObject({ itemId: ITEM, newItem: null });
  });

  it('collects every field error at once and writes nothing', async () => {
    const { service, repo } = setup();
    const fields = await fieldsOf(
      service.create(
        H,
        'u1',
        createPurchaseSchema.parse({
          purchasedOn: '2026-10-22',
          lines: [
            milk,
            { ...milk, toInventory: { unit: 'ml', quantityBase: 1, locationId: ITEM } },
            { ...milk, toInventory: { itemId: FRIDGE, quantityBase: 1, locationId: FRIDGE } },
          ],
        }),
      ),
    );
    expect(fields).toEqual({
      purchasedOn: 'validation.purchase.dateInFuture',
      'lines.1.toInventory.locationId': 'validation.location.notFound',
      'lines.2.toInventory.itemId': 'validation.purchase.itemNotFound',
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('NFR-DATA-002: a known client request id returns the saved purchase without writing', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.findByDedupeKey).mockResolvedValue('p1');
    const result = await service.create(
      H,
      'u1',
      createPurchaseSchema.parse({
        purchasedOn: '2026-10-21',
        totalOre: 1,
        clientRequestId: '0199f0a0-0000-7000-8000-000000000123',
      }),
    );
    expect(result.created).toBe(false);
    expect(repo.findByDedupeKey).toHaveBeenCalledWith(
      H,
      'manual:0199f0a0-0000-7000-8000-000000000123',
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('a place or item deleted between the check and the write is a 409, not a 500', async () => {
    const { service, repo } = setup();
    vi.mocked(repo.create).mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }));
    await expect(
      service.create(
        H,
        'u1',
        createPurchaseSchema.parse({ purchasedOn: '2026-10-21', totalOre: 1 }),
      ),
    ).rejects.toMatchObject({ statusCode: 409, code: 'errors.purchase.changedMeanwhile' });
  });
});

describe('FR-BUD-005 PurchaseService.update', () => {
  const linkedLine: PurchaseResponse['lines'][number] = {
    id: LINE,
    position: 0,
    description: 'Lettmelk',
    kind: 'food',
    categoryKey: 'dairy',
    amountOre: 2490,
    batch: { id: 'b1', itemId: ITEM, itemName: 'Lettmelk', untouched: true },
  };

  it('an unknown purchase is a 404', async () => {
    const { service } = setup(null);
    await expect(
      service.update(
        H,
        'u1',
        'p1',
        updatePurchaseSchema.parse({ purchasedOn: '2026-10-21', totalOre: 1 }),
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses line ids from elsewhere and a second batch for a linked line', async () => {
    const { service, repo } = setup(stored([linkedLine]));
    const fields = await fieldsOf(
      service.update(
        H,
        'u1',
        'p1',
        updatePurchaseSchema.parse({
          purchasedOn: '2026-10-21',
          lines: [
            { ...milk, id: LINE, toInventory: { unit: 'ml', quantityBase: 1, locationId: FRIDGE } },
            { ...milk, id: '0199f0a0-0000-7000-8000-00000000b999' },
          ],
        }),
      ),
    );
    expect(fields).toEqual({
      'lines.0.toInventory': 'validation.purchase.alreadyInInventory',
      'lines.1.id': 'validation.purchase.unknownLine',
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('passes the user’s choice about untouched batches on to the repo', async () => {
    const { service, repo } = setup(stored([linkedLine]));
    await service.update(
      H,
      'u1',
      'p1',
      updatePurchaseSchema.parse({
        purchasedOn: '2026-10-21',
        totalOre: 1,
        removeUntouchedBatches: false,
      }),
    );
    expect(repo.update).toHaveBeenCalledWith(H, 'u1', 'p1', expect.anything(), false);
  });
});
