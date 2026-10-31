import { describe, expect, it } from 'vitest';
import {
  filterItems,
  filterToParams,
  parseFilter,
  summarize,
  type InventoryFilter,
} from './filter';
import { batch, FREEZER, item } from '../test/inventoryFixtures';

const today = '2026-10-21';
const all: InventoryFilter = {
  q: '',
  location: '',
  category: '',
  status: 'alle',
  sort: 'dato',
  showEmpty: false,
};

const melk = item('Lettmelk', {
  batches: [batch({ expiryKind: 'best_before', expiryDate: '2026-10-23' })],
});
const kylling = item('Kyllingfilet', {
  categoryKey: 'meat',
  unit: 'g',
  createdAt: '2026-10-20T10:00:00.000Z',
  batches: [batch({ expiryKind: 'use_by', expiryDate: '2026-10-20', locationId: FREEZER })],
});
const ris = item('Ris', { categoryKey: 'dryGoods', batches: [batch()] });
const ost = item('Ost', {
  batches: [batch({ expiryKind: 'best_before', expiryDate: '2026-11-30' })],
});
const tom = item('Tom pakke', { batches: [] });
const items = [melk, kylling, ris, ost, tom];
const names = (list: { name: string }[]) => list.map((i) => i.name);

describe('FR-INV-004 filterItems', () => {
  it('default: hides empty items, sorts by earliest date, undated last', () => {
    expect(names(filterItems(items, all, today, 'nb-NO'))).toEqual([
      'Kyllingfilet',
      'Lettmelk',
      'Ost',
      'Ris',
    ]);
  });

  it('search ignores case and matches part of the name', () => {
    expect(names(filterItems(items, { ...all, q: 'MELK' }, today, 'nb-NO'))).toEqual(['Lettmelk']);
    expect(names(filterItems(items, { ...all, q: 'fil' }, today, 'nb-NO'))).toEqual([
      'Kyllingfilet',
    ]);
  });

  it('filters by location, category and status', () => {
    expect(names(filterItems(items, { ...all, location: FREEZER }, today, 'nb-NO'))).toEqual([
      'Kyllingfilet',
    ]);
    expect(names(filterItems(items, { ...all, category: 'dairy' }, today, 'nb-NO'))).toEqual([
      'Lettmelk',
      'Ost',
    ]);
    expect(names(filterItems(items, { ...all, status: 'snart' }, today, 'nb-NO'))).toEqual([
      'Lettmelk',
    ]);
    expect(names(filterItems(items, { ...all, status: 'passert' }, today, 'nb-NO'))).toEqual([
      'Kyllingfilet',
    ]);
    expect(names(filterItems(items, { ...all, status: 'uten-dato' }, today, 'nb-NO'))).toEqual([
      'Ris',
    ]);
  });

  it('sorts by name with Norwegian rules (Æ, Ø, Å last) and by most recently added', () => {
    const nordic = [item('Åkerbær'), item('Øl'), item('Ærter'), item('Agurk')];
    expect(names(filterItems(nordic, { ...all, sort: 'navn' }, today, 'nb-NO'))).toEqual([
      'Agurk',
      'Ærter',
      'Øl',
      'Åkerbær',
    ]);
    expect(names(filterItems(items, { ...all, sort: 'nylig' }, today, 'nb-NO'))[0]).toBe(
      'Kyllingfilet',
    );
  });

  it('can show empty items', () => {
    expect(names(filterItems(items, { ...all, showEmpty: true }, today, 'nb-NO'))).toContain(
      'Tom pakke',
    );
  });
});

describe('FR-INV-005 summarize', () => {
  it('counts items that go out soon, are past their date and have no date', () => {
    expect(summarize(items, today)).toEqual({ soon: 1, passed: 1, noDate: 1, total: 4 });
  });
});

describe('filter ↔ URL', () => {
  it('only non-default values go in the URL, and the URL reads back the same', () => {
    expect(filterToParams(all).toString()).toBe('');
    const filter: InventoryFilter = {
      q: 'melk',
      location: FREEZER,
      category: 'dairy',
      status: 'snart',
      sort: 'navn',
      showEmpty: true,
    };
    expect(parseFilter(filterToParams(filter))).toEqual(filter);
  });

  it('ignores unknown values in the URL', () => {
    expect(parseFilter(new URLSearchParams('status=hacket&sortering=x&kategori=godteri'))).toEqual(
      all,
    );
  });
});
