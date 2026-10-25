import type {
  BaseUnit,
  CategoryKey,
  DeletePurchaseResponse,
  PurchaseLineKind,
  PurchaseListItem,
  PurchaseResponse,
} from '@smartmat/shared';
import type { Db } from '../../db';
import { fromDbDate, toDbDate } from '../../lib/dbDates';
import type { Prisma } from '../../generated/prisma/client';
import { insertBatchWithEvent, type NewBatch } from '../inventory/repo';
import { creatorSelect, toCreator } from '../../lib/creator';

/*
 * Database access for purchases (spec 04). Every function takes the household id and every query filters on
 * it (NFR-SEC-001). A purchase, its lines and the inventory batches made from them are written in one
 * transaction (ADR-0007): if any part fails, nothing is saved.
 */

/** FR-BUD-002: what a line puts into the inventory – onto an existing item, or as a new one. */
export interface LineInventoryWrite {
  itemId: string | null;
  newItem: { name: string; categoryKey: CategoryKey; unit: BaseUnit } | null;
  batch: NewBatch;
}

export interface LineWrite {
  /** Set for a line that already exists (FR-BUD-005). */
  id?: string | undefined;
  position: number;
  description: string;
  kind: PurchaseLineKind;
  categoryKey: CategoryKey | null;
  amountOre: number;
  toInventory: LineInventoryWrite | null;
}

/** Spec 08: the receipt a purchase is confirmed from. It is closed in the purchase's transaction. */
export interface ReceiptLink {
  id: string;
  confirmedAt: Date;
}

/** Thrown inside the transaction when the receipt is no longer waiting for review: nothing is saved. */
export class ReceiptNotInReviewError extends Error {
  constructor() {
    super('receipt is not in review');
    this.name = 'ReceiptNotInReviewError';
  }
}

export interface PurchaseWrite {
  storeName: string | null;
  purchasedOn: string;
  totalOre: number;
  lines: LineWrite[];
}

export interface PurchaseRepo {
  listMonth(householdId: string, start: string, next: string): Promise<PurchaseListItem[]>;
  get(householdId: string, purchaseId: string): Promise<PurchaseResponse | null>;
  findByDedupeKey(householdId: string, dedupeKey: string): Promise<string | null>;
  /** The unit of each of these items that belongs to the household (others are left out). */
  itemUnits(householdId: string, itemIds: string[]): Promise<Map<string, BaseUnit>>;
  /**
   * Returns the new purchase's id, or null if one with the same dedupe key was saved meanwhile. With a receipt,
   * the receipt is confirmed in the same transaction, or nothing is saved (ReceiptNotInReviewError).
   */
  create(
    householdId: string,
    actorId: string,
    purchase: PurchaseWrite,
    dedupeKey: string | null,
    receipt?: ReceiptLink,
  ): Promise<string | null>;
  /** False if the purchase no longer exists. */
  update(
    householdId: string,
    actorId: string,
    purchaseId: string,
    purchase: PurchaseWrite,
    removeUntouchedBatches: boolean,
  ): Promise<boolean>;
  remove(
    householdId: string,
    purchaseId: string,
    removeUntouchedBatches: boolean,
  ): Promise<DeletePurchaseResponse | null>;
}

const purchaseSelect = {
  id: true,
  householdId: true,
  storeName: true,
  purchasedOn: true,
  totalOre: true,
  source: true,
  createdAt: true,
  updatedAt: true,
  createdBy: creatorSelect,
  lines: {
    orderBy: { position: 'asc' },
    select: {
      id: true,
      position: true,
      description: true,
      kind: true,
      categoryKey: true,
      amountOre: true,
      batch: {
        select: {
          id: true,
          itemId: true,
          quantityBase: true,
          initialQuantityBase: true,
          item: { select: { name: true } },
          // Anything other than the "add" event means the batch has been used, thrown away, moved or adjusted.
          _count: { select: { events: { where: { type: { not: 'add' } } } } },
        },
      },
    },
  },
} satisfies Prisma.PurchaseSelect;

type PurchaseRow = Prisma.PurchaseGetPayload<{ select: typeof purchaseSelect }>;

function toPurchase(row: PurchaseRow): PurchaseResponse {
  return {
    id: row.id,
    storeName: row.storeName,
    purchasedOn: fromDbDate(row.purchasedOn),
    totalOre: row.totalOre,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
    createdBy: toCreator(row.householdId, row.createdBy),
    updatedAt: row.updatedAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      kind: line.kind,
      categoryKey: line.categoryKey as CategoryKey | null,
      amountOre: line.amountOre,
      batch: line.batch
        ? {
            id: line.batch.id,
            itemId: line.batch.itemId,
            itemName: line.batch.item.name,
            untouched:
              line.batch.quantityBase === line.batch.initialQuantityBase &&
              line.batch._count.events === 0,
          }
        : null,
    })),
  };
}

