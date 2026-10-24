import { scaleQuantity, type RecipeLine } from '@smartmat/shared';

/*
 * FR-PLAN-002 on the recipe page (spec 09): the ingredient lines for another number of servings. Amounts
 * are scaled with the shared rule (rounded up), and have/missing is worked out again for the new amount
 * from what the household has. Staples, unknown amounts and "etter smak" keep their status.
 */
export interface ScaledLine extends RecipeLine {
  /** The scaled amount was rounded up ("ca."). */
  rounded: boolean;
}

export function scaleLines(
  lines: readonly RecipeLine[],
  servings: number,
  recipeServings: number,
): ScaledLine[] {
  return lines.map((line) => {
    const scaled = scaleQuantity(line.quantityBase, servings, recipeServings);
    const result: ScaledLine = {
      ...line,
      quantityBase: scaled.quantityBase,
      rounded: scaled.rounded,
    };
    if (scaled.quantityBase === null || servings === recipeServings) return result;
    if (line.status !== 'enough' && line.status !== 'notEnough' && line.status !== 'missing')
      return result;
    const have = line.haveBase ?? 0;
    if (have >= scaled.quantityBase) return { ...result, status: 'enough', missingBase: null };
    if (have > 0)
      return { ...result, status: 'notEnough', missingBase: scaled.quantityBase - have };
    return { ...result, status: 'missing', missingBase: null };
  });
}
