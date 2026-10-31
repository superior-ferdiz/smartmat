import {
  buildAliasIndex,
  cheapestFresh,
  estimateLine,
  isFreshObservation,
  isOldOwnPrice,
  isStalePrice,
  isUncollectedChain,
  linkedIngredientId,
  linkItem,
  osloDate,
  summarizeEstimates,
  unitPriceOre,
  type BarcodePricesResponse,
  type ExternalPriceCandidate,
  type ExternalPrices,
  type ItemPricesResponse,
  type MatchableIngredient,
  type OwnPriceCandidate,
  type OwnPriceEntry,
  type OwnPrices,
  type PriceObservation,
  type RecipePriceEstimate,
  type RecipePriceLine,
  type ShoppingPriceEstimateResponse,
  type BaseUnit,
  type LineEstimate,
} from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { notFound } from '../../lib/errors';
import type { WindowLimiter } from '../../lib/windowLimiter';
import type { UnavailableReason } from '../../providers/barcode/types';
import type { PriceLookupResult, PriceProvider } from '../../providers/prices/types';
import type { ParsedGtin } from '../barcodes/service';
import type { RecipeRepo } from '../recipes/repo';
import type { PriceItem, PriceRepo, PricedBatch, StoredObservation } from './repo';

const HOUR = 60 * 60_000;
/** Spec 12: Kassalapp recommends caching for six hours (prices change once a day). */
export const PRICE_CACHE_MS = 6 * HOUR;
/** Spec 12: what has not been fetched for 30 days is deleted by the worker, and never shown. */
export const PRICE_KEEP_MS = 30 * 24 * HOUR;
/** FR-PRICE-002: the newest own prices shown. */
export const OWN_PRICE_LIMIT = 10;

export interface PriceServiceDeps {
  repo: PriceRepo;
  provider: PriceProvider;
  /** The ingredient catalogue, to link shopping lines to items with the rules from phase 5. */
  ingredients: {
    catalog(): Promise<(MatchableIngredient & { baseUnit: BaseUnit; isStaple: boolean })[]>;
  };
  /** Spec 16 (FR-PRICE-007): the recipes the household can see – global and its own, never another's. */
  recipes: Pick<RecipeRepo, 'recipe'>;
  /** External lookups per logged-in user (spec 12: 30 per minute). */
  userLimiter: WindowLimiter;
  now: Clock;
}

const NOT_ASKED: ExternalPrices = {
  status: 'notAsked',
  fetchedAt: null,
  observations: [],
  cheapest: null,
  freshCount: 0,
};

/** The date shown for an own price: the purchase date, otherwise the day the batch was added. */
function batchDate(batch: PricedBatch): string {
  return batch.purchasedOn ?? osloDate(batch.createdAt);
}

function newestFirst(a: PricedBatch, b: PricedBatch) {
  const byDate = batchDate(b).localeCompare(batchDate(a));
  return byDate !== 0 ? byDate : b.createdAt.getTime() - a.createdAt.getTime();
}

/** What the estimator needs of a line: a shopping list line or a recipe line. */
interface EstimatedLine {
  ingredientId: string | null;
  text: string;
  quantityBase: number | null;
  unit: BaseUnit | null;
}

/** Lower-case and single spaces, for matching a shopping line to an item with exactly the same name. */
function sameName(text: string) {
  return text.normalize('NFC').toLocaleLowerCase('nb').replace(/\s+/g, ' ').trim();
}

/**
 * Prices (spec 12, ADR-0020). Own prices are read from the household's batches on every request; external prices
 * come from the provider through a six-hour cache. The two are always kept apart, and neither ever writes to
 * purchases, batches, the budget or the waste figures (FR-PRICE-005, ADR-0007).
 */
export class PriceService {
  /** Lookups in progress per barcode: requests at the same moment share one call to the provider. */
  private readonly inFlight = new Map<string, Promise<PriceLookupResult>>();

