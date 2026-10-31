import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { WasteStats } from '@smartmat/shared';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { emptyWasteStats, mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';

const H = `/households/${TEST_SESSION.user.householdId}`;
const ITEM = '0199f0a0-0000-7000-8000-0000000000aa';

function stats(overrides: Partial<WasteStats> = {}): WasteStats {
  const base = emptyWasteStats('2026-10') as WasteStats;
  return { ...base, ...overrides };
}

const october = stats({
  count: 9,
  actualOre: 5_000,
  estimatedOre: 7_990,
  knownOre: 12_990,
  unknownCount: 4,
  estimatedPercent: 61,
  quantities: [
    { unit: 'g', quantityBase: 2_400 },
    { unit: 'stk', quantityBase: 6 },
  ],
  byReason: [
    {
      reason: 'expired',
      count: 5,
      actualOre: 5_000,
      estimatedOre: 7_990,
      knownOre: 12_990,
      unknownCount: 0,
      percent: 56,
    },
    {
      reason: 'spoiled',
      count: 4,
      actualOre: 0,
      estimatedOre: 0,
      knownOre: 0,
      unknownCount: 4,
      percent: 44,
    },
  ],
  byCategory: [
    {
      categoryKey: 'dairy',
      count: 9,
      actualOre: 5_000,
      estimatedOre: 7_990,
      knownOre: 12_990,
      unknownCount: 4,
      percent: 100,
    },
  ],
  topItems: [
    {
      itemId: ITEM,
      name: 'Lettmelk',
      unit: 'ml',
      count: 3,
      quantityBase: 1_500,
      knownOre: 7_470,
      unknownCount: 0,
    },
  ],
});
october.trend = october.trend.map((m) =>
  m.month === '2026-10'
    ? {
        month: m.month,
        count: 9,
        actualOre: 5_000,
        estimatedOre: 7_990,
        knownOre: 12_990,
        unknownCount: 4,
      }
    : m.month === '2026-09'
      ? { month: m.month, count: 1, actualOre: 0, estimatedOre: 0, knownOre: 0, unknownCount: 1 }
      : m,
);

const text = (el: HTMLElement) => el.textContent?.replace(/\s/g, ' ');

describe('FR-WASTE-001/004 the month, honestly', () => {
  it('known value with entered and estimated apart, unknown counted but without a value; no axe violations', async () => {
    mockApi((r) =>
      r.path === `${H}/waste-stats?month=2026-10` ? { status: 200, body: october } : undefined,
    );
    const { container } = renderApp('/svinn?maned=2026-10');
    const summary = await screen.findByRole('region', { name: 'Kastet i oktober 2026' });
    expect(within(summary).getByText('129,90 kr')).toBeInTheDocument();
    expect(within(summary).getByText('9 kasseringer')).toBeInTheDocument();
    expect(text(within(summary).getByText(/er beløp dere skrev inn/))).toBe(
      '50,00 kr er beløp dere skrev inn, og 79,90 kr er anslått fra prisen på varen. 61 % av den kjente verdien er anslått.',
    );
    expect(
      within(summary).getByText('4 kasseringer har ukjent verdi og er ikke med i summen.'),
    ).toBeInTheDocument();
    expect(text(within(summary).getByText(/^Mengde/))).toBe('Mengde: 2,4 kg · 6 stk');
    await expectNoAxeViolations(container);
  });

  it('says "under 1 %" instead of 0 % when a little is estimated', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/waste-stats`)
        ? {
            status: 200,
            body: stats({
              count: 2,
              actualOre: 99_900,
              estimatedOre: 100,
              knownOre: 100_000,
              estimatedPercent: 0,
            }),
          }
        : undefined,
    );
    renderApp('/svinn');
    expect(
      await screen.findByText(/Under 1 % av den kjente verdien er anslått\./),
    ).toBeInTheDocument();
  });
});

describe('FR-WASTE-002 reasons, categories and most thrown away', () => {
  it('lists count, share and kroner as text; the bars are hidden from screen readers', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/waste-stats`) ? { status: 200, body: october } : undefined,
    );
    renderApp('/svinn?maned=2026-10');
    const reasons = await screen.findByRole('region', { name: 'Hvorfor' });
    expect(within(reasons).getAllByRole('listitem').map(text)).toEqual([
      'Gått ut på dato129,90 kr5 kasseringer (56 %)',
      'Ødelagt eller muggen0,00 kr4 kasseringer (44 %) · 4 uten kjent verdi',
    ]);
    for (const bar of reasons.querySelectorAll('[aria-hidden="true"]'))
      expect(bar.textContent).toBe('');
    const top = screen.getByRole('region', { name: 'Mest kastet' });
    expect(within(top).getByRole('link', { name: 'Lettmelk' })).toHaveAttribute(
      'href',
      `/matlager/${ITEM}`,
    );
    expect(text(within(top).getByRole('listitem'))).toContain('3 ganger · 1,5 l');
  });
});

describe('FR-WASTE-003/005 the 12 months as a table', () => {
  it('one row per month, newest first, with headers and the estimated part in words', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/waste-stats`) ? { status: 200, body: october } : undefined,
    );
    renderApp('/svinn?maned=2026-10');
    const table = await screen.findByRole('table', { name: /Kastet per måned/ });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((c) => c.textContent),
    ).toEqual(['Måned', 'Kasseringer', 'Kjent verdi', 'Ukjent verdi']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    expect(within(rows[0]!).getByRole('rowheader').textContent).toBe('okt. 2026');
    expect(text(rows[0]!)).toBe('okt. 20269129,90 krherav 79,90 kr anslått4');
    expect(text(rows[1]!)).toBe('sep. 202610,00 kr1');
    expect(within(rows[11]!).getByRole('rowheader').textContent).toBe('nov. 2025');
  });
});

describe('FR-WASTE-005 states and the month in the URL', () => {
  it('an empty month says so; a month with no waste in 12 months shows no table', async () => {
    const { container } = renderApp('/svinn?maned=2026-08');
    expect(
      await screen.findByRole('heading', { name: 'Ingenting kastet i august 2026' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Neste/ })).toHaveAttribute(
      'href',
      '/svinn?maned=2026-09',
    );
    expect(screen.getByRole('link', { name: /Forrige/ })).toHaveAttribute(
      'href',
      '/svinn?maned=2026-07',
    );
    await expectNoAxeViolations(container);
  });

  it('shows an error with a way to try again', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/waste-stats`)
        ? { status: 500, body: { error: { code: 'errors.internal' } } }
        : undefined,
    );
    renderApp('/svinn');
    expect(await screen.findByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument();
  });
});
