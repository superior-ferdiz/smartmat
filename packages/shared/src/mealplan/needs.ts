import { daysBetween } from '../dates/dates';
import { expiryStatus, type ExpiryKind } from '../quantity/expiry';
import { MAX_QUANTITY_BASE, type BaseUnit } from '../quantity/quantity';
import { linkedIngredientId, linkItem, type AliasIndex } from '../recipes/matching';
import {
  convertToBase,
  type LineStatus,
  type StockIngredient,
  type StockItem,
} from '../recipes/scoring';
import type { SuggestionReason } from '../shopping/list';

/*
 * Spec 09, FR-PLAN-002–004: from a meal plan to what is missing, as pure functions used by the API (the
 * needs, and what to put on the shopping list) and tested on their own. Whole numbers only (ADR-0006).
 */

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

/**
 * FR-PLAN-002: an amount for `servings` portions of a recipe written for `recipeServings`. Rounded UP, so the
 * household does not buy too little; `rounded` says the result is not exact ("ca."). Null ("etter smak")
 * stays null.
 */
export function scaleQuantity(
  quantityBase: number | null,
  servings: number,
  recipeServings: number,
): { quantityBase: number | null; rounded: boolean } {
  if (quantityBase === null) return { quantityBase: null, rounded: false };
  const product = quantityBase * servings;
  const scaled = Math.ceil(product / recipeServings);
  // Quantities are at most 10^8 and servings at most 50, so the product is a safe integer.
  return {
    quantityBase: Math.min(scaled, MAX_QUANTITY_BASE),
    rounded: product % recipeServings !== 0,
  };
}

export interface PlanRecipeLine {
  ingredientId: string;
  quantityBase: number | null;
  optional: boolean;
}

/** One planned recipe in the period. */
export interface PlanEntryInput {
  id: string;
  date: string;
  meal: Meal;
  recipeTitle: string;
  servings: number;
  recipeServings: number;
  lines: readonly PlanRecipeLine[];
}

export interface PlanIngredient extends StockIngredient {
  name: string;
  isStaple: boolean;
}

/** What one entry has already put on the shopping list for one ingredient (FR-PLAN-004). */
export interface PlanContribution {
  entryId: string;
  ingredientId: string;
  /** Null = added without an amount ("buy some"). */
  quantityBase: number | null;
}

/** One entry's need for one ingredient, after the inventory was shared out. */
export interface EntryNeed {
  entryId: string;
  date: string;
  meal: Meal;
  recipeTitle: string;
  /** Scaled amount; null = "etter smak". */
  needBase: number | null;
  rounded: boolean;
  optional: boolean;
  /** What the inventory does not cover for this entry (0 when covered; null for "etter smak"). */
  shortfallBase: number | null;
  /** "Etter smak" with nothing usable in the inventory for that day. */
  unmet: boolean;
  /** Already added to the shopping list from this entry (null when nothing was added). */
  addedBase: number | null;
  added: boolean;
}

export interface IngredientNeed {
  ingredientId: string;
  ingredientName: string;
  baseUnit: BaseUnit;
  isStaple: boolean;
  /** Optional in every entry that uses it. */
  optional: boolean;
  needBase: number;
  /** Some entry uses it without an amount. */
  untilTaste: boolean;
  rounded: boolean;
  /** Inventory shared out to the entries. */
  coveredBase: number;
  missingBase: number;
  /** Present, but in a unit that cannot be converted. */
  unknownAmount: boolean;
  approximate: boolean;
  status: LineStatus;
  /** Already on the shopping list from these entries. */
  onListBase: number;
  /** What is left to add, after what was added before (FR-PLAN-004). Null = some, without an amount. */
  toBuyBase: number | null;
  /** Nothing left to add, because everything missing was added before. */
  alreadyAdded: boolean;
  itemNames: string[];
  excludedUseByItems: string[];
  entries: EntryNeed[];
}

export interface UnplannedExpiring {
  itemId: string;
  itemName: string;
  expiryKind: ExpiryKind;
  expiryDate: string;
  daysLeft: number;
}

interface Supply {
  remaining: number;
  /** Last day the batch may be used (its use-by date), or null when there is no such limit. */
  usableUntil: string | null;
}

interface IngredientStock {
  supplies: Supply[];
  /** Usable batches in a unit without a conversion, with the last day they may be used. */
  unconvertible: (string | null)[];
  approximate: boolean;
  itemNames: Set<string>;
  excludedUseByItems: Set<string>;
}

const MEAL_INDEX: Record<Meal, number> = { breakfast: 0, lunch: 1, dinner: 2 };
const byNorwegianName = (a: string, b: string) => a.localeCompare(b, 'nb');
const usableOn = (until: string | null, date: string) => until === null || until >= date;

export type StockItemWithId = StockItem & { id: string };

/**
 * Every batch the household could cook with, per ingredient, in the ingredient's base unit. Converted batch
 * by batch and rounded down (phase 5 rules); use-by passed today is never counted.
 */
