import {
  API_ERRORS,
  type ConfirmReceiptBody,
  monthRange,
  osloDate,
  firstOfMonth,
  sumOre,
  type CreatePurchaseBody,
  type PurchaseListResponse,
  type PurchaseResponse,
  type UpdatePurchaseBody,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { LocationRepo } from '../locations/repo';
import {
  isPrismaError,
  type LineWrite,
  type PurchaseRepo,
  type PurchaseWrite,
  type ReceiptLink,
} from './repo';

export interface PurchaseServiceDeps {
  repo: PurchaseRepo;
  locations: LocationRepo;
  now: Clock;
}

type BodyLine = CreatePurchaseBody['lines'][number] & { id?: string | undefined };

/**
 * FR-BUD-001: the total of a purchase. With lines it is always their sum, computed here – a total sent by
 * the client is refused by the schema, so the stored total can never disagree with the lines.
 */
export function purchaseTotal(lines: readonly { amountOre: number }[], totalOre?: number | null) {
  return lines.length > 0 ? sumOre(lines.map((l) => l.amountOre)) : (totalOre ?? 0);
}

const fieldError = (fields: Record<string, string>) =>
  new AppError(400, API_ERRORS.validation, fields);

/** Business rules for purchases (FR-BUD-001/002/005). All methods are scoped to one household. */
export class PurchaseService {
  constructor(private readonly deps: PurchaseServiceDeps) {}

  /** The current month in Norway ("YYYY-MM"). */
  currentMonth() {
    return osloDate(this.deps.now()).slice(0, 7);
  }

  async list(householdId: string, month = this.currentMonth()): Promise<PurchaseListResponse> {
    const { start, next } = monthRange(firstOfMonth(month));
    return { month, purchases: await this.deps.repo.listMonth(householdId, start, next) };
  }

  async get(householdId: string, purchaseId: string): Promise<PurchaseResponse> {
    const purchase = await this.deps.repo.get(householdId, purchaseId);
    if (!purchase) throw notFound();
    return purchase;
  }

  /** Returns the purchase and whether it is new (false when the same form was sent before). */
  async create(householdId: string, actorId: string, body: CreatePurchaseBody) {
    const { repo } = this.deps;
    const dedupeKey = body.clientRequestId ? `manual:${body.clientRequestId}` : null;
    if (dedupeKey) {
      const existing = await repo.findByDedupeKey(householdId, dedupeKey);
      if (existing) return { purchase: await this.get(householdId, existing), created: false };
    }

    const write = await this.toWrite(householdId, body, new Set());
    const id = await this.withRaceHandling(() =>
      repo.create(householdId, actorId, write, dedupeKey),
    );
    if (id === null && dedupeKey) {
      // Lost the race against an identical request: answer with the one that was saved.
      const existing = await repo.findByDedupeKey(householdId, dedupeKey);
      if (existing) return { purchase: await this.get(householdId, existing), created: false };
    }
    if (id === null) throw new AppError(409, API_ERRORS.purchaseChangedMeanwhile);
    return { purchase: await this.get(householdId, id), created: true };
  }

  /**
   * Spec 08 FR-RCPT-006: a corrected receipt becomes a purchase by the same rules as the form (date, items and
   * places in the household). Returns the id, or null when the dedupe key is taken (another receipt, or the same
   * one confirmed at the same moment). Throws ReceiptNotInReviewError if the receipt was closed meanwhile.
   */
  async createFromReceipt(
    householdId: string,
    actorId: string,
    body: ConfirmReceiptBody,
    dedupeKey: string,
    receipt: ReceiptLink,
  ): Promise<string | null> {
    const write = await this.toWrite(householdId, body, new Set());
    return this.withRaceHandling(() =>
      this.deps.repo.create(householdId, actorId, write, dedupeKey, receipt),
    );
  }

  async findByDedupeKey(householdId: string, dedupeKey: string) {
    return this.deps.repo.findByDedupeKey(householdId, dedupeKey);
  }

  async update(householdId: string, actorId: string, purchaseId: string, body: UpdatePurchaseBody) {
    const current = await this.get(householdId, purchaseId);
    const linked = new Set(current.lines.filter((l) => l.batch !== null).map((l) => l.id));
    const known = new Set(current.lines.map((l) => l.id));

    // A line id must be one of this purchase's lines; an id from another purchase (or household) is refused.
    const fields: Record<string, string> = {};
    body.lines.forEach((line, index) => {
      if (line.id && !known.has(line.id))
        fields[`lines.${index}.id`] = 'validation.purchase.unknownLine';
      if (line.id && line.toInventory && linked.has(line.id)) {
        fields[`lines.${index}.toInventory`] = 'validation.purchase.alreadyInInventory';
      }
    });
    if (Object.keys(fields).length > 0) throw fieldError(fields);

    const write = await this.toWrite(householdId, body, linked);
    const updated = await this.withRaceHandling(() =>
      this.deps.repo.update(householdId, actorId, purchaseId, write, body.removeUntouchedBatches),
    );
    if (!updated) throw notFound();
    return this.get(householdId, purchaseId);
  }

  async remove(householdId: string, purchaseId: string, removeUntouchedBatches: boolean) {
    const result = await this.deps.repo.remove(householdId, purchaseId, removeUntouchedBatches);
    if (!result) throw notFound();
    return result;
  }

  /**
   * Checks what the database cannot know from the body alone, and turns the body into what the repo writes:
   * the date is not in the future, items and places belong to this household, and each batch gets the
   * line's price and the purchase date.
   */
  private async toWrite(
    householdId: string,
    body: CreatePurchaseBody | UpdatePurchaseBody | ConfirmReceiptBody,
    linkedLineIds: Set<string>,
  ): Promise<PurchaseWrite> {
    const fields: Record<string, string> = {};
    if (body.purchasedOn > osloDate(this.deps.now())) {
      fields.purchasedOn = 'validation.purchase.dateInFuture';
    }

    const lines = body.lines as BodyLine[];
    const itemIds = lines.flatMap((l) => (l.toInventory?.itemId ? [l.toInventory.itemId] : []));
    const units = await this.deps.repo.itemUnits(householdId, [...new Set(itemIds)]);
    const locationIds = [
      ...new Set(lines.flatMap((l) => (l.toInventory ? [l.toInventory.locationId] : []))),
    ];
    const knownLocations = new Set<string>();
    for (const id of locationIds) {
      if (await this.deps.locations.exists(householdId, id)) knownLocations.add(id);
    }

    const writes: LineWrite[] = lines.map((line, index) => {
      const target = line.toInventory;
      let toInventory: LineWrite['toInventory'] = null;
      if (target && !(line.id && linkedLineIds.has(line.id))) {
        const prefix = `lines.${index}.toInventory`;
        if (!knownLocations.has(target.locationId)) {
          fields[`${prefix}.locationId`] = 'validation.location.notFound';
        }
        if (target.itemId && !units.has(target.itemId)) {
          fields[`${prefix}.itemId`] = 'validation.purchase.itemNotFound';
        }
        const unit = target.itemId ? units.get(target.itemId) : target.unit;
        toInventory = {
          itemId: target.itemId ?? null,
          newItem:
            !target.itemId && unit && line.categoryKey
              ? { name: line.description, categoryKey: line.categoryKey, unit }
              : null,
          batch: {
            quantityBase: target.quantityBase,
            locationId: target.locationId,
            expiryKind: target.expiry?.kind ?? null,
            expiryDate: target.expiry?.date ?? null,
            priceOre: line.amountOre,
            purchasedOn: body.purchasedOn,
          },
        };
      }
      return {
        id: line.id,
        position: index,
        description: line.description,
        kind: line.kind,
        categoryKey: line.kind === 'food' ? (line.categoryKey ?? null) : null,
        amountOre: line.amountOre,
        toInventory,
      };
    });
    if (Object.keys(fields).length > 0) throw fieldError(fields);

    return {
      storeName: body.storeName,
      purchasedOn: body.purchasedOn,
      totalOre: purchaseTotal(body.lines, body.totalOre),
      lines: writes,
    };
  }

  /** An item or place deleted between the check and the write trips a foreign key: report it as a conflict. */
  private async withRaceHandling<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isPrismaError(error, 'P2003'))
        throw new AppError(409, API_ERRORS.purchaseChangedMeanwhile);
      throw error;
    }
  }
}
