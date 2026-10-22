import type { CategoryKey } from '../schemas/inventory';

/*
 * KI-UTKAST (Claude, fase 7): Open Food Facts category tags → SmartMat categories. Not checked by the team.
 * Only a suggestion for the form; the user always sees and can change the category. A product whose tags
 * are not in the table gets no category, and the user must choose one.
 */
export const OFF_CATEGORY_MAP: Readonly<Record<string, CategoryKey>> = {
  'en:dairies': 'dairy',
  'en:milks': 'dairy',
  'en:cheeses': 'dairy',
  'en:yogurts': 'dairy',
  'en:creams': 'dairy',
  'en:butters': 'dairy',
  'en:eggs': 'dairy',
  'en:meats': 'meat',
  'en:poultries': 'meat',
  'en:sausages': 'meat',
  'en:hams': 'meat',
  'en:fishes': 'fish',
  'en:seafood': 'fish',
  'en:fruits': 'fruitVeg',
  'en:vegetables': 'fruitVeg',
  'en:fresh-vegetables': 'fruitVeg',
  'en:fresh-fruits': 'fruitVeg',
  'en:potatoes': 'fruitVeg',
  'en:breads': 'bread',
  'en:crispbreads': 'bread',
  'en:cereals-and-their-products': 'dryGoods',
  'en:pastas': 'dryGoods',
  'en:rices': 'dryGoods',
  'en:flours': 'dryGoods',
  'en:breakfast-cereals': 'dryGoods',
  'en:legumes': 'dryGoods',
  'en:canned-foods': 'canned',
  'en:frozen-foods': 'frozen',
  'en:spreads': 'spreads',
  'en:sweet-spreads': 'spreads',
  'en:jams': 'spreads',
  'en:condiments': 'spicesSauces',
  'en:sauces': 'spicesSauces',
  'en:spices': 'spicesSauces',
  'en:beverages': 'drinks',
};

/**
 * OFF lists categories from general to specific ("en:dairies", "en:milks", …). The most specific tag that is in
 * the table wins, so a "frozen fish" product with both tags is decided by the later, more specific one.
 */
export function categoryFromOffTags(tags: readonly string[]): CategoryKey | null {
  for (let i = tags.length - 1; i >= 0; i--) {
    const key = OFF_CATEGORY_MAP[tags[i] ?? ''];
    if (key) return key;
  }
  return null;
}