function stockOf(
  items: readonly StockItemWithId[],
  index: AliasIndex,
  ingredients: ReadonlyMap<string, PlanIngredient>,
  today: string,
): Map<string, IngredientStock> {
  const stock = new Map<string, IngredientStock>();
  for (const item of items) {
    const ingredientId = linkedIngredientId(linkItem(item, index));
    const ingredient = ingredientId ? ingredients.get(ingredientId) : undefined;
    if (!ingredient) continue;
    let entry = stock.get(ingredient.id);
    if (!entry) {
      entry = {
        supplies: [],
        unconvertible: [],
        approximate: false,
        itemNames: new Set(),
        excludedUseByItems: new Set(),
      };
      stock.set(ingredient.id, entry);
    }
    for (const batch of item.batches) {
      if (batch.quantityBase <= 0) continue;
      const usableUntil = batch.expiryKind === 'use_by' ? batch.expiryDate : null;
      if (usableUntil !== null && expiryStatus(usableUntil, today).status === 'passed') {
        entry.excludedUseByItems.add(item.name);
        continue;
      }
      entry.itemNames.add(item.name);
      const converted = convertToBase(batch.quantityBase, item.unit, ingredient);
      if (!converted) {
        entry.unconvertible.push(usableUntil);
        continue;
      }
      entry.approximate ||= converted.approximate;
      if (converted.quantityBase > 0)
        entry.supplies.push({ remaining: converted.quantityBase, usableUntil });
    }
  }
  return stock;
}

/**
 * FR-PLAN-003: the plan's needs per ingredient, with the inventory shared out greedily – the earliest meal
 * first, and for each meal the usable batch that goes off first. A batch with a use-by date only counts for
 * meals on or before that date. `contributions` is what entries already put on the shopping list.
 */
export function planNeeds(input: {
  entries: readonly PlanEntryInput[];
  ingredients: ReadonlyMap<string, PlanIngredient>;
  items: readonly StockItemWithId[];
  index: AliasIndex;
  today: string;
  contributions: readonly PlanContribution[];
}): IngredientNeed[] {
  const { ingredients, today } = input;
  const stock = stockOf(input.items, input.index, ingredients, today);
  const added = new Map<string, { quantityBase: number; any: boolean }>();
  for (const c of input.contributions) {
    const key = `${c.entryId}:${c.ingredientId}`;
    const sum = added.get(key) ?? { quantityBase: 0, any: false };
    added.set(key, { quantityBase: sum.quantityBase + (c.quantityBase ?? 0), any: true });
  }

  const entries = [...input.entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      MEAL_INDEX[a.meal] - MEAL_INDEX[b.meal] ||
      a.id.localeCompare(b.id),
  );
  const demands = new Map<string, EntryNeed[]>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!ingredients.has(line.ingredientId)) continue;
      const scaled = scaleQuantity(line.quantityBase, entry.servings, entry.recipeServings);
      const list = demands.get(line.ingredientId) ?? [];
      const contribution = added.get(`${entry.id}:${line.ingredientId}`);
      list.push({
        entryId: entry.id,
        date: entry.date,
        meal: entry.meal,
        recipeTitle: entry.recipeTitle,
        needBase: scaled.quantityBase,
        rounded: scaled.rounded,
        optional: line.optional,
        shortfallBase: null,
        unmet: false,
        addedBase: contribution ? contribution.quantityBase : null,
        added: contribution?.any ?? false,
      });
      demands.set(line.ingredientId, list);
    }
  }

  const needs: IngredientNeed[] = [];
  for (const [ingredientId, list] of demands) {
    const ingredient = ingredients.get(ingredientId);
    if (!ingredient) continue;
    const have = stock.get(ingredientId);
    const supplies = (have?.supplies ?? []).map((s) => ({ ...s }));
    const presentOn = (date: string) =>
      supplies.some((s) => s.remaining > 0 && usableOn(s.usableUntil, date)) ||
      (have?.unconvertible ?? []).some((until) => usableOn(until, date));

    let covered = 0;
    let unknownAmount = false;
    for (const demand of list) {
      if (demand.needBase === null) {
        demand.unmet = !presentOn(demand.date);
        continue;
      }
      let left = demand.needBase;
      const usable = supplies
        .filter((s) => s.remaining > 0 && usableOn(s.usableUntil, demand.date))
        // The batch that must be used first goes first; batches without a limit last.
        .sort((a, b) =>
          (a.usableUntil ?? '9999-12-31').localeCompare(b.usableUntil ?? '9999-12-31'),
        );
      for (const supply of usable) {
        if (left === 0) break;
        const take = Math.min(left, supply.remaining);
        supply.remaining -= take;
        left -= take;
      }
      covered += demand.needBase - left;
      demand.shortfallBase = left;
      if (left > 0 && (have?.unconvertible ?? []).some((until) => usableOn(until, demand.date)))
        unknownAmount = true;
    }

    const needBase = list.reduce((sum, d) => sum + (d.needBase ?? 0), 0);
    const missingBase = list.reduce((sum, d) => sum + (d.shortfallBase ?? 0), 0);
    const unmet = list.some((d) => d.unmet);
    const onListBase = list.reduce((sum, d) => sum + (d.addedBase ?? 0), 0);
    const toBuy = list.reduce((sum, d) => sum + entryDelta(d), 0);
    // "Etter smak" that is not in the house and was never added: buy some, without an amount.
    const someWithoutAmount = list.some((d) => d.needBase === null && d.unmet && !d.added);

    let status: LineStatus;
    if (ingredient.isStaple) status = 'staple';
    else if (missingBase === 0 && !unmet) status = 'enough';
    else if (unknownAmount) status = 'unknownAmount';
    // Batches that cannot be used on the planned days do not make it "some".
    else if (covered > 0) status = 'notEnough';
    else status = 'missing';

    needs.push({
      ingredientId,
      ingredientName: ingredient.name,
      baseUnit: ingredient.baseUnit,
      isStaple: ingredient.isStaple,
      optional: list.every((d) => d.optional),
      needBase,
      untilTaste: list.some((d) => d.needBase === null),
      rounded: list.some((d) => d.rounded),
      coveredBase: covered,
      missingBase,
      unknownAmount,
      approximate: have?.approximate ?? false,
      status,
      onListBase,
      toBuyBase: toBuy > 0 ? toBuy : someWithoutAmount ? null : 0,
      alreadyAdded: toBuy === 0 && !someWithoutAmount && list.some((d) => d.added),
      itemNames: [...(have?.itemNames ?? [])].sort(byNorwegianName),
      excludedUseByItems: [...(have?.excludedUseByItems ?? [])].sort(byNorwegianName),
      entries: list,
    });
  }
  return needs.sort((a, b) => byNorwegianName(a.ingredientName, b.ingredientName));
}

