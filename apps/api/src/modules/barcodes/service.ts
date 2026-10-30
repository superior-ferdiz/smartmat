import {
  API_ERRORS,
  type BarcodeLookupResponse,
  type ConfirmScanBody,
  type ItemResponse,
  type ScanSuggestion,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { AppError, notFound } from '../../lib/errors';
import type { WindowLimiter } from '../../lib/windowLimiter';
import type {
  BarcodeProvider,
  ProviderProduct,
  UnavailableReason,
} from '../../providers/barcode/types';
import { newBatchFrom } from '../inventory/service';
import type { InventoryRepo } from '../inventory/repo';
import type { LocationRepo } from '../locations/repo';
import type { BarcodeRepo, ConfirmWrite } from './repo';

const DAY = 24 * 60 * 60_000;
/** Spec 07: how long a cached answer from Open Food Facts is used before OFF is asked again. */
export const PRODUCT_TTL_MS = 30 * DAY;
export const MISS_TTL_MS = DAY;

export interface BarcodeServiceDeps {
  repo: BarcodeRepo;
  provider: BarcodeProvider;
  inventory: Pick<InventoryRepo, 'getItem'>;
  locations: Pick<LocationRepo, 'exists'>;
  ingredients: { exists(ingredientId: string): Promise<boolean> };
  /** Lookups per logged-in user (spec 07: 30 per minute). */
  userLimiter: WindowLimiter;
  now: Clock;
}

/** A GTIN from the URL, already normalized by gtinSchema. */
export interface ParsedGtin {
  gtin: string;
  storeCode: boolean;
}

const EMPTY: ScanSuggestion = {
  name: null,
  brand: null,
  categoryKey: null,
  unit: null,
  quantityBase: null,
  ingredient: null,
  locationId: null,
  expiryKind: null,
};

export function suggestionFromProduct(product: ProviderProduct): ScanSuggestion {
  return {
    ...EMPTY,
    name: product.name,
    brand: product.brand,
    categoryKey: product.categoryKey,
    unit: product.packageUnit,
    quantityBase: product.packageQuantityBase,
  };
}

/** Business rules for barcode scanning (FR-SCAN-002, -004, -005). Lookups never save anything for the household. */
export class BarcodeService {
  constructor(private readonly deps: BarcodeServiceDeps) {}

  /**
   * FR-SCAN-002. Order: store code (never looked up) → the household's own answer → cache → Open Food Facts.
   * Returns why OFF was unavailable as well, so the route can log it (without the code).
   */
  async lookup(
    householdId: string,
    userId: string,
    { gtin, storeCode }: ParsedGtin,
  ): Promise<{ response: BarcodeLookupResponse; unavailable: UnavailableReason | null }> {
    const { repo, provider, now } = this.deps;
    if (!this.deps.userLimiter.take(userId)) throw new AppError(429, API_ERRORS.rateLimited);

    const answer = (
      source: BarcodeLookupResponse['source'],
      providerStatus: BarcodeLookupResponse['providerStatus'],
      suggestion: ScanSuggestion = EMPTY,
      existingItem: BarcodeLookupResponse['existingItem'] = null,
      unavailable: UnavailableReason | null = null,
    ) => ({
      response: { gtin, storeCode, source, providerStatus, suggestion, existingItem },
      unavailable,
    });

    if (storeCode) return answer('none', 'notAsked');

    const remembered = await repo.remembered(householdId, gtin);
    if (remembered) {
      const existingItem = remembered.itemId
        ? await repo.itemSummary(householdId, remembered.itemId)
        : null;
      return answer(
        'household',
        'notAsked',
        {
          ...EMPTY,
          name: remembered.name,
          categoryKey: remembered.categoryKey,
          unit: remembered.unit,
          quantityBase: remembered.quantityBase,
          ingredient: { match: remembered.ingredientMatch, ingredientId: remembered.ingredientId },
          locationId: remembered.locationId,
          expiryKind: remembered.expiryKind,
        },
        existingItem,
      );
    }

    const time = now();
    const cached = await repo.cachedProduct(gtin);
    if (cached && time.getTime() - cached.fetchedAt.getTime() < PRODUCT_TTL_MS) {
      return answer('openFoodFacts', 'found', suggestionFromProduct(cached.product));
    }
    const missAt = await repo.missCheckedAt(gtin);
    if (missAt && time.getTime() - missAt.getTime() < MISS_TTL_MS) {
      return answer('none', 'notFound');
    }

    const result = await provider.lookup(gtin);
    if (result.status === 'found') {
      await repo.saveProduct(gtin, result.product, time);
      return answer('openFoodFacts', 'found', suggestionFromProduct(result.product));
    }
    if (result.status === 'notFound') {
      await repo.saveMiss(gtin, time);
      return answer('none', 'notFound');
    }
    // NFR-REL-001: OFF is down or slow. An old cached answer is better than nothing; errors are never cached.
    if (cached) {
      return answer(
        'openFoodFacts',
        'found',
        suggestionFromProduct(cached.product),
        null,
        result.reason,
      );
    }
    if (result.reason === 'disabled') return answer('none', 'off', EMPTY, null, result.reason);
    return answer('none', 'unavailable', EMPTY, null, result.reason);
  }

  /**
   * FR-SCAN-005: saves what the user confirmed. The same clientRequestId again answers with the item, without a
   * second batch. Returns whether something new was saved.
   */
  async confirm(
    householdId: string,
    actorId: string,
    { gtin, storeCode }: ParsedGtin,
    body: ConfirmScanBody,
  ): Promise<{ item: ItemResponse; created: boolean }> {
    const { repo } = this.deps;
    const dedupeKey = `scan:${body.clientRequestId}`;
    const earlier = await repo.itemIdByDedupeKey(householdId, dedupeKey);
    if (earlier) return { item: await this.item(householdId, earlier), created: false };

    if (!(await this.deps.locations.exists(householdId, body.batch.locationId))) {
      throw new AppError(400, API_ERRORS.validation, {
        'batch.locationId': 'validation.location.notFound',
      });
    }

    let target: ConfirmWrite['target'];
    if (body.mode === 'newItem') {
      const { ingredient } = body;
      if (
        ingredient.match === 'manual' &&
        !(await this.deps.ingredients.exists(ingredient.ingredientId))
      ) {
        throw new AppError(400, API_ERRORS.validation, {
          'ingredient.ingredientId': 'validation.ingredient.unknown',
        });
      }
      target = {
        kind: 'newItem',
        item: {
          name: body.name,
          categoryKey: body.categoryKey,
          unit: body.unit,
          ingredientMatch: ingredient.match,
          ingredientId: ingredient.match === 'manual' ? ingredient.ingredientId : null,
        },
      };
    } else {
      target = { kind: 'existingItem', itemId: body.itemId };
    }

    const result = await repo.confirm(householdId, actorId, {
      gtin,
      remember: !storeCode,
      dedupeKey,
      batch: newBatchFrom(body.batch),
      target,
    });
    if (result.kind === 'itemGone') throw notFound();
    if (result.kind === 'duplicate') {
      // Lost the race against an identical request: answer with what that one saved.
      const saved = await repo.itemIdByDedupeKey(householdId, dedupeKey);
      if (!saved) throw new AppError(409, API_ERRORS.changedMeanwhile);
      return { item: await this.item(householdId, saved), created: false };
    }
    return { item: await this.item(householdId, result.itemId), created: true };
  }

  private async item(householdId: string, itemId: string) {
    const item = await this.deps.inventory.getItem(householdId, itemId);
    if (!item) throw notFound();
    return item;
  }
}
