import { expiryStatus, type ExpiryKind } from '../quantity/expiry';
import type { BaseUnit } from '../quantity/quantity';
import { linkedIngredientId, linkItem, type AliasIndex, type LinkableItem } from './matching';

/*
 * FR-REC-002 and FR-REC-003 (spec 05). From the household's inventory to "what you have, what is missing,
 * is it enough" per recipe ingredient, and from there to a score that explains itself.
 * Whole numbers only (ADR-0006): conversions round DOWN, so the app rather says too little than too much.
 */

export const LINE_STATUSES = ['enough', 'notEnough', 'unknownAmount', 'missing', 'staple'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];

/** Points per required ingredient for the coverage part (enough = 2, some = 1, missing = 0). */
const COVERAGE_POINTS: Record<Exclude<LineStatus, 'staple'>, number> = {
  enough: 2,
  notEnough: 1,
  unknownAmount: 1,
  missing: 0,
};
/** Bonus per required ingredient that is about to go off, and how many of them count. */
export const EXPIRING_POINTS = 10;
export const EXPIRING_MAX_COUNT = 3;

export interface Conversion {
  unit: BaseUnit;
  unitQty: number;
  baseQty: number;
}

export interface StockIngredient {
  id: string;
  baseUnit: BaseUnit;
  conversions: readonly Conversion[];
}

export interface StockBatch {
  quantityBase: number;
  expiryKind: ExpiryKind | null;
  expiryDate: string | null;
}

export interface StockItem extends LinkableItem {
  unit: BaseUnit;
  batches: readonly StockBatch[];
}

export interface Expiring {
  itemName: string;
  expiryKind: ExpiryKind;
  daysLeft: number;
}

/** What the household has of one ingredient. */
export interface Stock {
  /** Sum in the ingredient's base unit of everything that could be converted. */
  quantityBase: number;
  /** Some of it is in a unit without a conversion: present, but the amount cannot be compared. */
  unconvertible: boolean;
  /** A conversion was used, so the amount is approximate ("ca."). */
  approximate: boolean;
  itemNames: string[];
  /** The most urgent usable batch that is about to go off (today/soon, or best before passed). */
  expiring: Expiring | null;
  /** Items with batches past their use-by date. Never counted (spec 05). */
  excludedUseByItems: string[];
}

/** `quantity` in `unit` → the ingredient's base unit, rounded down; null without a conversion. */
export function convertToBase(
  quantity: number,
  unit: BaseUnit,
  ingredient: StockIngredient,
): { quantityBase: number; approximate: boolean } | null {
  if (unit === ingredient.baseUnit) return { quantityBase: quantity, approximate: false };
  const conversion = ingredient.conversions.find((c) => c.unit === unit);
  if (!conversion) return null;
  // Both factors are at most 100 000 and quantities at most 10^8, so the product stays a safe integer.
  return {
    quantityBase: Math.floor((quantity * conversion.baseQty) / conversion.unitQty),
    approximate: true,
  };
}

function moreUrgent(a: Expiring | null, b: Expiring): Expiring {
  return a === null || b.daysLeft < a.daysLeft ? b : a;
}

/** Ingredient id → what the household has of it. Items that are not linked are left out. */
export function stockByIngredient(
  items: readonly StockItem[],
  index: AliasIndex,
  ingredients: ReadonlyMap<string, StockIngredient>,
  today: string,
): Map<string, Stock> {
  const stock = new Map<string, Stock>();

  for (const item of items) {
    const ingredientId = linkedIngredientId(linkItem(item, index));
    const ingredient = ingredientId ? ingredients.get(ingredientId) : undefined;
    if (!ingredient) continue;

    let usable = 0;
    let expiring: Expiring | null = null;
    let useByPassed = false;
    for (const batch of item.batches) {
      if (batch.quantityBase <= 0) continue;
      const { status, daysLeft } = expiryStatus(batch.expiryDate, today);
      if (status === 'passed' && batch.expiryKind === 'use_by') {
        useByPassed = true;
        continue;
      }
      usable += batch.quantityBase;
      const goingOff =
        status === 'today' ||
        status === 'soon' ||
        (status === 'passed' && batch.expiryKind === 'best_before');
      if (goingOff && batch.expiryKind && daysLeft !== undefined) {
        expiring = moreUrgent(expiring, {
          itemName: item.name,
          expiryKind: batch.expiryKind,
          daysLeft,
        });
      }
    }

    const entry = stock.get(ingredient.id) ?? {
      quantityBase: 0,
      unconvertible: false,
      approximate: false,
      itemNames: [],
      expiring: null,
      excludedUseByItems: [],
    };
    if (useByPassed) entry.excludedUseByItems.push(item.name);
    if (usable > 0) {
      const converted = convertToBase(usable, item.unit, ingredient);
      if (converted) {
        entry.quantityBase += converted.quantityBase;
        entry.approximate ||= converted.approximate;
      } else {
        entry.unconvertible = true;
      }
      entry.itemNames.push(item.name);
      if (expiring) entry.expiring = moreUrgent(entry.expiring, expiring);
    }
    stock.set(ingredient.id, entry);
  }
  // A fixed order for display, whatever order the inventory came in.
  // Two items with the same name (one from the inventory, one from a purchase) are named once.
  for (const entry of stock.values()) {
    entry.itemNames = [...new Set(entry.itemNames)].sort(byNorwegianName);
    entry.excludedUseByItems = [...new Set(entry.excludedUseByItems)].sort(byNorwegianName);
  }
  return stock;
}