/**
 * FR-PLAN-004: how much more one entry needs on the list – what the inventory does not cover, minus what the
 * entry already added. Never negative: a smaller need does not take anything off the list.
 */
export function entryDelta(need: Pick<EntryNeed, 'shortfallBase' | 'addedBase'>): number {
  return Math.max(0, (need.shortfallBase ?? 0) - (need.addedBase ?? 0));
}

export interface PlanSuggestion {
  ingredientId: string;
  ingredientName: string;
  quantityBase: number | null;
  baseUnit: BaseUnit;
  reason: SuggestionReason;
  selected: boolean;
}

/**
 * FR-PLAN-004: one suggestion per ingredient that is not covered, ticked by the same rules as a recipe's
 * (spec 06): what is missing or too little is ticked; staples, optional ingredients, unknown amounts and what
 * the plan already added are shown unticked.
 */
export function suggestFromPlan(needs: readonly IngredientNeed[]): PlanSuggestion[] {
  const suggestions: PlanSuggestion[] = [];
  for (const need of needs) {
    // Covered by the inventory: nothing to buy.
    if (need.status === 'enough') continue;
    let reason: SuggestionReason;
    if (need.alreadyAdded) reason = 'onList';
    else if (need.status === 'staple') reason = 'staple';
    else if (need.optional) reason = 'optional';
    else reason = need.status;
    suggestions.push({
      ingredientId: need.ingredientId,
      ingredientName: need.ingredientName,
      // Unknown amount: some is there, so the user decides how much (spec 06).
      quantityBase: reason === 'onList' || reason === 'unknownAmount' ? null : need.toBuyBase,
      baseUnit: need.baseUnit,
      reason,
      selected: reason === 'missing' || reason === 'notEnough',
    });
  }
  return suggestions;
}

/**
 * FR-PLAN-003 / FR-INV-005: batches that go off in the period (today to `to`) and that no planned recipe
 * uses, most urgent first. Use-by passed is not listed: it is never food to plan with.
 */
export function unplannedExpiring(input: {
  items: readonly StockItemWithId[];
  index: AliasIndex;
  plannedIngredientIds: ReadonlySet<string>;
  today: string;
  to: string;
  limit: number;
}): UnplannedExpiring[] {
  const found: UnplannedExpiring[] = [];
  for (const item of input.items) {
    const ingredientId = linkedIngredientId(linkItem(item, input.index));
    if (ingredientId && input.plannedIngredientIds.has(ingredientId)) continue;
    for (const batch of item.batches) {
      if (batch.quantityBase <= 0 || !batch.expiryKind || !batch.expiryDate) continue;
      if (batch.expiryDate < input.today || batch.expiryDate > input.to) continue;
      found.push({
        itemId: item.id,
        itemName: item.name,
        expiryKind: batch.expiryKind,
        expiryDate: batch.expiryDate,
        daysLeft: daysBetween(input.today, batch.expiryDate),
      });
    }
  }
  // One line per item: its most urgent batch.
  const perItem = new Map<string, UnplannedExpiring>();
  for (const f of found.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))) {
    if (!perItem.has(f.itemId)) perItem.set(f.itemId, f);
  }
  return [...perItem.values()]
    .sort((a, b) => a.daysLeft - b.daysLeft || byNorwegianName(a.itemName, b.itemName))
    .slice(0, input.limit);
}
