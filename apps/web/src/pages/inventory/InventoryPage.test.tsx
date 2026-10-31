import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { batch, FREEZER, inDays, item } from '../../test/inventoryFixtures';

const items = [
  item('Lettmelk', {
    batches: [batch({ expiryKind: 'best_before', expiryDate: inDays(2), quantityBase: 1750 })],
  }),
  item('Kyllingfilet', {
    categoryKey: 'meat',
    unit: 'g',
    batches: [
      batch({
        expiryKind: 'use_by',
        expiryDate: inDays(-1),
        quantityBase: 400,
        locationId: FREEZER,
      }),
    ],
  }),
  item('Ris', { categoryKey: 'dryGoods', unit: 'g', batches: [batch({ quantityBase: 1000 })] }),
];

function withItems() {
  return mockApi((r) =>
    r.method === 'GET' && r.path.endsWith('/inventory')
      ? { status: 200, body: { items } }
      : undefined,
  );
}

describe('FR-INV-004/005 inventory page', () => {
  it('lists items with quantity, place and a worded status; no axe violations', async () => {
    withItems();
    const { container } = renderApp('/matlager');
    const milk = (await screen.findByRole('link', { name: 'Lettmelk' })).closest('li')!;
    expect(within(milk).getByText(/1,75 l/)).toBeInTheDocument();
    expect(within(milk).getByText('Kjøleskap', { exact: false })).toBeInTheDocument();
    expect(within(milk).getByText('Best før om 2 dager')).toBeInTheDocument();
    const chicken = screen.getByRole('link', { name: 'Kyllingfilet' }).closest('li')!;
    expect(within(chicken).getByText('Siste forbruksdag passert')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('summary at the top: 1 soon, 1 passed, 1 without date – each a link that sets the filter', async () => {
    withItems();
    const user = userEvent.setup();
    const { router } = renderApp('/matlager');
    const summary = await screen.findByRole('navigation', { name: 'Holdbarhet' });
    const links = within(summary).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      '1går ut snart',
      '1har passert datoen',
      '1mangler dato',
    ]);
    await user.click(links[1]!);
    expect(router.state.location.search).toBe('?status=passert');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Kyllingfilet',
    ]);
  });

  it('search filters as you type and is kept in the URL', async () => {
    withItems();
    const user = userEvent.setup();
    const { router } = renderApp('/matlager');
    await user.type(await screen.findByRole('searchbox', { name: /Søk/ }), 'ris');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Ris']);
    expect(router.state.location.search).toBe('?q=ris');
    expect(screen.getByRole('status')).toHaveTextContent('Viser 1 av 3 varer');
  });

  it('opening a URL with filters shows the filtered list (shareable view)', async () => {
    withItems();
    renderApp('/matlager?kategori=meat&sortering=navn');
    await screen.findByRole('link', { name: 'Kyllingfilet' });
    expect(screen.queryByRole('link', { name: 'Lettmelk' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Kategori/)).toHaveValue('meat');
  });

  it('no match: says so and offers to clear the filters', async () => {
    withItems();
    renderApp('/matlager?q=sjokolade');
    expect(await screen.findByRole('heading', { name: 'Ingen varer passer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fjern filtre' })).toBeInTheDocument();
  });

  it('empty inventory: explains and links to "Legg til vare"', async () => {
    renderApp('/matlager');
    expect(await screen.findByRole('heading', { name: 'Matlageret er tomt' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Legg til vare' }).length).toBeGreaterThan(0);
  });

  it('error: shows "Prøv igjen"', async () => {
    mockApi((r) =>
      r.path.endsWith('/inventory')
        ? { status: 500, body: { error: { code: 'errors.internal' } } }
        : undefined,
    );
    renderApp('/matlager');
    expect(
      await screen.findByRole('button', { name: 'Prøv igjen' }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
