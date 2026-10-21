import {
  CATEGORY_KEYS,
  expiryStatus,
  mostSevere,
  type CategoryKey,
  type ExpiryStatus,
  type ItemResponse,
} from '@smartmat/shared';

/*
 * FR-INV-004: search, filter and sort the inventory in the browser (KURS-03: JavaScript and the DOM).
 * Pure functions, so they are easy to test; the page reads the options from the URL.
 */

export const STATUS_FILTERS = ['alle', 'snart', 'passert', 'uten-dato'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_OPTIONS = ['dato', 'navn', 'nylig'] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export interface InventoryFilter {
  q: string;
  location: string;
  category: CategoryKey | '';
  status: StatusFilter;
  sort: SortOption;
  showEmpty: boolean;
}

export function parseFilter(params: URLSearchParams): InventoryFilter {
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    q: params.get('q') ?? '',
    location: params.get('sted') ?? '',
    category: pick(params.get('kategori'), ['', ...CATEGORY_KEYS] as const, ''),
    status: pick(params.get('status'), STATUS_FILTERS, 'alle'),
    sort: pick(params.get('sortering'), SORT_OPTIONS, 'dato'),
    showEmpty: params.get('tomme') === '1',
  };
}

/** Only non-default values go in the URL, so a plain /matlager means "everything, sorted by date". */
export function filterToParams(filter: InventoryFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.q) params.set('q', filter.q);
  if (filter.location) params.set('sted', filter.location);
  if (filter.category) params.set('kategori', filter.category);
  if (filter.status !== 'alle') params.set('status', filter.status);
  if (filter.sort !== 'dato') params.set('sortering', filter.sort);
  if (filter.showEmpty) params.set('tomme', '1');
  return params;
}

export function batchStatuses(item: ItemResponse, today: string): ExpiryStatus[] {
  return item.batches.map((b) => expiryStatus(b.expiryDate, today).status);
}

export function itemStatus(item: ItemResponse, today: string): ExpiryStatus {
  return mostSevere(batchStatuses(item, today));
}

function matchesStatus(item: ItemResponse, status: StatusFilter, today: string): boolean {
  const statuses = batchStatuses(item, today);
  if (status === 'snart') return statuses.some((s) => s === 'today' || s === 'soon');
  if (status === 'passert') return statuses.includes('passed');
  if (status === 'uten-dato') return statuses.includes('none');
  return true;
}

function earliestDate(item: ItemResponse): string | null {
  // Batches arrive sorted by date with undated ones last.
  return item.batches[0]?.expiryDate ?? null;
}

export function filterItems(
  items: readonly ItemResponse[],
  filter: InventoryFilter,
  today: string,
  locale: string,
): ItemResponse[] {
  const collator = new Intl.Collator(locale, { sensitivity: 'base' });
  const query = filter.q.trim().toLocaleLowerCase(locale);

  const result = items.filter(
    (item) =>
      (filter.showEmpty || item.batches.length > 0) &&
      (!query || item.name.toLocaleLowerCase(locale).includes(query)) &&
      (!filter.category || item.categoryKey === filter.category) &&
      (!filter.location || item.batches.some((b) => b.locationId === filter.location)) &&
      matchesStatus(item, filter.status, today),
  );

  const byName = (a: ItemResponse, b: ItemResponse) => collator.compare(a.name, b.name);
  return result.sort((a, b) => {
    if (filter.sort === 'navn') return byName(a, b);
    if (filter.sort === 'nylig') return b.createdAt.localeCompare(a.createdAt) || byName(a, b);
    const da = earliestDate(a);
    const db = earliestDate(b);
    if (da === db) return byName(a, b);
    if (da === null) return 1;
    if (db === null) return -1;
    return da.localeCompare(db);
  });
}

/** The numbers at the top of the inventory: items that go out soon, are past their date, or have no date. */
export function summarize(items: readonly ItemResponse[], today: string) {
  const nonEmpty = items.filter((i) => i.batches.length > 0);
  return {
    soon: nonEmpty.filter((i) => matchesStatus(i, 'snart', today)).length,
    passed: nonEmpty.filter((i) => matchesStatus(i, 'passert', today)).length,
    noDate: nonEmpty.filter((i) => matchesStatus(i, 'uten-dato', today)).length,
    total: nonEmpty.length,
  };
}
