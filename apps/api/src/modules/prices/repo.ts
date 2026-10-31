import type { BaseUnit, IngredientMatchMode, PriceSource } from '@smartmat/shared';
import type { Db } from '../../db';
import { fromDbDate } from '../../lib/dbDates';
import { isPrismaError } from '../purchases/repo';
import type { ProviderPriceObservation } from '../../providers/prices/types';

/*
 * Database access for prices (spec 12, ADR-0020).
 * - price_observations / price_lookups: the global cache of external prices. No household data, so no household id.
 * - Own prices are read from the household's batches. Every such function takes the household id and filters on it.
 */

export interface StoredObservation extends ProviderPriceObservation {
  source: PriceSource;
  gtin: string;
  fetchedAt: Date;
}

export interface StoredLookup {
  fetchedAt: Date;
  found: boolean;
}

/** A batch with a price: what the household paid or typed (FR-PRICE-002). */
export interface PricedBatch {
  batchId: string;
  itemId: string;
  unit: BaseUnit;
  priceOre: number;
  quantityBase: number;
  purchasedOn: string | null;
  createdAt: Date;
  purchaseId: string | null;
  storeName: string | null;
}

export interface PriceItem {
  id: string;
  name: string;
  unit: BaseUnit;
  ingredientMatch: IngredientMatchMode;
  ingredientId: string | null;
}

export interface OpenShoppingLine {
  id: string;
  text: string;
  ingredientId: string | null;
  quantityBase: number | null;
  unit: BaseUnit | null;
}

/** At most this many priced batches are read per request (a household's newest). */
const PRICED_BATCH_LIMIT = 500;

export interface PriceRepo {
  lookup(source: PriceSource, gtin: string): Promise<StoredLookup | null>;
  observations(source: PriceSource, gtins: readonly string[]): Promise<StoredObservation[]>;
  /** A new answer replaces everything stored for the barcode, in one transaction. */
  saveFound(
    source: PriceSource,
    gtin: string,
    observations: readonly ProviderPriceObservation[],
    fetchedAt: Date,
  ): Promise<void>;
  saveNotFound(source: PriceSource, gtin: string, fetchedAt: Date): Promise<void>;
  /** Spec 12: the worker deletes what has not been fetched since `cutoff`. */
  deleteFetchedBefore(cutoff: Date): Promise<{ lookups: number; observations: number }>;

  /** The item the household put the barcode on last time, if it still exists. */
  rememberedItem(householdId: string, gtin: string): Promise<{ id: string; name: string } | null>;
  item(householdId: string, itemId: string): Promise<PriceItem | null>;
  /** The barcode the household last put on the item. Store codes are never remembered (spec 07). */
  gtinForItem(householdId: string, itemId: string): Promise<string | null>;
  /** Priced batches (also used-up ones), for the given items or – without ids – the whole household. */
  pricedBatches(householdId: string, itemIds?: readonly string[]): Promise<PricedBatch[]>;
  items(householdId: string): Promise<PriceItem[]>;
  barcodesByItem(householdId: string): Promise<Map<string, string[]>>;
  openShoppingLines(householdId: string): Promise<OpenShoppingLine[]>;
}

/**
 * Two requests for the same barcode at the same moment (two phones, or the scan page and the item page) both fetch
 * and save the same answer; the second insert then hits the unique key. The first one's rows are as good, so the
 * second save is dropped instead of failing the request.
 */
async function ignoreConcurrentSave(save: Promise<unknown>) {
  try {
    await save;
  } catch (error) {
    if (!isPrismaError(error, 'P2002')) throw error;
  }
}