  constructor(private readonly deps: PriceServiceDeps) {}

  /** FR-PRICE-001/-002/-004: the scan page. */
  async forBarcode(
    householdId: string,
    userId: string,
    { gtin, storeCode }: ParsedGtin,
  ): Promise<{ response: BarcodePricesResponse; unavailable: UnavailableReason | null }> {
    const item = storeCode ? null : await this.deps.repo.rememberedItem(householdId, gtin);
    const [own, external] = await Promise.all([
      this.own(householdId, item),
      storeCode
        ? Promise.resolve({ prices: NOT_ASKED, unavailable: null })
        : this.external(gtin, userId),
    ]);
    return {
      response: { gtin, storeCode, own, external: external.prices },
      unavailable: external.unavailable,
    };
  }

  /** FR-PRICE-002: the item page. Kari's item id with Ola's household is a 404 (NFR-SEC-001). */
  async forItem(
    householdId: string,
    userId: string,
    itemId: string,
  ): Promise<{ response: ItemPricesResponse; unavailable: UnavailableReason | null }> {
    const { repo } = this.deps;
    const item = await repo.item(householdId, itemId);
    if (!item) throw notFound();
    const gtin = await repo.gtinForItem(householdId, itemId);
    const [own, external] = await Promise.all([
      this.own(householdId, item),
      gtin
        ? this.external(gtin, userId)
        : Promise.resolve({ prices: NOT_ASKED, unavailable: null }),
    ]);
    return {
      response: { own, gtin, external: external.prices },
      unavailable: external.unavailable,
    };
  }

  /**
   * FR-PRICE-003: an estimate per open line – own price first, then fresh Kassalapp prices already stored. Never asks
   * Kassalapp: a list of 40 lines must not use 40 of the 60 calls a minute.
   */
  async shoppingEstimate(householdId: string): Promise<ShoppingPriceEstimateResponse> {
    const lines = await this.deps.repo.openShoppingLines(householdId);
    const estimate = await this.estimator(householdId);
    const estimates = lines.map((line) => ({ shoppingItemId: line.id, ...estimate(line) }));
    return { lines: estimates, summary: summarizeEstimates(estimates) };
  }

  /**
   * FR-PRICE-007 (spec 16): an estimate per ingredient line of a recipe, with the same rules as the shopping list.
   * Free text, staples and lines without an amount are skipped and counted apart; nothing is called at Kassalapp.
   */
  async recipeEstimate(householdId: string, recipeId: string): Promise<RecipePriceEstimate> {
    const recipe = await this.deps.recipes.recipe(householdId, recipeId);
    if (!recipe) throw notFound();
    const [estimate, catalog] = await Promise.all([
      this.estimator(householdId),
      this.deps.ingredients.catalog(),
    ]);
    const byId = new Map(catalog.map((i) => [i.id, i]));
    const skipped = (position: number, text: string, reason: RecipePriceLine['skipped']) => ({
      position,
      text,
      estimateOre: null,
      source: null,
      basis: null,
      date: null,
      missing: null,
      skipped: reason,
    });
    const lines: RecipePriceLine[] = [
      ...recipe.lines.map((line) => {
        const ingredient = byId.get(line.ingredientId);
        if (!ingredient || ingredient.isStaple)
          return skipped(line.position, line.displayText, 'staple');
        if (line.quantityBase === null) return skipped(line.position, line.displayText, 'noAmount');
        return {
          position: line.position,
          text: line.displayText,
          skipped: null,
          ...estimate({
            ingredientId: line.ingredientId,
            text: ingredient.name,
            quantityBase: line.quantityBase,
            unit: ingredient.baseUnit,
          }),
        };
      }),
      ...recipe.freeTextLines.map((line) => skipped(line.position, line.displayText, 'freeText')),
    ].sort((a, b) => a.position - b.position);
    const tried = lines.filter((l) => l.skipped === null) as (RecipePriceLine & LineEstimate)[];
    const summary = summarizeEstimates(tried);
    return {
      externalEnabled: this.deps.provider.enabled,
      lines,
      summary: {
        pricedLines: summary.openLines,
        estimatedLines: summary.estimatedLines,
        missingLines: summary.missingLines,
        skippedLines: lines.length - tried.length,
        estimatedOre: summary.estimatedOre,
        fromOwn: summary.fromOwn,
        fromKassalapp: summary.fromKassalapp,
      },
    };
  }