/** Adds a line's batch (and a new item if needed) inside the purchase's transaction. */
async function addLineToInventory(
  tx: Prisma.TransactionClient,
  householdId: string,
  actorId: string,
  lineId: string,
  write: LineInventoryWrite,
) {
  let itemId = write.itemId;
  if (!itemId) {
    if (!write.newItem) throw new Error('toInventory needs an item id or a new item');
    const item = await tx.inventoryItem.create({
      data: { householdId, ...write.newItem },
      select: { id: true },
    });
    itemId = item.id;
  }
  await insertBatchWithEvent(tx, householdId, actorId, itemId, write.batch, lineId);
}

async function createLine(
  tx: Prisma.TransactionClient,
  householdId: string,
  actorId: string,
  purchaseId: string,
  line: LineWrite,
) {
  const created = await tx.purchaseLine.create({
    data: {
      householdId,
      purchaseId,
      position: line.position,
      description: line.description,
      kind: line.kind,
      categoryKey: line.categoryKey,
      amountOre: line.amountOre,
    },
    select: { id: true },
  });
  if (line.toInventory) {
    await addLineToInventory(tx, householdId, actorId, created.id, line.toInventory);
  }
}

/**
 * Spec 04 decision 2: what happens to the batches of lines that are about to be deleted.
 * Untouched batches are removed (with their "add" event) when asked; every other batch stays in the
 * inventory with its price and history, and only loses the link. The rows are locked first, so a use or
 * discard that happens at the same moment either finishes before the check or waits for this transaction.
 */
async function releaseBatches(
  tx: Prisma.TransactionClient,
  householdId: string,
  lineIds: string[],
  removeUntouched: boolean,
): Promise<DeletePurchaseResponse> {
  if (lineIds.length === 0) return { removedBatches: 0, keptBatches: 0 };
  const batches = await tx.$queryRaw<{ id: string; item_id: string; untouched: boolean }[]>`
    SELECT b.id, b.item_id,
           (b.quantity_base = b.initial_quantity_base
            AND NOT EXISTS (SELECT 1 FROM inventory_events e
                            WHERE e.batch_id = b.id AND e.type <> 'add')) AS untouched
    FROM inventory_batches b
    WHERE b.household_id = ${householdId}::uuid
      AND b.purchase_line_id = ANY(${lineIds}::uuid[])
    FOR UPDATE OF b`;

  const remove = removeUntouched ? batches.filter((b) => b.untouched) : [];
  const keep = batches.filter((b) => !remove.includes(b));
  if (remove.length > 0) {
    const ids = remove.map((b) => b.id);
    await tx.inventoryEvent.deleteMany({ where: { householdId, batchId: { in: ids } } });
    await tx.inventoryBatch.deleteMany({ where: { householdId, id: { in: ids } } });
    // An item that came only from this purchase would be left as an empty shell: remove it as well.
    await tx.inventoryItem.deleteMany({
      where: {
        householdId,
        id: { in: remove.map((b) => b.item_id) },
        batches: { none: {} },
        events: { none: {} },
      },
    });
  }
  if (keep.length > 0) {
    await tx.inventoryBatch.updateMany({
      where: { householdId, id: { in: keep.map((b) => b.id) } },
      data: { purchaseLineId: null },
    });
  }
  return { removedBatches: remove.length, keptBatches: keep.length };
}

/**
 * Spec 08 FR-RCPT-006/008: the receipt becomes "confirmed" and keeps only the link to its purchase. The image and
 * the extraction are deleted now. The condition on the status stops a second confirmation of the same receipt.
 */
async function confirmReceipt(
  tx: Prisma.TransactionClient,
  householdId: string,
  receipt: ReceiptLink,
  purchaseId: string,
) {
  const { count } = await tx.receipt.updateMany({
    where: { id: receipt.id, householdId, status: 'review' },
    data: { status: 'confirmed', purchaseId, confirmedAt: receipt.confirmedAt, imageSha256: null },
  });
  if (count === 0) throw new ReceiptNotInReviewError();
  await tx.receiptImage.deleteMany({ where: { receiptId: receipt.id, householdId } });
  await tx.receiptExtraction.deleteMany({ where: { receiptId: receipt.id, householdId } });
}

