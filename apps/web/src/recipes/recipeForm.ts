import {
  createHouseholdRecipeSchema,
  type CreateHouseholdRecipeBody,
  type HouseholdRecipeEdit,
  type SeedUnit,
} from '@smartmat/shared';
import { fieldErrorsFromZod, type FieldErrors } from '../forms/fieldErrors';

/*
 * Spec 16 (FR-REC-007/008): the form for a household's own recipe. The values are what the inputs hold
 * (strings); parsing goes through the shared schema, and the API checks everything again. Error keys use the
 * API's field names (`lines.0.amount`), so server errors land on the same fields.
 */

export interface RecipeLineValues {
  /** Stable React key: lines can be removed from the middle. */
  key: string;
  kind: 'ingredient' | 'freeText';
  ingredientId: string;
  amount: string;
  unit: SeedUnit | '';
  text: string;
  optional: boolean;
}

export interface RecipeFormValues {
  title: string;
  description: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  /** Comma-separated, as typed. */
  tags: string;
  lines: RecipeLineValues[];
  steps: { key: string; text: string }[];
}

let next = 0;
const newKey = () => `k${++next}`;

export function emptyLine(kind: RecipeLineValues['kind'] = 'ingredient'): RecipeLineValues {
  return { key: newKey(), kind, ingredientId: '', amount: '', unit: '', text: '', optional: false };
}

export const emptyStep = () => ({ key: newKey(), text: '' });

export function emptyRecipeValues(): RecipeFormValues {
  return {
    title: '',
    description: '',
    servings: '4',
    prepMinutes: '0',
    cookMinutes: '0',
    tags: '',
    lines: [emptyLine()],
    steps: [emptyStep()],
  };
}

/** The edit form, from what the API saved (what the user typed is kept: amount and unit). */
export function valuesFromRecipe(recipe: HouseholdRecipeEdit): RecipeFormValues {
  return {
    title: recipe.title,
    description: recipe.description,
    servings: String(recipe.servings),
    prepMinutes: String(recipe.prepMinutes),
    cookMinutes: String(recipe.cookMinutes),
    tags: recipe.tags.join(', '),
    lines: recipe.lines.map((line) =>
      line.kind === 'freeText'
        ? { ...emptyLine('freeText'), text: line.text }
        : {
            ...emptyLine(),
            ingredientId: line.ingredientId,
            amount: line.amount ?? '',
            unit: line.unit ?? '',
            text: line.text,
            optional: line.optional,
          },
    ),
    steps: recipe.steps.map((text) => ({ key: newKey(), text })),
  };
}

/** "" → NaN, so the schema says the number is missing instead of taking 0. */
const toNumber = (value: string) =>
  value.trim() === '' ? Number.NaN : Number(value.replace(',', '.'));

export function parseRecipeValues(
  values: RecipeFormValues,
): { body: CreateHouseholdRecipeBody; errors: FieldErrors } | { body: null; errors: FieldErrors } {
  const parsed = createHouseholdRecipeSchema.safeParse({
    title: values.title,
    description: values.description,
    servings: toNumber(values.servings),
    prepMinutes: toNumber(values.prepMinutes),
    cookMinutes: toNumber(values.cookMinutes),
    tags: values.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    lines: values.lines.map((line) =>
      line.kind === 'freeText'
        ? { kind: 'freeText', text: line.text }
        : {
            kind: 'ingredient',
            ingredientId: line.ingredientId,
            amount: line.amount,
            unit: line.unit === '' ? null : line.unit,
            text: line.text,
            optional: line.optional,
          },
    ),
    steps: values.steps.map((step) => step.text),
  });
  if (!parsed.success) return { body: null, errors: fieldErrorsFromZod(parsed.error) };
  return { body: parsed.data, errors: {} };
}

/** Field ids in form order, for the error summary. */
export function recipeFieldIds(values: RecipeFormValues): Record<string, string> {
  const ids: Record<string, string> = {
    title: 'recipe-title',
    description: 'recipe-description',
    servings: 'recipe-servings',
    prepMinutes: 'recipe-prep',
    cookMinutes: 'recipe-cook',
    tags: 'recipe-tags',
    lines: 'recipe-lines',
  };
  values.lines.forEach((line, i) => {
    const p = `lines.${i}`;
    if (line.kind === 'freeText') {
      ids[`${p}.text`] = `line-${i}-text`;
      return;
    }
    ids[`${p}.ingredientId`] = `line-${i}-ingredient`;
    ids[`${p}.amount`] = `line-${i}-amount`;
    ids[`${p}.unit`] = `line-${i}-unit`;
    ids[`${p}.text`] = `line-${i}-text`;
  });
  ids.steps = 'recipe-steps';
  values.steps.forEach((_step, i) => {
    ids[`steps.${i}`] = `step-${i}`;
  });
  return ids;
}
