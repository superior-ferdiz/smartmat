/*
 * Spec 05, "Kobling mellom vare og ingrediens". An inventory item has a free-text name ("Tine lettmelk 1 l");
 * recipes use normalised ingredients ("melk"). The item is linked by its aliases: an alias matches when all
 * its words appear next to each other in the item name, as whole words. The alias with most words wins; two
 * different ingredients matching with as many words is "ambiguous" and gives no match, so the app never guesses.
 *
 * Pure functions: the API uses them to rank recipes, the web app to show the link on the item page.
 */

export const INGREDIENT_MATCH_MODES = ['auto', 'manual', 'none'] as const;
export type IngredientMatchMode = (typeof INGREDIENT_MATCH_MODES)[number];

// "1 l", "1,5 kg", "500g", "0.5%", "2x": numbers with an optional unit right after them.
const QUANTITY = /\d+(?:[.,]\d+)?\s*(?:kg|g|mg|ml|cl|dl|ltr|l|stk|pk|x)?(?![\p{L}])/gu;
const NOT_A_WORD_CHAR = /[^\p{L}\p{N}]+/gu;

/** "Tine Lettmelk 1 l (0,5%)" → ["tine", "lettmelk"]. */
export function normalizeWords(text: string): string[] {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('nb')
    .replace(QUANTITY, ' ')
    .replace(NOT_A_WORD_CHAR, ' ')
    .split(' ')
    .filter((word) => word !== '' && !/^\d+$/.test(word));
}

/** The stored form of an alias: its normalised words with single spaces ("Melk 1%" → "melk"). */
export function normalizeAlias(text: string): string {
  return normalizeWords(text).join(' ');
}

export interface MatchableIngredient {
  id: string;
  name: string;
  aliases: readonly string[];
}

/** Normalised alias → ingredient id. The ingredient's own name counts as an alias. */
export type AliasIndex = ReadonlyMap<string, string>;

export function buildAliasIndex(ingredients: readonly MatchableIngredient[]): AliasIndex {
  const index = new Map<string, string>();
  for (const ingredient of ingredients) {
    for (const alias of [ingredient.name, ...ingredient.aliases]) {
      const key = normalizeAlias(alias);
      // Unique aliases are enforced by the database and the seed check; if two collide anyway,
      // the first one wins here rather than throwing in the middle of a request.
      if (key !== '' && !index.has(key)) index.set(key, ingredient.id);
    }
  }
  return index;
}

export type NameMatch =
  | { kind: 'matched'; ingredientId: string; alias: string }
  | { kind: 'ambiguous'; ingredientIds: string[] }
  | { kind: 'unmatched' };

/** The best alias match for an item name (whole words, the alias with most words wins). */
export function matchByName(itemName: string, index: AliasIndex): NameMatch {
  const words = normalizeWords(itemName);
  let best: { words: number; alias: string; ids: Set<string> } | null = null;

  for (let start = 0; start < words.length; start++) {
    for (let end = start + 1; end <= words.length; end++) {
      const alias = words.slice(start, end).join(' ');
      const id = index.get(alias);
      if (id === undefined) continue;
      const size = end - start;
      if (!best || size > best.words) best = { words: size, alias, ids: new Set([id]) };
      else if (size === best.words) best.ids.add(id);
    }
  }

  if (!best) return { kind: 'unmatched' };
  const ids = [...best.ids];
  if (ids.length > 1) return { kind: 'ambiguous', ingredientIds: ids.sort() };
  return { kind: 'matched', ingredientId: ids[0] ?? '', alias: best.alias };
}

export interface LinkableItem {
  name: string;
  ingredientMatch: IngredientMatchMode;
  ingredientId: string | null;
}

export type ItemLink =
  | { kind: 'manual'; ingredientId: string }
  | { kind: 'auto'; ingredientId: string; alias: string }
  | { kind: 'ambiguous'; ingredientIds: string[] }
  | { kind: 'none' }
  | { kind: 'unmatched' };

/** Which ingredient an item counts as: the user's choice wins over the name. */
export function linkItem(item: LinkableItem, index: AliasIndex): ItemLink {
  if (item.ingredientMatch === 'none') return { kind: 'none' };
  if (item.ingredientMatch === 'manual' && item.ingredientId)
    return { kind: 'manual', ingredientId: item.ingredientId };
  const match = matchByName(item.name, index);
  if (match.kind === 'matched')
    return { kind: 'auto', ingredientId: match.ingredientId, alias: match.alias };
  return match;
}

/** The linked ingredient id, or null when the item is not linked to anything. */
export function linkedIngredientId(link: ItemLink): string | null {
  return link.kind === 'manual' || link.kind === 'auto' ? link.ingredientId : null;
}
