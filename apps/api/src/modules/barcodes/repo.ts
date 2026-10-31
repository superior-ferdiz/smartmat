import type { BaseUnit, CategoryKey, ExpiryKind, IngredientMatchMode } from '@smartmat/shared';
import type { Db } from '../../db';
import { insertBatchWithEvent, type NewBatch } from '../inventory/repo';
import { isPrismaError } from '../purchases/repo';
import type { ProviderProduct } from '../../providers/barcode/types';

/*
 * Database access for barcode scanning (spec 07, ADR-0014).
 * - products / product_lookup_misses: the global Open Food Facts cache. No household data, so no household id.
 * - household_barcodes: the household's own answers. Every function takes the household id and filters on it.
 */

export interface RememberedBarcode {
  name: string;
  categoryKey: CategoryKey;
  unit: BaseUnit;
  quantityBase: number | null;
  ingredientMatch: IngredientMatchMode;
  ingredientId: string | null;
  locationId: string | null;
  expiryKind: ExpiryKind | null;
  itemId: string | null;
}

export interface ItemSummary {
  id: string;
  name: string;
  unit: BaseUnit;
}

/** What is saved on the item when a new one is created from a scan. */
export interface NewScannedItem {
  name: string;
  categoryKey: CategoryKey;
  unit: BaseUnit;
  ingredientMatch: IngredientMatchMode;
  ingredientId: string | null;
}

export interface ConfirmWrite {
  gtin: string;
  /** false for a store's own code: added to the inventory, but not remembered. */
  remember: boolean;
  dedupeKey: string;
  batch: NewBatch;
  target: { kind: 'newItem'; item: NewScannedItem } | { kind: 'existingItem'; itemId: string };
}

export type ConfirmResult =
  { kind: 'ok'; itemId: string } | { kind: 'duplicate' } | { kind: 'itemGone' };

export interface BarcodeRepo {
  remembered(householdId: string, gtin: string): Promise<RememberedBarcode | null>;
  itemSummary(householdId: string, itemId: string): Promise<ItemSummary | null>;
  cachedProduct(gtin: string): Promise<{ product: ProviderProduct; fetchedAt: Date } | null>;
  missCheckedAt(gtin: string): Promise<Date | null>;
  saveProduct(gtin: string, product: ProviderProduct, fetchedAt: Date): Promise<void>;
  saveMiss(gtin: string, checkedAt: Date): Promise<void>;
  /** The item a batch with this dedupe key was added to (the same confirmation sent before). */
  itemIdByDedupeKey(householdId: string, dedupeKey: string): Promise<string | null>;
  /** Item (or batch), its "add" event and the remembered barcode, in one transaction (FR-SCAN-005). */
  confirm(householdId: string, actorId: string, write: ConfirmWrite): Promise<ConfirmResult>;
}

export function createBarcodeRepo(db: Db): BarcodeRepo {
  return {
    async remembered(householdId, gtin) {
      const row = await db.householdBarcode.findUnique({
        where: { householdId_gtin: { householdId, gtin } },
      });
      if (!row) return null;
      return {
        name: row.name,
        categoryKey: row.categoryKey as CategoryKey,
        unit: row.unit,
        quantityBase: row.quantityBase,
        ingredientMatch: row.ingredientMatch,
        ingredientId: row.ingredientId,
        locationId: row.locationId,
        expiryKind: row.expiryKind,
        itemId: row.itemId,
      };
    },

    itemSummary: (householdId, itemId) =>
      db.inventoryItem.findFirst({
        where: { id: itemId, householdId },
        select: { id: true, name: true, unit: true },
      }),

    async cachedProduct(gtin) {
      const row = await db.product.findUnique({ where: { gtin } });
      if (!row) return null;
      return {
        product: {
          name: row.name,
          brand: row.brand,
          packageQuantityBase: row.packageQuantityBase,
          packageUnit: row.packageUnit,
          categoryKey: row.categoryKey as CategoryKey | null,
        },
        fetchedAt: row.fetchedAt,
      };
    },

    async missCheckedAt(gtin) {
      const row = await db.productLookupMiss.findUnique({ where: { gtin } });
      return row?.checkedAt ?? null;
    },

    async saveProduct(gtin, product, fetchedAt) {
      const data = { ...product, fetchedAt };
      await db.$transaction([
        db.product.upsert({ where: { gtin }, create: { gtin, ...data }, update: data }),
        db.productLookupMiss.deleteMany({ where: { gtin } }),
      ]);
    },

    async saveMiss(gtin, checkedAt) {
      await db.productLookupMiss.upsert({
        where: { gtin },
        create: { gtin, checkedAt },
        update: { checkedAt },
      });
    },

    async itemIdByDedupeKey(householdId, dedupeKey) {
      const row = await db.inventoryBatch.findFirst({
        where: { householdId, dedupeKey },
        select: { itemId: true },
      });
      return row?.itemId ?? null;
    },

    async confirm(householdId, actorId, write) {
      try {
        return await db.$transaction(async (tx) => {
          let item: NewScannedItem & { id: string };
          if (write.target.kind === 'existingItem') {
            const found = await tx.inventoryItem.findFirst({
              where: { id: write.target.itemId, householdId },
              select: {
                id: true,
                name: true,
                categoryKey: true,
                unit: true,
                ingredientMatch: true,
                ingredientId: true,
              },
            });
            if (!found) return { kind: 'itemGone' } as const;
            item = { ...found, categoryKey: found.categoryKey as CategoryKey };
          } else {
            const created = await tx.inventoryItem.create({
              data: { householdId, ...write.target.item },
              select: { id: true },
            });
            item = { id: created.id, ...write.target.item };
          }

          await insertBatchWithEvent(
            tx,
            householdId,
            actorId,
            item.id,
            write.batch,
            null,
            write.dedupeKey,
          );

          if (write.remember) {
            const answers = {
              name: item.name,
              categoryKey: item.categoryKey,
              unit: item.unit,
              quantityBase: write.batch.quantityBase,
              ingredientMatch: item.ingredientMatch,
              ingredientId: item.ingredientId,
              locationId: write.batch.locationId,
              expiryKind: write.batch.expiryKind,
              itemId: item.id,
            };
            await tx.householdBarcode.upsert({
              where: { householdId_gtin: { householdId, gtin: write.gtin } },
              create: { householdId, gtin: write.gtin, ...answers },
              update: answers,
            });
          }
          return { kind: 'ok', itemId: item.id } as const;
        });
      } catch (error) {
        // The same confirmation arrived twice at the same moment: the unique dedupe key stopped the second one.
        if (isPrismaError(error, 'P2002')) return { kind: 'duplicate' };
        throw error;
      }
    },
  };
}
