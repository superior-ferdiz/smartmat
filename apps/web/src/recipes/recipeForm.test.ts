import { describe, expect, it } from 'vitest';
import {
  emptyLine,
  emptyRecipeValues,
  parseRecipeValues,
  recipeFieldIds,
  valuesFromRecipe,
} from './recipeForm';

/* Spec 16 (FR-REC-007/008): the own-recipe form's values ↔ the request body. */

const EGG = '0199f0a0-0000-7000-8000-000000000001';

describe('FR-REC-008 the recipe form', () => {
  it('turns the inputs into the body: numbers, tags, empty unit = none, free text', () => {
    const values = {
      ...emptyRecipeValues(),
      title: 'Omelett',
      servings: '2',
      prepMinutes: '5',
      cookMinutes: '',
      tags: 'frokost, rask, ',
      lines: [
        { ...emptyLine(), ingredientId: EGG, amount: '3', unit: 'stk' as const },
        { ...emptyLine('freeText'), text: 'Gressløk' },
      ],
      steps: [{ key: 's', text: 'Stek.' }],
    };
    const parsed = parseRecipeValues(values);
    // An empty number is "missing", not 0.
    expect(parsed.body).toBeNull();
    expect(parsed.errors).toEqual({ cookMinutes: 'validation.recipe.minutes' });

    const ok = parseRecipeValues({ ...values, cookMinutes: '10' });
    expect(ok.body).toMatchObject({
      servings: 2,
      cookMinutes: 10,
      tags: ['frokost', 'rask'],
      lines: [
        { kind: 'ingredient', ingredientId: EGG, amount: '3', unit: 'stk' },
        { kind: 'freeText', text: 'Gressløk' },
      ],
    });
  });

  it('opens a saved recipe with what was typed, and back again gives the same body', () => {
    const values = valuesFromRecipe({
      id: EGG,
      version: 2,
      title: 'Omelett',
      description: '',
      servings: 2,
      prepMinutes: 5,
      cookMinutes: 10,
      tags: ['frokost'],
      lines: [
        {
          kind: 'ingredient',
          ingredientId: EGG,
          amount: '1,5',
          unit: 'stk',
          text: '',
          optional: true,
        },
        { kind: 'freeText', text: 'Gressløk' },
      ],
      steps: ['Stek.'],
    });
    expect(values.tags).toBe('frokost');
    expect(parseRecipeValues(values).body?.lines).toEqual([
      {
        kind: 'ingredient',
        ingredientId: EGG,
        amount: '1,5',
        unit: 'stk',
        text: '',
        optional: true,
      },
      { kind: 'freeText', text: 'Gressløk' },
    ]);
  });

  it('every field the API can name has an id in the error summary', () => {
    const values = { ...emptyRecipeValues(), lines: [emptyLine(), emptyLine('freeText')] };
    const ids = recipeFieldIds(values);
    expect(ids['lines.0.unit']).toBe('line-0-unit');
    expect(ids['lines.1.text']).toBe('line-1-text');
    expect(ids['steps.0']).toBe('step-0');
  });
});