  /**
   * Reads the household's items, priced batches and stored fresh observations once, and gives a function that
   * estimates one line (own price first, then Kassalapp). Never calls the provider.
   */
  private async estimator(householdId: string) {
    const { repo, provider } = this.deps;
    const [items, batches, barcodes, catalog] = await Promise.all([
      repo.items(householdId),
      repo.pricedBatches(householdId),
      provider.enabled
        ? repo.barcodesByItem(householdId)
        : Promise.resolve(new Map<string, string[]>()),
      this.deps.ingredients.catalog(),
    ]);
    const now = this.deps.now();
    const index = buildAliasIndex(catalog);
    const ingredientOf = new Map(items.map((i) => [i.id, linkedIngredientId(linkItem(i, index))]));
    const newestBatch = new Map<string, PricedBatch>();
    for (const batch of [...batches].sort(newestFirst)) {
      if (!newestBatch.has(batch.itemId)) newestBatch.set(batch.itemId, batch);
    }
    const stored = await repo.observations(provider.source, [
      ...new Set([...barcodes.values()].flat()),
    ]);
    const freshByGtin = new Map<string, StoredObservation[]>();
    for (const o of stored) {
      if (!isFreshObservation(o, now)) continue;
      freshByGtin.set(o.gtin, [...(freshByGtin.get(o.gtin) ?? []), o]);
    }

    const matchItems = (line: EstimatedLine): PriceItem[] =>
      line.ingredientId
        ? items.filter((i) => ingredientOf.get(i.id) === line.ingredientId)
        : items.filter((i) => sameName(i.name) === sameName(line.text));

    return (line: EstimatedLine): LineEstimate => {
      const matched = matchItems(line);
      const ownBatch = matched
        .map((i) => newestBatch.get(i.id))
        .filter((b): b is PricedBatch => b !== undefined)
        .sort(newestFirst)[0];
      const own: OwnPriceCandidate | null = ownBatch
        ? {
            priceOre: ownBatch.priceOre,
            quantityBase: ownBatch.quantityBase,
            unit: ownBatch.unit,
            date: batchDate(ownBatch),
          }
        : null;
      const external: ExternalPriceCandidate[] = matched
        .flatMap((i) => barcodes.get(i.id) ?? [])
        .flatMap((gtin) => freshByGtin.get(gtin) ?? [])
        .map((o) => ({
          priceOre: o.priceOre,
          packageQuantityBase: o.packageQuantityBase,
          packageUnit: o.packageUnit,
          date: osloDate(o.observedAt),
        }));
      return estimateLine(line, matched.length > 0, own, external);
    };
  }

  private async own(
    householdId: string,
    item: { id: string; name: string } | null,
  ): Promise<OwnPrices> {
    if (!item) return { item: null, entries: [] };
    const today = osloDate(this.deps.now());
    const batches = await this.deps.repo.pricedBatches(householdId, [item.id]);
    const entries: OwnPriceEntry[] = [...batches]
      .sort(newestFirst)
      .slice(0, OWN_PRICE_LIMIT)
      .map((batch) => {
        const date = batchDate(batch);
        return {
          batchId: batch.batchId,
          priceOre: batch.priceOre,
          quantityBase: batch.quantityBase,
          unit: batch.unit,
          unitPrice: unitPriceOre(batch.priceOre, batch.quantityBase, batch.unit),
          date,
          old: isOldOwnPrice(date, today),
          origin: batch.purchaseId ? 'purchase' : 'item',
          storeName: batch.storeName,
          purchaseId: batch.purchaseId,
        };
      });
    return { item: { id: item.id, name: item.name }, entries };
  }

