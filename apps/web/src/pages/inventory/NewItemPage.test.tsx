import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { FRIDGE, item } from '../../test/inventoryFixtures';

describe('FR-INV-001 new item', () => {
  it('empty submit: errors from the shared rules, nothing sent; no axe violations', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    const { container } = renderApp('/matlager/ny');
    await user.click(await screen.findByRole('button', { name: 'Legg til' }));
    const summary = screen.getByRole('alert', { name: /feil/ });
    expect(summary).toHaveTextContent('Skriv inn navnet på varen.');
    expect(summary).toHaveTextContent('Velg en kategori.');
    expect(summary).toHaveTextContent('Skriv inn en mengde.');
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
    await expectNoAxeViolations(container);
  });

  it('the date field appears only after choosing best før or siste forbruksdag', async () => {
    const user = userEvent.setup();
    renderApp('/matlager/ny');
    expect(screen.queryByLabelText('Dato')).not.toBeInTheDocument();
    await user.selectOptions(await screen.findByLabelText('Dato på pakken'), 'Siste forbruksdag');
    expect(screen.getByLabelText('Dato')).toBeInTheDocument();
  });

  it('sends whole base units and øre: "1,5" kg → 1500 g, "89,90" kr → 8990 øre', async () => {
    const created = item('Kjøttdeig', { unit: 'g' });
    const requests = mockApi((r) =>
      r.method === 'POST'
        ? { status: 201, body: created }
        : r.path.includes('/items/')
          ? { status: 200, body: created }
          : undefined,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/matlager/ny');
    await user.type(await screen.findByLabelText(/Navn på varen/), 'Kjøttdeig');
    await user.selectOptions(screen.getByLabelText('Kategori'), 'Kjøtt');
    await user.selectOptions(screen.getByLabelText(/Måles i/), 'Vekt (g, kg)');
    await user.type(screen.getByLabelText('Mengde'), '1,5');
    await user.selectOptions(screen.getByLabelText('Enhet'), 'kg');
    await user.selectOptions(screen.getByLabelText('Dato på pakken'), 'Siste forbruksdag');
    await user.type(screen.getByLabelText('Dato'), '2026-10-25');
    await user.type(screen.getByLabelText(/^Pris/), '89,90');
    await user.click(screen.getByRole('button', { name: 'Legg til' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Kjøttdeig' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/matlager/${created.id}`);
    expect(requests.find((r) => r.method === 'POST')).toMatchObject({
      path: `/households/${TEST_SESSION.user.householdId}/inventory/items`,
      body: {
        name: 'Kjøttdeig',
        categoryKey: 'meat',
        unit: 'g',
        batch: {
          quantityBase: 1500,
          locationId: FRIDGE,
          expiry: { kind: 'use_by', date: '2026-10-25' },
          priceOre: 8990,
          purchasedOn: null,
        },
      },
    });
  });

  it('a too precise amount is stopped in the browser', async () => {
    const user = userEvent.setup();
    renderApp('/matlager/ny');
    await user.type(await screen.findByLabelText('Mengde'), '1,5');
    await user.click(screen.getByRole('button', { name: 'Legg til' }));
    // Default unit is "stk": 1,5 pieces is not a whole number.
    expect(screen.getByLabelText('Mengde')).toHaveAccessibleDescription(/Mengden er for nøyaktig/);
  });
});
