import { z } from 'zod';
import { BASE_UNITS, MAX_QUANTITY_BASE, type BaseUnit } from '../quantity/quantity';
import { CATEGORY_KEYS } from '../schemas/inventory';
import { ALLERGENS } from './allergens';
import { normalizeAlias } from './matching';

/*
 * The seed files in prisma/seed/ (spec 05, ADR-0009): ingredients.json and one JSON file per recipe.
 * The team writes the recipes; `npm run db:seed` validates everything here before it touches the database,
 * and a unit test runs the same check on every file in the repo.
 *
 * Messages are in Norwegian: they are read by the people who write the files, not shown in the app.
 */

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CONVERSION_MAX = 100_000;

/** Units a recipe may use, and how many base units (g/ml/stk) one of them is. ss/ts/krm are Norwegian spoon measures. */
export const SEED_UNITS = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  dl: { base: 'ml', factor: 100 },
  l: { base: 'ml', factor: 1000 },
  ss: { base: 'ml', factor: 15 },
  ts: { base: 'ml', factor: 5 },
  krm: { base: 'ml', factor: 1 },
  stk: { base: 'stk', factor: 1 },
} as const satisfies Record<string, { base: BaseUnit; factor: number }>;
export const SEED_UNIT_KEYS = Object.keys(SEED_UNITS) as (keyof typeof SEED_UNITS)[];
export type SeedUnit = keyof typeof SEED_UNITS;

const text = (max: number) => z.string().trim().min(1).max(max);

export const conversionSeedSchema = z.object({
  unit: z.enum(BASE_UNITS),
  unitQty: z.number().int().min(1).max(CONVERSION_MAX),
  baseQty: z.number().int().min(1).max(CONVERSION_MAX),
  /** Where the figure comes from, or that it is an estimate. Shown nowhere in the app. */
  note: z.string().max(200).optional(),
});

export const ingredientSeedSchema = z.object({
  key: z.string().regex(KEY).max(64),
  name: text(60),
  baseUnit: z.enum(BASE_UNITS),
  isStaple: z.boolean().default(false),
  category: z.enum(CATEGORY_KEYS).optional(),
  aliases: z.array(text(60)).max(30).default([]),
  /** Required, also when empty: an empty list is a statement that none is registered, not a forgotten field. */
  allergens: z.array(z.enum(ALLERGENS)),
  conversions: z.array(conversionSeedSchema).max(3).default([]),
});
export type IngredientSeed = z.output<typeof ingredientSeedSchema>;

export const ingredientsFileSchema = z.object({
  meta: z.object({
    /** Who made the list and how (ADR-0009: authorship is recorded for real). */
    writtenBy: text(200),
    /** Who has checked allergens and conversions. Empty until someone has. */
    reviewedBy: z.array(text(100)),
    note: z.string().max(1000).optional(),
  }),
  ingredients: z.array(ingredientSeedSchema).min(1).max(2000),
});
export type IngredientsFile = z.output<typeof ingredientsFileSchema>;

export const recipeIngredientSeedSchema = z
  .object({
    ingredient: z.string().regex(KEY),
    /** "2", "1,5", "1/2". Leave out together with unit for "etter smak". */
    amount: z.string().trim().min(1).max(12).optional(),
    unit: z.enum(SEED_UNIT_KEYS as [SeedUnit, ...SeedUnit[]]).optional(),
    /** What the recipe shows ("2 dl lettmelk"). */
    text: text(120),
    optional: z.boolean().default(false),
  })
  .refine((line) => (line.amount === undefined) === (line.unit === undefined), {
    message: 'amount og unit må stå sammen (eller begge mangle)',
  });

/** `external` = from an openly licensed source (ADR-0016, spec 09); `test` = fictional, test databases only. */
export const RECIPE_SEED_SOURCES = ['team', 'external', 'test'] as const;
export type RecipeSource = (typeof RECIPE_SEED_SOURCES)[number];

/** ADR-0016: the only licences an external recipe may have (SPDX ids). */
export const RECIPE_LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'public-domain'] as const;
export type RecipeLicense = (typeof RECIPE_LICENSES)[number];

/** How much the recipe differs from the original: not at all, only translated, or also changed. */
export const RECIPE_ADAPTATIONS = ['none', 'translated', 'adapted'] as const;
export type RecipeAdaptation = (typeof RECIPE_ADAPTATIONS)[number];

const isoDate = z.iso.date();