  /**
   * Cache (6 hours) → per-user limit → provider. When the provider does not answer, what is stored from the last 30
   * days is shown with its date (status "unavailable"). Errors are never stored.
   */
  private async external(
    gtin: string,
    userId: string,
  ): Promise<{ prices: ExternalPrices; unavailable: UnavailableReason | null }> {
    const { repo, provider } = this.deps;
    if (!provider.enabled) return { prices: { ...NOT_ASKED, status: 'off' }, unavailable: null };
    const time = this.deps.now();
    const cached = await repo.lookup(provider.source, gtin);
    const age = cached ? time.getTime() - cached.fetchedAt.getTime() : Number.POSITIVE_INFINITY;

    if (cached && age < PRICE_CACHE_MS) {
      return {
        prices: await this.stored(gtin, cached.found ? 'found' : 'notFound', cached.fetchedAt),
        unavailable: null,
      };
    }
    const fallback = async (reason: UnavailableReason) => ({
      prices:
        cached && age < PRICE_KEEP_MS
          ? await this.stored(gtin, 'unavailable', cached.fetchedAt)
          : { ...NOT_ASKED, status: 'unavailable' as const },
      unavailable: reason,
    });

    // Over the user's limit: external prices are "unavailable", but the own prices are still shown (no 429).
    if (!this.deps.userLimiter.take(userId)) return fallback('rateLimited');

    const result = await this.lookupOnce(gtin);
    if (result.status === 'found') {
      await repo.saveFound(provider.source, gtin, result.observations, time);
      return { prices: await this.stored(gtin, 'found', time), unavailable: null };
    }
    if (result.status === 'notFound') {
      await repo.saveNotFound(provider.source, gtin, time);
      return { prices: await this.stored(gtin, 'notFound', time), unavailable: null };
    }
    return fallback(result.reason);
  }

  private lookupOnce(gtin: string): Promise<PriceLookupResult> {
    const running = this.inFlight.get(gtin);
    if (running) return running;
    const lookup = this.deps.provider.lookup(gtin).finally(() => this.inFlight.delete(gtin));
    this.inFlight.set(gtin, lookup);
    return lookup;
  }

  private async stored(
    gtin: string,
    status: ExternalPrices['status'],
    fetchedAt: Date,
  ): Promise<ExternalPrices> {
    const now = this.deps.now();
    const rows =
      status === 'notFound'
        ? []
        : await this.deps.repo.observations(this.deps.provider.source, [gtin]);
    const observations: PriceObservation[] = rows.map((o) => {
      const stale = isStalePrice(o.observedAt, now);
      const uncollected = isUncollectedChain(o.chainCode);
      return {
        source: o.source,
        chainCode: o.chainCode,
        chainName: o.chainName,
        priceOre: o.priceOre,
        packageQuantityBase: o.packageQuantityBase,
        packageUnit: o.packageUnit,
        unitPrice: unitPriceOre(o.priceOre, o.packageQuantityBase, o.packageUnit),
        observedAt: o.observedAt.toISOString(),
        stale,
        uncollected,
        fresh: !stale && !uncollected,
        sourceUrl: o.sourceUrl,
      };
    });
    // Fresh prices first, cheapest first; then the rest, newest first.
    observations.sort((a, b) => {
      if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
      if (a.fresh) return a.priceOre - b.priceOre || a.chainName.localeCompare(b.chainName, 'nb');
      return b.observedAt.localeCompare(a.observedAt);
    });
    return {
      status,
      fetchedAt: fetchedAt.toISOString(),
      observations,
      cheapest: cheapestFresh(observations),
      freshCount: observations.filter((o) => o.fresh).length,
    };
  }
}
