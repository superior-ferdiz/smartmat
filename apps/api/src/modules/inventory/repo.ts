import type {
  BatchResponse,
  CategoryKey,
  ExpiryKind,
  HistoryEvent,
  IngredientMatchMode,
  InventoryEventType,
  ItemResponse,
  WasteReason,
  WasteSummary,
} from '@smartmat/shared';
import type { Db } from '../../db';
import { fromDbDate, toDbDate } from '../../lib/dbDates';
import type { Prisma } from '../../generated/prisma/client';

/*
 * Database access for the inventory. Every function takes the household id and every query filters on it
 * (NFR-SEC-001), also when looking up by an item or batch id: an id from another household is "not found".
 * Changes to quantities and the matching event are written in one transaction.
 */

export interface NewBatch {
  quantityBase: number;
  locationId: string;
  expiryKind: ExpiryKind | null;
  expiryDate: string | null;
  priceOre: number | null;
  purchasedOn: string | null;
}

export interface BatchRecord {
  id: string;
  itemId: string;
  locationId: string;
  quantityBase: number;
  initialQuantityBase: number;
  priceOre: number | null;
}

export interface EventRecord {
  id: string;
  type: InventoryEventType;
  batchId: string | null;
  deltaBase: number;
  fromLocationId: string | null;
  toLocationId: string | null;
}

export interface WasteRecord {
  reason: WasteReason;
  valueOre: number | null;
  basis: 'actual' | 'estimated' | 'unknown';
}

export interface ItemPatch {
  name?: string;
  categoryKey?: CategoryKey;
  /** Spec 05: always set together; ingredientId only with 'manual' (CHECK in the database). */
  ingredientMatch?: IngredientMatchMode;
  ingredientId?: string | null;
}

/** What an undo does to the batch: change the quantity, or move it back. */
export type UndoPlan =
  | { kind: 'quantity'; batchId: string; delta: number }
  | { kind: 'move'; batchId: string; toLocationId: string };

export interface InventoryRepo {
  listItems(householdId: string): Promise<ItemResponse[]>;
  getItem(householdId: string, itemId: string): Promise<ItemResponse | null>;
  createItem(
    householdId: string,
    actorId: string,
    item: { name: string; categoryKey: CategoryKey; unit: ItemResponse['unit'] },
    batch: NewBatch,
  ): Promise<string>;
  updateItem(householdId: string, itemId: string, patch: ItemPatch): Promise<boolean>;
  deleteItem(householdId: string, itemId: string): Promise<boolean>;
  addBatch(householdId: string, actorId: string, itemId: string, batch: NewBatch): Promise<boolean>;
  getBatch(householdId: string, batchId: string): Promise<BatchRecord | null>;
  updateBatchDetails(
    householdId: string,
    batchId: string,
    details: {
      expiryKind?: ExpiryKind | null;
      expiryDate?: string | null;
      priceOre?: number | null;
      purchasedOn?: string | null;
    },
  ): Promise<void>;
  moveBatch(
    householdId: string,
    actorId: string,
    batch: BatchRecord,
    toLocationId: string,
  ): Promise<void>;
  /** Sets a new quantity; records the difference as "adjust". Returns false if the batch changed meanwhile. */
  adjustBatch(
    householdId: string,
    actorId: string,
    batch: BatchRecord,
    newQuantity: number,
  ): Promise<boolean>;
  /**
   * Takes `quantity` out of the batch (consume or discard) only if that much is left – checked by the
   * UPDATE itself, so two requests at the same time cannot make it negative.
   */
  takeFromBatch(
    householdId: string,
    actorId: string,
    batch: BatchRecord,
    quantity: number,
    waste: WasteRecord | null,
  ): Promise<'ok' | 'notEnough'>;
  deleteBatch(householdId: string, batchId: string): Promise<boolean>;
  history(householdId: string, itemId: string): Promise<HistoryEvent[]>;
  lastEvent(householdId: string, itemId: string): Promise<EventRecord | null>;
  applyUndo(
    householdId: string,
    actorId: string,
    event: EventRecord,
    itemId: string,
    plan: UndoPlan,
  ): Promise<'ok' | 'conflict'>;
  wasteSummary(
    householdId: string,
    monthStart: string,
    nextMonthStart: string,
  ): Promise<Omit<WasteSummary, 'month'>>;
}

