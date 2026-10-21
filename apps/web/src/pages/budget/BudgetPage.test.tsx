import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { osloDate } from '@smartmat/shared';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { summary } from '../../test/purchaseFixtures';

const H = `/households/${TEST_SESSION.user.householdId}`;

describe('FR-BUD-004 budget page', () => {
  it('spent, remaining, per category (largest first), not allocated and non-food; no axe violations', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/budget/summary`)
        ? {
            status: 200,
            body: summary({
              budgetOre: 500_000,
              spentOre: 35_520,
              remainingOre: 464_480,
              usedPercent: 7,
              byCategory: [
                { categoryKey: 'meat', amountOre: 5990 },
                { categoryKey: 'dairy', amountOre: 4480 },
              ],
              unallocatedOre: 25_050,
              nonFoodOre: 3990,
              purchaseCount: 2,
            }),
          }
        : undefined,
    );
    const { container } = renderApp('/budsjett');
    const card = await screen.findByRole('region', { name: 'Matbudsjett' });
    expect(await within(card).findByText('355,20 kr')).toBeInTheDocument();
    expect(within(card).getByText('4 644,80 kr')).toBeInTheDocument();
    expect(within(card).getByText('7 % av månedsbudsjettet er brukt')).toBeInTheDocument();

    const categories = screen.getByRole('region', { name: 'Forbruk per kategori' });
    // formatOre puts a no-break space before "kr"; compare with ordinary spaces.
    const rows = within(categories)
      .getAllByRole('listitem')
      .map((li) => li.textContent?.replace(/\s/g, ' '));
    expect(rows).toEqual([
      'Kjøtt59,90 kr',
      'Meieri og egg44,80 kr',
      'Ikke fordelt (bare totalsum)250,50 kr',
    ]);
    expect(
      within(categories).getByText(/Ikke mat: 39,90 kr\. Teller ikke med/),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('over budget is said in words, not only with colour', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/budget/summary`)
        ? {
            status: 200,
            body: summary({
              budgetOre: 100_000,
              spentOre: 125_000,
              remainingOre: -25_000,
              usedPercent: 125,
            }),
          }
        : undefined,
    );
    renderApp('/budsjett');
    const card = await screen.findByRole('region', { name: 'Matbudsjett' });
    expect(await within(card).findByText('Over budsjett med')).toBeInTheDocument();
    expect(within(card).getByText('250,00 kr')).toBeInTheDocument();
    expect(within(card).getByText(/brukt 125 % av budsjettet og er over/)).toBeInTheDocument();
  });

  it('the month comes from the URL; "next" is hidden for the current month', async () => {
    const requests = mockApi(() => undefined);
    renderApp('/budsjett?maned=2026-03');
    expect(await screen.findByRole('heading', { level: 2, name: 'mars 2026' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forrige måned' })).toHaveAttribute(
      'href',
      '/budsjett?maned=2026-02',
    );
    expect(screen.getByRole('link', { name: 'Neste måned' })).toHaveAttribute(
      'href',
      '/budsjett?maned=2026-04',
    );
    await screen.findByText('Ingen kjøp denne måneden');
    expect(requests.map((r) => r.path)).toEqual(
      expect.arrayContaining([`${H}/budget/summary?month=2026-03`, `${H}/purchases?month=2026-03`]),
    );
  });

  it('an invalid month in the URL falls back to the current month', async () => {
    renderApp('/budsjett?maned=2026-13');
    const current = osloDate(new Date()).slice(0, 7);
    const name = new Intl.DateTimeFormat('nb-NO', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${current}-01T00:00:00Z`));
    expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neste måned' })).not.toBeInTheDocument();
  });

  it('lists the month’s purchases with links', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/purchases`)
        ? {
            status: 200,
            body: {
              month: '2026-10',
              purchases: [
                {
                  id: '0199f0a0-0000-7000-8000-0000000000c1',
                  storeName: 'Kiwi',
                  purchasedOn: '2026-10-20',
                  totalOre: 8480,
                  lineCount: 2,
                  batchCount: 1,
                },
                {
                  id: '0199f0a0-0000-7000-8000-0000000000c2',
                  storeName: null,
                  purchasedOn: '2026-10-02',
                  totalOre: 45_000,
                  lineCount: 0,
                  batchCount: 0,
                },
              ],
            },
          }
        : undefined,
    );
    renderApp('/budsjett');
    const list = await screen.findByRole('region', { name: /^Kjøp i/ });
    expect(await within(list).findByRole('link', { name: 'Kiwi' })).toHaveAttribute(
      'href',
      '/budsjett/kjop/0199f0a0-0000-7000-8000-0000000000c1',
    );
    expect(within(list).getByText(/2 linjer · 1 i matlageret/)).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Ukjent butikk' })).toBeInTheDocument();
    expect(within(list).getByText(/bare totalsum/)).toBeInTheDocument();
  });

  it('a failed load shows an error with "Prøv igjen"', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/budget/summary`)
        ? { status: 500, body: { error: { code: 'errors.internal' } } }
        : undefined,
    );
    renderApp('/budsjett');
    // A 5xx is retried once (queryClient) before the error is shown.
    expect(
      await screen.findByRole('button', { name: 'Prøv igjen' }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});

describe('FR-BUD-003 set the monthly budget', () => {
  it('"5 000" kr is sent as 500 000 øre', async () => {
    const requests = mockApi((r) =>
      r.method === 'PUT'
        ? { status: 200, body: { amountOre: 500_000, validFrom: '2026-10-01' } }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/budsjett');
    await user.click(await screen.findByRole('button', { name: 'Sett budsjett' }));
    const dialog = screen.getByRole('dialog', { name: 'Månedlig matbudsjett' });
    await user.type(within(dialog).getByLabelText('Beløp per måned'), '5 000');
    await user.click(within(dialog).getByRole('button', { name: 'Lagre' }));
    expect(await screen.findByText('Budsjettet er lagret.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PUT')).toMatchObject({
      path: `${H}/budget`,
      body: { amountOre: 500_000 },
    });
  });

  it('a too small amount is refused by the server and shown on the field', async () => {
    mockApi((r) =>
      r.method === 'PUT'
        ? {
            status: 400,
            body: {
              error: {
                code: 'errors.validation',
                fields: { amountOre: 'validation.budget.tooSmall' },
              },
            },
          }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/budsjett');
    await user.click(await screen.findByRole('button', { name: 'Sett budsjett' }));
    await user.type(screen.getByLabelText('Beløp per måned'), '0,50');
    await user.click(screen.getByRole('button', { name: 'Lagre' }));
    expect(await screen.findByText('Budsjettet må være minst 1 kr.')).toBeInTheDocument();
  });

  it('an existing budget can be removed (null)', async () => {
    const requests = mockApi((r) =>
      r.path === `${H}/budget` && r.method === 'GET'
        ? { status: 200, body: { amountOre: 400_000, validFrom: '2026-09-01' } }
        : r.method === 'PUT'
          ? { status: 200, body: { amountOre: null, validFrom: null } }
          : undefined,
    );
    const user = userEvent.setup();
    renderApp('/budsjett');
    await user.click(await screen.findByRole('button', { name: 'Endre budsjett' }));
    expect(screen.getByLabelText('Beløp per måned')).toHaveValue('4000,00');
    await user.click(screen.getByRole('button', { name: 'Fjern budsjettet' }));
    expect(await screen.findByText('Budsjettet er fjernet.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({ amountOre: null });
  });
});