export const recipeSeedSchema = z
  .object({
    slug: z.string().regex(KEY).max(80),
    title: text(120),
    description: text(500),
    servings: z.number().int().min(1).max(50),
    prepMinutes: z.number().int().min(0).max(1440),
    cookMinutes: z.number().int().min(0).max(1440),
    tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
    source: z.enum(RECIPE_SEED_SOURCES),
    license: text(50),
    /** ADR-0009: the people who really wrote it. For an external recipe: the original's authors. */
    authors: z.array(text(100)).min(1).max(10),
    /** ADR-0016, required for `external`: the original, when it was fetched, and what was done to it. */
    sourceTitle: text(200).optional(),
    sourceUrl: z
      .url({ protocol: /^https$/ })
      .max(500)
      .optional(),
    retrievedOn: isoDate.optional(),
    adaptation: z.enum(RECIPE_ADAPTATIONS).optional(),
    /** What was changed, in Norwegian. Required when `adaptation` is `adapted`. */
    adaptationNote: text(1000).optional(),
    aiAssisted: z.boolean().optional(),
    /** The team members who have checked the recipe (spec 09, decision 6). Empty = an AI draft. */
    reviewedBy: z.array(text(100)).max(10).default([]),
    reviewedOn: isoDate.optional(),
    ingredients: z.array(recipeIngredientSeedSchema).min(1).max(50),
    steps: z.array(text(1000)).min(1).max(30),
  })
  .superRefine((recipe, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (recipe.reviewedBy.length > 0 !== (recipe.reviewedOn !== undefined))
      issue('reviewedOn', 'reviewedOn står når, og bare når, reviewedBy har navn');
    if (recipe.source !== 'external') return;
    for (const field of [
      'sourceTitle',
      'sourceUrl',
      'retrievedOn',
      'adaptation',
      'aiAssisted',
    ] as const)
      if (recipe[field] === undefined) issue(field, `${field} er påkrevd for eksterne oppskrifter`);
    if (!(RECIPE_LICENSES as readonly string[]).includes(recipe.license))
      issue('license', `lisensen må være én av ${RECIPE_LICENSES.join(', ')} (ADR-0016)`);
    if (recipe.adaptation === 'adapted' && recipe.adaptationNote === undefined)
      issue('adaptationNote', 'adaptationNote må si hva som er endret');
  });
export type RecipeSeed = z.output<typeof recipeSeedSchema>;

/** The checked data the seed script writes: aliases normalised (name included), quantities in base units. */
export interface ResolvedSeed {
  ingredients: (Omit<IngredientSeed, 'aliases'> & { aliases: string[] })[];
  recipes: (Omit<RecipeSeed, 'ingredients'> & {
    ingredients: {
      ingredientKey: string;
      quantityBase: number | null;
      displayText: string;
      optional: boolean;
    }[];
  })[];
}

export type SeedCheck = { ok: true; data: ResolvedSeed } | { ok: false; errors: string[] };

/** What converting a recipe amount needs to know about the ingredient. */
/** Read-only, so the API can pass its own catalog rows (spec 16) as well as seed rows. */
type SeedIngredientUnits = Pick<IngredientSeed, 'baseUnit'> & {
  conversions: readonly Pick<
    IngredientSeed['conversions'][number],
    'unit' | 'unitQty' | 'baseQty'
  >[];
};

/** "2" → 2/1, "1,5" → 15/10, "1/2" → 1/2. Null if it is not a positive number. */
export function parseSeedAmount(amount: string): { num: number; den: number } | null {
  const fraction = /^(\d{1,6})\/(\d{1,6})$/.exec(amount);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    return num > 0 && den > 0 ? { num, den } : null;
  }
  const decimal = /^(\d{1,7})(?:[,.](\d{1,4}))?$/.exec(amount);
  if (!decimal) return null;
  const decimals = decimal[2] ?? '';
  const num = Number(`${decimal[1]}${decimals}`);
  return num > 0 ? { num, den: 10 ** decimals.length } : null;
}

/** The amount in the ingredient's base unit, rounded to a whole number (spoon measures are approximate anyway). */
export function seedQuantityBase(
  amount: string,
  unit: SeedUnit,
  ingredient: SeedIngredientUnits,
): number | string {
  const parsed = parseSeedAmount(amount);
  if (!parsed) return `mengden «${amount}» er ikke et positivt tall`;
  const { base, factor } = SEED_UNITS[unit];
  if (base === ingredient.baseUnit) {
    const value = Math.round((parsed.num * factor) / parsed.den);
    if (value < 1) return `«${amount} ${unit}» blir mindre enn 1 ${base}`;
    return value > MAX_QUANTITY_BASE ? 'mengden er for stor' : value;
  }
  const conversion = ingredient.conversions.find((c) => c.unit === base);
  if (!conversion)
    return `${unit} kan ikke regnes om til ${ingredient.baseUnit} (ingrediensen mangler omregning fra ${base})`;
  // Rounded once, at the end, so "½ stk løk" is 50 g and not a whole onion. Rounded to nearest, not down:
  // this is what the recipe needs, not what the household has.
  const value = Math.max(
    1,
    Math.round((parsed.num * factor * conversion.baseQty) / (parsed.den * conversion.unitQty)),
  );
  return value > MAX_QUANTITY_BASE ? 'mengden er for stor' : value;
}