const batchSelect = {
  id: true,
  quantityBase: true,
  initialQuantityBase: true,
  locationId: true,
  expiryKind: true,
  expiryDate: true,
  priceOre: true,
  purchasedOn: true,
  createdAt: true,
  purchaseLine: { select: { purchaseId: true } },
} satisfies Prisma.InventoryBatchSelect;

type BatchRow = Prisma.InventoryBatchGetPayload<{ select: typeof batchSelect }>;

function toBatch(row: BatchRow): BatchResponse {
  return {
    id: row.id,
    quantityBase: row.quantityBase,
    initialQuantityBase: row.initialQuantityBase,
    locationId: row.locationId,
    expiryKind: row.expiryKind,
    expiryDate: row.expiryDate ? fromDbDate(row.expiryDate) : null,
    priceOre: row.priceOre,
    purchasedOn: row.purchasedOn ? fromDbDate(row.purchasedOn) : null,
    purchaseId: row.purchaseLine?.purchaseId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const itemSelect = {
  id: true,
  name: true,
  categoryKey: true,
  unit: true,
  ingredientMatch: true,
  ingredientId: true,
  createdAt: true,
  batches: {
    where: { quantityBase: { gt: 0 } },
    select: batchSelect,
    // Earliest date first, batches without a date last (FR-INV-002).
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  },
} satisfies Prisma.InventoryItemSelect;

type ItemRow = Prisma.InventoryItemGetPayload<{ select: typeof itemSelect }>;

function toItem(row: ItemRow): ItemResponse {
  return {
    id: row.id,
    name: row.name,
    categoryKey: row.categoryKey as CategoryKey,
    unit: row.unit,
    ingredientMatch: row.ingredientMatch,
    ingredientId: row.ingredientId,
    createdAt: row.createdAt.toISOString(),
    batches: row.batches.map(toBatch),
  };
}

function batchData(batch: NewBatch) {
  return {
    quantityBase: batch.quantityBase,
    initialQuantityBase: batch.quantityBase,
    locationId: batch.locationId,
    expiryKind: batch.expiryKind,
    expiryDate: batch.expiryDate ? toDbDate(batch.expiryDate) : null,
    priceOre: batch.priceOre,
    purchasedOn: batch.purchasedOn ? toDbDate(batch.purchasedOn) : null,
  };
}

/**
 * Creates a batch and its "add" event inside the caller's transaction. Also used by purchases
 * (FR-BUD-002), so a batch from a purchase looks exactly like one added in the inventory.
 */
export async function insertBatchWithEvent(
  tx: Prisma.TransactionClient,
  householdId: string,
  actorId: string,
  itemId: string,
  batch: NewBatch,
  purchaseLineId: string | null = null,
): Promise<string> {
  const created = await tx.inventoryBatch.create({
    data: { householdId, itemId, purchaseLineId, ...batchData(batch) },
    select: { id: true },
  });
  await tx.inventoryEvent.create({
    data: {
      householdId,
      itemId,
      batchId: created.id,
      type: 'add',
      deltaBase: batch.quantityBase,
      toLocationId: batch.locationId,
      actorId,
    },
  });
  return created.id;
}

export function createInventoryRepo(db: Db): InventoryRepo {
  return {
    async listItems(householdId) {
      const rows = await db.inventoryItem.findMany({
        where: { householdId },
        select: itemSelect,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toItem);
    },

    async getItem(householdId, itemId) {
      const row = await db.inventoryItem.findFirst({
        where: { id: itemId, householdId },
        select: itemSelect,
      });
      return row ? toItem(row) : null;
    },

    async createItem(householdId, actorId, item, batch) {
      return db.$transaction(async (tx) => {
        const created = await tx.inventoryItem.create({
          data: { householdId, ...item },
          select: { id: true },
        });
        await insertBatchWithEvent(tx, householdId, actorId, created.id, batch);
        return created.id;
      });
    },

    async updateItem(householdId, itemId, patch) {
      const { count } = await db.inventoryItem.updateMany({
        where: { id: itemId, householdId },
        data: patch,
      });
      return count === 1;
    },

    async deleteItem(householdId, itemId) {
      // Batches and events go with the item (ON DELETE CASCADE): "Slett" is for mistakes (spec 03).
      const { count } = await db.inventoryItem.deleteMany({ where: { id: itemId, householdId } });
      return count === 1;
    },

    async addBatch(householdId, actorId, itemId, batch) {
      return db.$transaction(async (tx) => {
        const item = await tx.inventoryItem.findFirst({
          where: { id: itemId, householdId },
          select: { id: true },
        });
        if (!item) return false;
        await insertBatchWithEvent(tx, householdId, actorId, itemId, batch);
        return true;
      });
    },

    getBatch: (householdId, batchId) =>
      db.inventoryBatch.findFirst({
        where: { id: batchId, householdId },
        select: {
          id: true,
          itemId: true,
          locationId: true,
          quantityBase: true,
          initialQuantityBase: true,
          priceOre: true,
        },
      }),

    async updateBatchDetails(householdId, batchId, details) {
      const data: Prisma.InventoryBatchUpdateManyMutationInput = {};
      if (details.expiryKind !== undefined) data.expiryKind = details.expiryKind;
      if (details.expiryDate !== undefined)
        data.expiryDate = details.expiryDate ? toDbDate(details.expiryDate) : null;
      if (details.priceOre !== undefined) data.priceOre = details.priceOre;
      if (details.purchasedOn !== undefined)
        data.purchasedOn = details.purchasedOn ? toDbDate(details.purchasedOn) : null;
      await db.inventoryBatch.updateMany({ where: { id: batchId, householdId }, data });
    },

    async moveBatch(householdId, actorId, batch, toLocationId) {
      await db.$transaction([
        db.inventoryBatch.updateMany({
          where: { id: batch.id, householdId },
          data: { locationId: toLocationId },
        }),
        db.inventoryEvent.create({
          data: {
            householdId,
            itemId: batch.itemId,
            batchId: batch.id,
            type: 'move',
            deltaBase: 0,
            fromLocationId: batch.locationId,
            toLocationId,
            actorId,
          },
        }),
      ]);
    },

    async adjustBatch(householdId, actorId, batch, newQuantity) {
      return db.$transaction(async (tx) => {
        // Only if nobody changed the quantity since we read it; the event must match the real change.
        const { count } = await tx.inventoryBatch.updateMany({
          where: { id: batch.id, householdId, quantityBase: batch.quantityBase },
          data: { quantityBase: newQuantity },
        });
        if (count === 0) return false;
        await tx.inventoryEvent.create({
          data: {
            householdId,
            itemId: batch.itemId,
            batchId: batch.id,
            type: 'adjust',
            deltaBase: newQuantity - batch.quantityBase,
            actorId,
          },
        });
        return true;
      });
    },

    async takeFromBatch(householdId, actorId, batch, quantity, waste) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.inventoryBatch.updateMany({
          where: { id: batch.id, householdId, quantityBase: { gte: quantity } },
          data: { quantityBase: { decrement: quantity } },
        });
        if (count === 0) return 'notEnough' as const;
        await tx.inventoryEvent.create({
          data: {
            householdId,
            itemId: batch.itemId,
            batchId: batch.id,
            type: waste ? 'discard' : 'consume',
            deltaBase: -quantity,
            actorId,
            ...(waste
              ? {
                  wasteReason: waste.reason,
                  wasteValueOre: waste.valueOre,
                  wasteValueBasis: waste.basis,
                }
              : {}),
          },
        });
        return 'ok' as const;
      });
    },

    async deleteBatch(householdId, batchId) {
      return db.$transaction(async (tx) => {
        // "Slett" removes the batch and its history: it was registered by mistake (spec 03).
        await tx.inventoryEvent.deleteMany({ where: { batchId, householdId } });
        const { count } = await tx.inventoryBatch.deleteMany({
          where: { id: batchId, householdId },
        });
        return count === 1;
      });
    },

    async history(householdId, itemId) {
      const rows = await db.inventoryEvent.findMany({
        where: { itemId, householdId },
        orderBy: { seq: 'desc' },
        select: {
          id: true,
          type: true,
          deltaBase: true,
          batchId: true,
          fromLocationId: true,
          toLocationId: true,
          createdAt: true,
          revertsEventId: true,
          wasteReason: true,
          wasteValueOre: true,
          wasteValueBasis: true,
          actor: { select: { displayName: true } },
          revertsEvent: { select: { type: true } },
          revertedBy: { select: { id: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        type: r.type,
        deltaBase: r.deltaBase,
        batchId: r.batchId,
        fromLocationId: r.fromLocationId,
        toLocationId: r.toLocationId,
        actorName: r.actor?.displayName ?? null,
        createdAt: r.createdAt.toISOString(),
        revertsEventId: r.revertsEventId,
        revertedType: r.revertsEvent?.type ?? null,
        wasteReason: r.wasteReason,
        wasteValueOre: r.wasteValueOre,
        wasteValueBasis: r.wasteValueBasis,
        undone: r.revertedBy !== null,
      }));
    },

    lastEvent: (householdId, itemId) =>
      db.inventoryEvent.findFirst({
        where: { itemId, householdId },
        orderBy: { seq: 'desc' },
        select: {
          id: true,
          type: true,
          batchId: true,
          deltaBase: true,
          fromLocationId: true,
          toLocationId: true,
        },
      }),

    async applyUndo(householdId, actorId, event, itemId, plan) {
      try {
        return await db.$transaction(async (tx) => {
          if (plan.kind === 'quantity') {
            const where: Prisma.InventoryBatchWhereInput = { id: plan.batchId, householdId };
            // Taking out again must not make the quantity negative.
            if (plan.delta < 0) where.quantityBase = { gte: -plan.delta };
            const { count } = await tx.inventoryBatch.updateMany({
              where,
              data: { quantityBase: { increment: plan.delta } },
            });
            if (count === 0) throw new UndoConflict();
          } else {
            const { count } = await tx.inventoryBatch.updateMany({
              where: { id: plan.batchId, householdId },
              data: { locationId: plan.toLocationId },
            });
            if (count === 0) throw new UndoConflict();
          }
          await tx.inventoryEvent.create({
            data: {
              householdId,
              itemId,
              batchId: plan.batchId,
              type: 'undo',
              deltaBase: plan.kind === 'quantity' ? plan.delta : 0,
              revertsEventId: event.id,
              actorId,
              ...(plan.kind === 'move'
                ? { fromLocationId: event.toLocationId, toLocationId: plan.toLocationId }
                : {}),
            },
          });
          return 'ok' as const;
        });
      } catch (error) {
        if (error instanceof UndoConflict) return 'conflict';
        // Unique reverts_event_id: the same event was undone twice at the same time.
        if (error instanceof Error && 'code' in error && error.code === 'P2002') return 'conflict';
        // The location to move back to was deleted meanwhile (foreign key).
        if (error instanceof Error && 'code' in error && error.code === 'P2003') return 'conflict';
        throw error;
      }
    },

    async wasteSummary(householdId, monthStart, nextMonthStart) {
      // Month boundaries are midnight in Norway; "timestamp AT TIME ZONE" turns them into exact instants.
      // Undone discards do not count.
      const [row] = await db.$queryRaw<{ count: number; known: bigint | null; unknown: number }[]>`
        SELECT count(*)::int AS count,
               sum(e.waste_value_ore) FILTER (WHERE e.waste_value_basis <> 'unknown') AS known,
               (count(*) FILTER (WHERE e.waste_value_basis = 'unknown'))::int AS unknown
        FROM inventory_events e
        WHERE e.household_id = ${householdId}::uuid
          AND e.type = 'discard'
          AND NOT EXISTS (SELECT 1 FROM inventory_events u WHERE u.reverts_event_id = e.id)
          AND e.created_at >= (${monthStart}::date)::timestamp AT TIME ZONE 'Europe/Oslo'
          AND e.created_at < (${nextMonthStart}::date)::timestamp AT TIME ZONE 'Europe/Oslo'`;
      return {
        count: row?.count ?? 0,
        knownValueOre: Number(row?.known ?? 0),
        unknownValueCount: row?.unknown ?? 0,
      };
    },
  };
}

class UndoConflict extends Error {}