const byNorwegianName = (a: string, b: string) => a.localeCompare(b, 'nb');

export interface RecipeLineInput {
  ingredientId: string;
  ingredientName: string;
  isStaple: boolean;
  /** null = no amount ("etter smak"). */
  quantityBase: number | null;
  optional: boolean;
}

export interface LineResult {
  status: LineStatus;
  /** What the household has, in the ingredient's base unit (null when nothing usable). */
  haveBase: number | null;
  /** How much is missing (only for notEnough). */
  missingBase: number | null;
  approximate: boolean;
  itemNames: string[];
  expiring: Expiring | null;
  excludedUseByItems: string[];
}

/** FR-REC-003: have / not enough / missing for one recipe ingredient. */
export function evaluateLine(line: RecipeLineInput, stock: Stock | undefined): LineResult {
  const present = stock !== undefined && stock.itemNames.length > 0;
  const base = {
    haveBase: present ? stock.quantityBase : null,
    missingBase: null,
    approximate: present && stock.approximate,
    itemNames: stock?.itemNames ?? [],
    expiring: present ? stock.expiring : null,
    excludedUseByItems: stock?.excludedUseByItems ?? [],
  };
  if (line.isStaple) return { ...base, status: 'staple' };
  if (!present) return { ...base, status: 'missing' };
  if (line.quantityBase === null || stock.quantityBase >= line.quantityBase)
    return { ...base, status: 'enough' };
  if (stock.unconvertible) return { ...base, status: 'unknownAmount' };
  return { ...base, status: 'notEnough', missingBase: line.quantityBase - stock.quantityBase };
}

export const SCORE_REASON_CODES = ['coverage', 'nothing', 'expiring', 'missing'] as const;

export type ScoreReason =
  | { code: 'coverage'; points: number; enough: number; partial: number; required: number }
  | { code: 'nothing'; points: number }
  | {
      code: 'expiring';
      points: number;
      ingredientName: string;
      itemName: string;
      expiryKind: ExpiryKind;
      daysLeft: number;
    }
  | { code: 'missing'; points: number; names: string[] };

export interface RecipeScore {
  total: number;
  coverage: number;
  expiringBonus: number;
  requiredCount: number;
  enoughCount: number;
  partialCount: number;
  missingCount: number;
  reasons: ScoreReason[];
}

/** FR-REC-002: coverage (0–100) + about-to-go-off bonus (0–30), with one reason per part. */
export function scoreRecipe(lines: readonly RecipeLineInput[], results: readonly LineResult[]) {
  let points = 0;
  let enough = 0;
  let partial = 0;
  const missing: string[] = [];
  const expiring: Extract<ScoreReason, { code: 'expiring' }>[] = [];

  lines.forEach((line, i) => {
    const result = results[i];
    if (!result || line.optional || result.status === 'staple') return;
    points += COVERAGE_POINTS[result.status];
    if (result.status === 'enough') enough++;
    else if (result.status === 'missing') missing.push(line.ingredientName);
    else partial++;
    if (result.status !== 'missing' && result.expiring) {
      expiring.push({
        code: 'expiring',
        points: EXPIRING_POINTS,
        ingredientName: line.ingredientName,
        ...result.expiring,
      });
    }
  });

  const required = enough + partial + missing.length;
  const coverage = required === 0 ? 0 : Math.floor((100 * points) / (2 * required));
  const counted = expiring
    .sort(
      (a, b) => a.daysLeft - b.daysLeft || a.ingredientName.localeCompare(b.ingredientName, 'nb'),
    )
    .slice(0, EXPIRING_MAX_COUNT);
  const expiringBonus = counted.length * EXPIRING_POINTS;

  const reasons: ScoreReason[] = [];
  if (required > 0 && enough + partial > 0)
    reasons.push({ code: 'coverage', points: coverage, enough, partial, required });
  else reasons.push({ code: 'nothing', points: 0 });
  reasons.push(...counted);
  if (missing.length > 0) reasons.push({ code: 'missing', points: 0, names: missing });

  return {
    total: coverage + expiringBonus,
    coverage,
    expiringBonus,
    requiredCount: required,
    enoughCount: enough,
    partialCount: partial,
    missingCount: missing.length,
    reasons,
  } satisfies RecipeScore;
}

/** Highest score first, then fewest missing, then title in Norwegian order. */
export function compareRanked(
  a: { title: string; score: Pick<RecipeScore, 'total' | 'missingCount'> },
  b: { title: string; score: Pick<RecipeScore, 'total' | 'missingCount'> },
): number {
  return (
    b.score.total - a.score.total ||
    a.score.missingCount - b.score.missingCount ||
    a.title.localeCompare(b.title, 'nb')
  );
}