function issues(prefix: string, error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${prefix}: ${issue.path.join('.') || '(hele filen)'}: ${issue.message}`,
  );
}

/**
 * Checks the ingredient file and all recipe files together. `recipeFiles` maps a file name to its parsed
 * JSON. Every error is listed, so the person writing a recipe can fix them all at once.
 */
export function checkSeed(
  ingredientsJson: unknown,
  recipeFiles: ReadonlyMap<string, unknown>,
): SeedCheck {
  const errors: string[] = [];
  const file = ingredientsFileSchema.safeParse(ingredientsJson);
  if (!file.success) return { ok: false, errors: issues('ingredients.json', file.error) };

  const ingredients = new Map<string, IngredientSeed>();
  const aliasOwner = new Map<string, string>();
  for (const ingredient of file.data.ingredients) {
    if (ingredients.has(ingredient.key))
      errors.push(`ingredients.json: nøkkelen «${ingredient.key}» står flere ganger`);
    ingredients.set(ingredient.key, ingredient);

    for (const alias of [ingredient.name, ...ingredient.aliases]) {
      const normal = normalizeAlias(alias);
      const owner = aliasOwner.get(normal);
      if (normal === '') errors.push(`ingredients.json: ${ingredient.key}: «${alias}» blir tomt`);
      else if (owner && owner !== ingredient.key)
        errors.push(
          `ingredients.json: «${normal}» brukes av både ${owner} og ${ingredient.key} (aliaser må være unike)`,
        );
      else aliasOwner.set(normal, ingredient.key);
    }
    for (const conversion of ingredient.conversions) {
      if (conversion.unit === ingredient.baseUnit)
        errors.push(
          `ingredients.json: ${ingredient.key}: omregning fra ${conversion.unit} er grunnenheten selv`,
        );
    }
    if (new Set(ingredient.conversions.map((c) => c.unit)).size !== ingredient.conversions.length)
      errors.push(
        `ingredients.json: ${ingredient.key}: samme enhet står flere ganger i omregningene`,
      );
  }

  const recipes: ResolvedSeed['recipes'] = [];
  const slugs = new Set<string>();
  for (const [fileName, json] of recipeFiles) {
    const parsed = recipeSeedSchema.safeParse(json);
    if (!parsed.success) {
      errors.push(...issues(fileName, parsed.error));
      continue;
    }
    const recipe = parsed.data;
    if (fileName !== `${recipe.slug}.json`)
      errors.push(`${fileName}: filnavnet må være slug + .json («${recipe.slug}.json»)`);
    if (slugs.has(recipe.slug)) errors.push(`${fileName}: slug «${recipe.slug}» finnes allerede`);
    slugs.add(recipe.slug);

    const seen = new Set<string>();
    const lines: ResolvedSeed['recipes'][number]['ingredients'] = [];
    recipe.ingredients.forEach((line, i) => {
      const where = `${fileName}: ingredients.${i}`;
      const ingredient = ingredients.get(line.ingredient);
      if (!ingredient) {
        errors.push(`${where}: ingrediensen «${line.ingredient}» finnes ikke i ingredients.json`);
        return;
      }
      if (seen.has(line.ingredient))
        errors.push(`${where}: «${line.ingredient}» står flere ganger i oppskriften`);
      seen.add(line.ingredient);

      let quantityBase: number | null = null;
      if (line.amount !== undefined && line.unit !== undefined) {
        const result = seedQuantityBase(line.amount, line.unit, ingredient);
        if (typeof result === 'string') errors.push(`${where}: ${result}`);
        else quantityBase = result;
      }
      lines.push({
        ingredientKey: line.ingredient,
        quantityBase,
        displayText: line.text,
        optional: line.optional,
      });
    });
    recipes.push({ ...recipe, ingredients: lines });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      ingredients: file.data.ingredients.map((i) => ({
        ...i,
        // The name is stored as an alias too, so the unique key in the database covers names as well.
        aliases: [...new Set([i.name, ...i.aliases].map(normalizeAlias))],
      })),
      recipes,
    },
  };
}