export function createPriceRepo(db: Db): PriceRepo {
  return {
    async lookup(source, gtin) {
      const row = await db.priceLookup.findUnique({ where: { source_gtin: { source, gtin } } });
      return row ? { fetchedAt: row.fetchedAt, found: row.found } : null;
    },

    async observations(source, gtins) {
      if (gtins.length === 0) return [];
      const rows = await db.priceObservation.findMany({
        where: { source, gtin: { in: [...gtins] } },
      });
      return rows.map((row) => ({
        source: row.source,
        chainCode: row.chainCode,
        chainName: row.chainName,
        priceOre: row.priceOre,
        packageQuantityBase: row.packageQuantityBase,
        packageUnit: row.packageUnit,
        observedAt: row.observedAt,
        sourceUrl: row.sourceUrl,
        fetchedAt: row.fetchedAt,
        gtin: row.gtin,
      }));
    },

    async saveFound(source, gtin, observations, fetchedAt) {
      await ignoreConcurrentSave(
        db.$transaction([
          db.priceObservation.deleteMany({ where: { source, gtin } }),
          db.priceObservation.createMany({
            data: observations.map((o) => ({ source, gtin, fetchedAt, ...o })),
          }),
          db.priceLookup.upsert({
            where: { source_gtin: { source, gtin } },
            create: { source, gtin, fetchedAt, found: true },
            update: { fetchedAt, found: true },
          }),
        ]),
      );
    },

    async saveNotFound(source, gtin, fetchedAt) {
      await ignoreConcurrentSave(
        db.$transaction([
          db.priceObservation.deleteMany({ where: { source, gtin } }),
          db.priceLookup.upsert({
            where: { source_gtin: { source, gtin } },
            create: { source, gtin, fetchedAt, found: false },
            update: { fetchedAt, found: false },
          }),
        ]),
      );
    },

    async deleteFetchedBefore(cutoff) {
      const [observations, lookups] = await db.$transaction([
        db.priceObservation.deleteMany({ where: { fetchedAt: { lt: cutoff } } }),
        db.priceLookup.deleteMany({ where: { fetchedAt: { lt: cutoff } } }),
      ]);
      return { lookups: lookups.count, observations: observations.count };
    },

    async rememberedItem(householdId, gtin) {
      const row = await db.householdBarcode.findUnique({
        where: { householdId_gtin: { householdId, gtin } },
        select: { item: { select: { id: true, name: true } } },
      });
      return row?.item ?? null;
    },

    item: (householdId, itemId) =>
      db.inventoryItem.findFirst({
        where: { id: itemId, householdId },
        select: { id: true, name: true, unit: true, ingredientMatch: true, ingredientId: true },
      }),

    async gtinForItem(householdId, itemId) {
      const row = await db.householdBarcode.findFirst({
        where: { householdId, itemId },
        orderBy: { updatedAt: 'desc' },
        select: { gtin: true },
      });
      return row?.gtin ?? null;
    },

    async pricedBatches(householdId, itemIds) {
      const rows = await db.inventoryBatch.findMany({
        where: {
          householdId,
          priceOre: { not: null },
          initialQuantityBase: { gt: 0 },
          ...(itemIds ? { itemId: { in: [...itemIds] } } : {}),
        },
        select: {
          id: true,
          itemId: true,
          priceOre: true,
          initialQuantityBase: true,
          purchasedOn: true,
          createdAt: true,
          item: { select: { unit: true } },
          purchaseLine: { select: { purchase: { select: { id: true, storeName: true } } } },
        },
        orderBy: [{ purchasedOn: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: PRICED_BATCH_LIMIT,
      });
      return rows.map((row) => ({
        batchId: row.id,
        itemId: row.itemId,
        unit: row.item.unit,
        priceOre: row.priceOre ?? 0,
        quantityBase: row.initialQuantityBase,
        purchasedOn: row.purchasedOn ? fromDbDate(row.purchasedOn) : null,
        createdAt: row.createdAt,
        purchaseId: row.purchaseLine?.purchase.id ?? null,
        storeName: row.purchaseLine?.purchase.storeName ?? null,
      }));
    },

    items: (householdId) =>
      db.inventoryItem.findMany({
        where: { householdId },
        select: { id: true, name: true, unit: true, ingredientMatch: true, ingredientId: true },
      }),

    async barcodesByItem(householdId) {
      const rows = await db.householdBarcode.findMany({
        where: { householdId, itemId: { not: null } },
        select: { itemId: true, gtin: true },
      });
      const map = new Map<string, string[]>();
      for (const row of rows) {
        if (!row.itemId) continue;
        map.set(row.itemId, [...(map.get(row.itemId) ?? []), row.gtin]);
      }
      return map;
    },

    openShoppingLines: (householdId) =>
      db.shoppingListItem.findMany({
        where: { householdId, checked: false },
        select: { id: true, text: true, ingredientId: true, quantityBase: true, unit: true },
        orderBy: { createdAt: 'asc' },
      }),
  };
}