export function createPurchaseRepo(db: Db): PurchaseRepo {
  return {
    async listMonth(householdId, start, next) {
      const rows = await db.purchase.findMany({
        where: { householdId, purchasedOn: { gte: toDbDate(start), lt: toDbDate(next) } },
        orderBy: [{ purchasedOn: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          storeName: true,
          purchasedOn: true,
          totalOre: true,
          lines: { select: { batch: { select: { id: true } } } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        storeName: row.storeName,
        purchasedOn: fromDbDate(row.purchasedOn),
        totalOre: row.totalOre,
        lineCount: row.lines.length,
        batchCount: row.lines.filter((line) => line.batch !== null).length,
      }));
    },

    async get(householdId, purchaseId) {
      const row = await db.purchase.findFirst({
        where: { id: purchaseId, householdId },
        select: purchaseSelect,
      });
      return row ? toPurchase(row) : null;
    },

    async findByDedupeKey(householdId, dedupeKey) {
      const row = await db.purchase.findFirst({
        where: { householdId, dedupeKey },
        select: { id: true },
      });
      return row?.id ?? null;
    },

    async itemUnits(householdId, itemIds) {
      if (itemIds.length === 0) return new Map();
      const rows = await db.inventoryItem.findMany({
        where: { householdId, id: { in: itemIds } },
        select: { id: true, unit: true },
      });
      return new Map(rows.map((r) => [r.id, r.unit]));
    },

    async create(householdId, actorId, purchase, dedupeKey, receipt) {
      try {
        return await db.$transaction(async (tx) => {
          const created = await tx.purchase.create({
            data: {
              householdId,
              storeName: purchase.storeName,
              purchasedOn: toDbDate(purchase.purchasedOn),
              totalOre: purchase.totalOre,
              source: receipt ? 'receipt' : 'manual',
              dedupeKey,
              createdById: actorId,
            },
            select: { id: true },
          });
          for (const line of purchase.lines) {
            await createLine(tx, householdId, actorId, created.id, line);
          }
          if (receipt) await confirmReceipt(tx, householdId, receipt, created.id);
          return created.id;
        });
      } catch (error) {
        // The same form arrived twice at the same moment: the unique dedupe key stopped the second one.
        if (dedupeKey && isPrismaError(error, 'P2002')) return null;
        throw error;
      }
    },

    async update(householdId, actorId, purchaseId, purchase, removeUntouchedBatches) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.purchase.updateMany({
          where: { id: purchaseId, householdId },
          data: {
            storeName: purchase.storeName,
            purchasedOn: toDbDate(purchase.purchasedOn),
            totalOre: purchase.totalOre,
          },
        });
        if (count === 0) return false;

        const existing = await tx.purchaseLine.findMany({
          where: { purchaseId, householdId },
          select: { id: true },
        });
        const keptIds = new Set(purchase.lines.flatMap((line) => (line.id ? [line.id] : [])));
        const removedIds = existing.map((l) => l.id).filter((id) => !keptIds.has(id));
        await releaseBatches(tx, householdId, removedIds, removeUntouchedBatches);
        await tx.purchaseLine.deleteMany({ where: { householdId, id: { in: removedIds } } });

        for (const line of purchase.lines) {
          if (!line.id) {
            await createLine(tx, householdId, actorId, purchaseId, line);
            continue;
          }
          await tx.purchaseLine.updateMany({
            where: { id: line.id, purchaseId, householdId },
            data: {
              position: line.position,
              description: line.description,
              kind: line.kind,
              categoryKey: line.categoryKey,
              amountOre: line.amountOre,
            },
          });
          // A linked batch follows the line: new price (for later waste estimates) and purchase date.
          // A line changed to non-food keeps its batch in the inventory but loses the link.
          await tx.inventoryBatch.updateMany({
            where: { householdId, purchaseLineId: line.id },
            data:
              line.kind === 'food'
                ? { priceOre: line.amountOre, purchasedOn: toDbDate(purchase.purchasedOn) }
                : { purchaseLineId: null },
          });
          if (line.toInventory) {
            await addLineToInventory(tx, householdId, actorId, line.id, line.toInventory);
          }
        }
        return true;
      });
    },

    async remove(householdId, purchaseId, removeUntouchedBatches) {
      return db.$transaction(async (tx) => {
        const purchase = await tx.purchase.findFirst({
          where: { id: purchaseId, householdId },
          select: { lines: { select: { id: true } } },
        });
        if (!purchase) return null;
        const result = await releaseBatches(
          tx,
          householdId,
          purchase.lines.map((l) => l.id),
          removeUntouchedBatches,
        );
        // The lines go with the purchase (ON DELETE CASCADE).
        await tx.purchase.deleteMany({ where: { id: purchaseId, householdId } });
        return result;
      });
    },
  };
}

export function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
