import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderApp } from '../test/renderApp';
import { mockApi } from '../test/mockApi';
import { batch, inDays, item } from '../test/inventoryFixtures';
import { summary } from '../test/purchaseFixtures';

describe('FR-DASH-001 overview with real inventory data', () => {
  it('"Går ut snart" lists passed, today and soon (≤ 3 days), earliest first, max 5', async () => {
    const items = [
      item('Yoghurt', { batches: [batch({ expiryKind: 'best_before', expiryDate: inDays(-2) })] }),
      item('Kjøttdeig', {
        unit: 'g',
        batches: [batch({ expiryKind: 'use_by', expiryDate: inDays(0), quantityBase: 400 })],
      }),
      item('Ost', { batches: [batch({ expiryKind: 'best_before', expiryDate: inDays(10) })] }),
      item('Ris', { batches: [batch()] }),
      ...[1, 2, 3, 3, 3].map((d, i) =>
        item(`Vare ${i}`, {
          batches: [batch({ expiryKind: 'best_before', expiryDate: inDays(d) })],
        }),
      ),
    ];
    mockApi((r) =>
      r.method === 'GET' && r.path.endsWith('/inventory')
        ? { status: 200, body: { items } }
        : undefined,
    );
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Går ut snart' });
    const links = await within(card).findAllByRole('link', {
      name: /Yoghurt|Kjøttdeig|Vare|Ost|Ris/,
    });
    expect(links.map((l) => l.textContent)).toEqual([
      'Yoghurt',
      'Kjøttdeig',
      'Vare 0',
      'Vare 1',
      'Vare 2',
    ]);
    expect(within(card).getByText('Siste forbruksdag i dag')).toBeInTheDocument();
    expect(within(card).getByText('Best før passert')).toBeInTheDocument();
    expect(within(card).getByText('Ofte fortsatt god. Se, lukt og smak.')).toBeInTheDocument();
  });

  it('says so when nothing needs attention', async () => {
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Går ut snart' });
    expect(
      await within(card).findByText('Ingenting går ut de neste tre dagene.'),
    ).toBeInTheDocument();
  });

  it('"Kastet denne måneden" shows the known value and how many had no value', async () => {
    mockApi((r) =>
      r.path.endsWith('/waste-summary')
        ? {
            status: 200,
            body: { month: '2026-10', count: 3, knownValueOre: 6400, unknownValueCount: 1 },
          }
        : undefined,
    );
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Kastet denne måneden' });
    expect(await within(card).findByText('64,00 kr')).toBeInTheDocument();
    expect(within(card).getByText('3 kasseringer denne måneden')).toBeInTheDocument();
    expect(within(card).getByText('1 av dem uten kjent verdi')).toBeInTheDocument();
  });
});

describe('FR-DASH-001 budget card with real data (phase 4)', () => {
  it('without a budget: shows what was spent and a link to set a budget; not sample data', async () => {
    mockApi((r) =>
      r.path.endsWith('/budget/summary')
        ? { status: 200, body: summary({ spentOre: 12_990 }) }
        : undefined,
    );
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Matbudsjett denne måneden' });
    expect(await within(card).findByText('129,90 kr')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Sett budsjett' })).toHaveAttribute(
      'href',
      '/budsjett',
    );
    expect(within(card).queryByText('Eksempeldata')).not.toBeInTheDocument();
  });

  it('with a budget: spent, remaining and the percentage used', async () => {
    mockApi((r) =>
      r.path.endsWith('/budget/summary')
        ? {
            status: 200,
            body: summary({
              budgetOre: 400_000,
              spentOre: 100_000,
              remainingOre: 300_000,
              usedPercent: 25,
            }),
          }
        : undefined,
    );
    renderApp('/');
    const card = await screen.findByRole('region', { name: 'Matbudsjett denne måneden' });
    expect(await within(card).findByText('3 000,00 kr')).toBeInTheDocument();
    expect(within(card).getByText('25 % av månedsbudsjettet er brukt')).toBeInTheDocument();
  });

  it('"Registrer kjøp" goes to the purchase form', async () => {
    renderApp('/');
    const actions = await screen.findByRole('region', { name: 'Hurtighandlinger' });
    expect(within(actions).getByRole('link', { name: 'Registrer kjøp' })).toHaveAttribute(
      'href',
      '/budsjett/kjop/ny',
    );
  });
});
