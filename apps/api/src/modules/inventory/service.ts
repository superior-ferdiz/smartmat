import {
  API_ERRORS,
  estimateWasteValueOre,
  monthRange,
  osloDate,
  type BatchInput,
  type ConsumeBody,
  type CreateItemBody,
  type DiscardBody,
  type HistoryResponse,
  type UpdateBatchBody,
  type UpdateItemBody,
  type WasteSummary,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { LocationRepo } from '../locations/repo';
import type {
  BatchRecord,
  EventRecord,
  InventoryRepo,
  NewBatch,
  UndoPlan,
  WasteRecord,
} from './repo';

export interface InventoryServiceDeps {
  repo: InventoryRepo;
  locations: LocationRepo;
  now: Clock;
}

/**
 * FR-INV-008: what undoing an event does. Pure function, so every case is unit tested.
 * Returns null when the event cannot be undone (its batch or the old location no longer exists).
 */
export function planUndo(event: EventRecord): UndoPlan | null {
  if (event.type === 'undo' || event.batchId === null) return null;
  if (event.type === 'move') {
    return event.fromLocationId
      ? { kind: 'move', batchId: event.batchId, toLocationId: event.fromLocationId }
      : null;
  }
  // add (+x) → take x out again (the batch becomes empty); consume/discard (-x) → put x back; adjust (±d) → -d.
  return { kind: 'quantity', batchId: event.batchId, delta: -event.deltaBase };
}

/** FR-INV-007: actual value if the user gave one, else estimated from the batch price, else unknown. */
export function wasteValue(
  batch: Pick<BatchRecord, 'priceOre' | 'initialQuantityBase'>,
  quantity: number,
  actualOre?: number | null,
): Omit<WasteRecord, 'reason'> {
  if (actualOre !== undefined && actualOre !== null)
    return { valueOre: actualOre, basis: 'actual' };
  if (batch.priceOre !== null) {
    return {
      valueOre: estimateWasteValueOre(batch.priceOre, quantity, batch.initialQuantityBase),
      basis: 'estimated',
    };
  }
  return { valueOre: null, basis: 'unknown' };
}

const conflict = (code: (typeof API_ERRORS)[keyof typeof API_ERRORS]) => new AppError(409, code);

/** Business rules for the inventory (FR-INV-001–008). All methods are scoped to one household. */
export class InventoryService {
  constructor(private readonly deps: InventoryServiceDeps) {}

  list(householdId: string) {
    return this.deps.repo.listItems(householdId);
  }

  async get(householdId: string, itemId: string) {
    const item = await this.deps.repo.getItem(householdId, itemId);
    if (!item) throw notFound();
    return item;
  }

  async create(householdId: string, actorId: string, body: CreateItemBody) {
    const batch = await this.toNewBatch(householdId, body.batch, 'batch.locationId');
    const itemId = await this.deps.repo.createItem(
      householdId,
      actorId,
      { name: body.name, categoryKey: body.categoryKey, unit: body.unit },
      batch,
    );
    return this.get(householdId, itemId);
  }

  async update(householdId: string, itemId: string, body: UpdateItemBody) {
    const patch: { name?: string; categoryKey?: CreateItemBody['categoryKey'] } = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.categoryKey !== undefined) patch.categoryKey = body.categoryKey;
    if (!(await this.deps.repo.updateItem(householdId, itemId, patch))) throw notFound();
    return this.get(householdId, itemId);
  }

  async remove(householdId: string, itemId: string) {
    if (!(await this.deps.repo.deleteItem(householdId, itemId))) throw notFound();
  }

  async addBatch(householdId: string, actorId: string, itemId: string, input: BatchInput) {
    const batch = await this.toNewBatch(householdId, input, 'locationId');
    if (!(await this.deps.repo.addBatch(householdId, actorId, itemId, batch))) throw notFound();
    return this.get(householdId, itemId);
  }

  async updateBatch(householdId: string, actorId: string, batchId: string, body: UpdateBatchBody) {
    const { repo } = this.deps;
    const batch = await this.requireBatch(householdId, batchId);

    const details: Parameters<InventoryRepo['updateBatchDetails']>[2] = {};
    if (body.expiry !== undefined) {
      details.expiryKind = body.expiry?.kind ?? null;
      details.expiryDate = body.expiry?.date ?? null;
    }
    if (body.priceOre !== undefined) details.priceOre = body.priceOre;
    if (body.purchasedOn !== undefined) details.purchasedOn = body.purchasedOn;
    if (Object.keys(details).length > 0)
      await repo.updateBatchDetails(householdId, batchId, details);

    if (body.locationId !== undefined && body.locationId !== batch.locationId) {
      await this.requireLocation(householdId, body.locationId, 'locationId');
      await repo.moveBatch(householdId, actorId, batch, body.locationId);
    }
    if (body.quantityBase !== undefined && body.quantityBase !== batch.quantityBase) {
      if (!(await repo.adjustBatch(householdId, actorId, batch, body.quantityBase))) {
        throw conflict(API_ERRORS.changedMeanwhile);
      }
    }
    return this.get(householdId, batch.itemId);
  }

  async consume(householdId: string, actorId: string, batchId: string, body: ConsumeBody) {
    const batch = await this.requireBatch(householdId, batchId);
    const result = await this.deps.repo.takeFromBatch(
      householdId,
      actorId,
      batch,
      body.quantityBase,
      null,
    );
    if (result === 'notEnough') throw conflict(API_ERRORS.notEnough);
    return this.get(householdId, batch.itemId);
  }

  async discard(householdId: string, actorId: string, batchId: string, body: DiscardBody) {
    const batch = await this.requireBatch(householdId, batchId);
    const waste: WasteRecord = {
      reason: body.reason,
      ...wasteValue(batch, body.quantityBase, body.valueOre),
    };
    const result = await this.deps.repo.takeFromBatch(
      householdId,
      actorId,
      batch,
      body.quantityBase,
      waste,
    );
    if (result === 'notEnough') throw conflict(API_ERRORS.notEnough);
    return this.get(householdId, batch.itemId);
  }

  async deleteBatch(householdId: string, batchId: string) {
    const batch = await this.requireBatch(householdId, batchId);
    await this.deps.repo.deleteBatch(householdId, batchId);
    return this.get(householdId, batch.itemId);
  }

  async history(householdId: string, itemId: string): Promise<HistoryResponse> {
    await this.get(householdId, itemId);
    const events = await this.deps.repo.history(householdId, itemId);
    const last = events[0];
    const undoable =
      last && last.type !== 'undo' && planUndo({ ...last }) !== null ? last.id : null;
    return { events, undoableEventId: undoable };
  }

  async undo(householdId: string, actorId: string, itemId: string) {
    await this.get(householdId, itemId);
    const last = await this.deps.repo.lastEvent(householdId, itemId);
    if (!last || last.type === 'undo') throw conflict(API_ERRORS.nothingToUndo);
    const plan = planUndo(last);
    if (!plan) throw conflict(API_ERRORS.cannotUndo);
    if ((await this.deps.repo.applyUndo(householdId, actorId, last, itemId, plan)) === 'conflict') {
      throw conflict(API_ERRORS.cannotUndo);
    }
    return this.get(householdId, itemId);
  }

  async wasteSummary(householdId: string): Promise<WasteSummary> {
    const today = osloDate(this.deps.now());
    const { start, next } = monthRange(today);
    return {
      month: today.slice(0, 7),
      ...(await this.deps.repo.wasteSummary(householdId, start, next)),
    };
  }

  private async requireBatch(householdId: string, batchId: string) {
    const batch = await this.deps.repo.getBatch(householdId, batchId);
    if (!batch) throw notFound();
    return batch;
  }

  /** A location id in the body that is not this household's is a field error (it may be someone else's). */
  private async requireLocation(householdId: string, locationId: string, field: string) {
    if (!(await this.deps.locations.exists(householdId, locationId))) {
      throw new AppError(400, API_ERRORS.validation, { [field]: 'validation.location.notFound' });
    }
  }

  private async toNewBatch(
    householdId: string,
    input: BatchInput,
    locationField: string,
  ): Promise<NewBatch> {
    await this.requireLocation(householdId, input.locationId, locationField);
    return {
      quantityBase: input.quantityBase,
      locationId: input.locationId,
      expiryKind: input.expiry?.kind ?? null,
      expiryDate: input.expiry?.date ?? null,
      priceOre: input.priceOre ?? null,
      purchasedOn: input.purchasedOn ?? null,
    };
  }
}
