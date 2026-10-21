import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { FRIDGE, item } from '../../test/inventoryFixtures';
import { line, purchase } from '../../test/purchaseFixtures';

const H = `/households/${TEST_SESSION.user.householdId}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('FR-BUD-001/002 register a purchase', () => {
  it('empty submit: errors from the shared rules, nothing sent; no axe violations', async () => {
    const requests = mockApi(() => undefined);
    const user = userEvent.setup();
    const { container } = renderApp('/budsjett/kjop/ny');
    await user.click(await screen.findByRole('button', { name: 'Lagre kjøpet' }));
    const summary = screen.getByRole('alert', { name: /feil/ });
    expect(summary).toHaveTextContent('Skriv hva du kjøpte.');
    expect(summary).toHaveTextContent('Velg en kategori.');
    expect(summary).toHaveTextContent('Skriv inn et beløp.');
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
    await expectNoAxeViolations(container);
  });

  it('two lines, one into the inventory: øre, base units and a client request id are sent', async () => {
    const saved = purchase({
      purchasedOn: '2026-10-20',
      lines: [
        line('Lettmelk', {
          batch: { id: 'b', itemId: 'i', itemName: 'Lettmelk', untouched: true },
        }),
        line('Oppvask', { kind: 'nonFood', categoryKey: null, amountOre: 3990 }),
      ],
    });
    const requests = mockApi((r) =>
      r.method === 'POST' ? { status: 201, body: saved } : undefined,
    );
    const user = userEvent.setup();
    const { router } = renderApp('/budsjett/kjop/ny');

    await user.type(await screen.findByLabelText(/^Butikk/), 'Kiwi');
    const date = screen.getByLabelText('Kjøpsdato');
    await user.clear(date);
    await user.type(date, '2026-10-20');
    await user.type(screen.getByLabelText('Hva'), 'Lettmelk');
    await user.selectOptions(screen.getByLabelText('Kategori'), 'Meieri og egg');
    await user.type(screen.getByLabelText('Beløp'), '24,90');
    await user.click(screen.getByLabelText('Legg i matlageret'));
    await user.selectOptions(screen.getByLabelText('Måles i'), 'Volum (ml, dl, l)');
    await user.type(screen.getByLabelText('Mengde'), '1,75');
    await user.selectOptions(screen.getByLabelText('Enhet'), 'l');
    await user.selectOptions(screen.getByLabelText('Dato på pakken'), 'Best før');
    await user.type(screen.getByLabelText('Dato'), '2026-10-28');

    await user.click(screen.getByRole('button', { name: 'Legg til linje' }));
    const second = screen.getByRole('group', { name: 'Linje 2' });
    await user.type(within(second).getByLabelText('Hva'), 'Oppvask');
    await user.selectOptions(within(second).getByLabelText('Type'), 'Ikke mat');
    expect(within(second).queryByLabelText('Kategori')).not.toBeInTheDocument();
    expect(within(second).queryByLabelText('Legg i matlageret')).not.toBeInTheDocument();
    await user.type(within(second).getByLabelText('Beløp'), '39,90');
    expect(screen.getByText(/Sum: 64,80/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lagre kjøpet' }));
    expect(
      await screen.findByText('Kjøpet er registrert, og 1 vare er lagt i matlageret.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe(
      '/budsjett?maned=2026-10',
    );
    const post = requests.find((r) => r.method === 'POST');
    expect(post?.path).toBe(`${H}/purchases`);
    expect(post?.body).toEqual({
      storeName: 'Kiwi',
      purchasedOn: '2026-10-20',
      clientRequestId: expect.stringMatching(UUID),
      lines: [
        {
          description: 'Lettmelk',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 2490,
          toInventory: {
            unit: 'ml',
            quantityBase: 1750,
            locationId: FRIDGE,
            expiry: { kind: 'best_before', date: '2026-10-28' },
          },
        },
        {
          description: 'Oppvask',
          kind: 'nonFood',
          categoryKey: null,
          amountOre: 3990,
          toInventory: null,
        },
      ],
    });
  });

  it('onto an item the household already has', async () => {
    const rice = item('Ris', { unit: 'g' });
    const requests = mockApi((r) =>
      r.method === 'POST'
        ? { status: 201, body: purchase() }
        : r.path === `${H}/inventory`
          ? { status: 200, body: { items: [rice] } }
          : undefined,
    );
    const user = userEvent.setup();
    renderApp('/budsjett/kjop/ny');
    await user.type(await screen.findByLabelText('Hva'), 'Jasminris');
    await user.selectOptions(screen.getByLabelText('Kategori'), 'Tørrvarer');
    await user.type(screen.getByLabelText('Beløp'), '34,90');
    await user.click(screen.getByLabelText('Legg i matlageret'));
    await user.selectOptions(screen.getByLabelText(/Vare i matlageret/), 'Ris');
    expect(screen.queryByLabelText('Måles i')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Mengde'), '1');
    await user.selectOptions(screen.getByLabelText('Enhet'), 'kg');
    await user.click(screen.getByRole('button', { name: 'Lagre kjøpet' }));
    await screen.findByText('Kjøpet er registrert.');
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      lines: [{ toInventory: { itemId: rice.id, quantityBase: 1000, locationId: FRIDGE } }],
    });
  });

  it('only a total', async () => {
    const requests = mockApi((r) =>
      r.method === 'POST'
        ? { status: 201, body: purchase({ lines: [], totalOre: 45_000 }) }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/budsjett/kjop/ny');
    await user.click(await screen.findByLabelText('Bare totalsum'));
    expect(screen.queryByLabelText('Hva')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Totalsum'), '450');
    await user.click(screen.getByRole('button', { name: 'Lagre kjøpet' }));
    await screen.findByText('Kjøpet er registrert.');
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      totalOre: 45_000,
      lines: [],
    });
  });

  it('a server field error (date in the future) is shown on the field', async () => {
    mockApi((r) =>
      r.method === 'POST'
        ? {
            status: 400,
            body: {
              error: {
                code: 'errors.validation',
                fields: { purchasedOn: 'validation.purchase.dateInFuture' },
              },
            },
          }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/budsjett/kjop/ny');
    await user.click(await screen.findByLabelText('Bare totalsum'));
    await user.type(screen.getByLabelText('Totalsum'), '10');
    await user.click(screen.getByRole('button', { name: 'Lagre kjøpet' }));
    expect(await screen.findByLabelText('Kjøpsdato')).toHaveAccessibleDescription(
      /kan ikke være frem i tid/,
    );
  });
});

describe('FR-BUD-005 one purchase: correct and delete', () => {
  const linked = purchase({
    storeName: 'Coop',
    lines: [
      line('Lettmelk', {
        batch: { id: 'b1', itemId: 'i1', itemName: 'Lettmelk', untouched: true },
      }),
      line('Kjøttdeig', {
        categoryKey: 'meat',
        amountOre: 5990,
        batch: { id: 'b2', itemId: 'i2', itemName: 'Kjøttdeig', untouched: false },
      }),
      line('Oppvask', { kind: 'nonFood', categoryKey: null, amountOre: 3990 }),
    ],
  });
  const answer = (r: { method: string; path: string }) =>
    r.method === 'GET' && r.path === `${H}/purchases/${linked.id}`
      ? { status: 200, body: linked }
      : undefined;

  it('shows the lines, what is in the inventory, and that non-food is not in the budget', async () => {
    mockApi(answer);
    const { container } = renderApp(`/budsjett/kjop/${linked.id}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Coop' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I matlageret: Lettmelk' })).toHaveAttribute(
      'href',
      '/matlager/i1',
    );
    expect(screen.getByText('Ikke mat – teller ikke i matbudsjettet')).toBeInTheDocument();
    expect(screen.getByText(/Sum: 124,70/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('delete: says what happens to the inventory; unticking keeps the untouched item', async () => {
    const requests = mockApi((r) =>
      r.method === 'DELETE'
        ? { status: 200, body: { removedBatches: 0, keptBatches: 2 } }
        : answer(r),
    );
    const user = userEvent.setup();
    const { router } = renderApp(`/budsjett/kjop/${linked.id}`);
    await user.click(await screen.findByRole('button', { name: 'Slett kjøpet' }));
    const dialog = screen.getByRole('dialog', { name: 'Slette kjøpet?' });
    const box = within(dialog).getByLabelText('Fjern også 1 urørt vare fra matlageret');
    expect(box).toBeChecked();
    expect(within(dialog).getByText(/1 vare fra kjøpet er brukt eller endret/)).toBeInTheDocument();
    await user.click(box);
    await user.click(within(dialog).getByRole('button', { name: 'Slett kjøpet' }));
    expect(await screen.findByText('Kjøpet er slettet.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'DELETE')?.path).toBe(
      `${H}/purchases/${linked.id}?removeUntouchedBatches=false`,
    );
    expect(router.state.location.search).toBe('?maned=2026-10');
  });

  it('a purchase that does not exist (or is another household’s) shows "Fant ikke kjøpet"', async () => {
    mockApi((r) =>
      r.path.startsWith(`${H}/purchases/`)
        ? { status: 404, body: { error: { code: 'errors.notFound' } } }
        : undefined,
    );
    renderApp('/budsjett/kjop/0199f0a0-0000-7000-8000-0000000000ff');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fant ikke kjøpet' }),
    ).toBeInTheDocument();
  });

  it('correct: the form opens with the saved values; removing a linked line offers to keep its item', async () => {
    const requests = mockApi((r) =>
      r.method === 'PUT' ? { status: 200, body: linked } : answer(r),
    );
    const user = userEvent.setup();
    renderApp(`/budsjett/kjop/${linked.id}/rett`);
    const first = await screen.findByRole('group', { name: 'Linje 1' });
    expect(within(first).getByLabelText('Beløp')).toHaveValue('24,90');
    expect(within(first).getByText('Lagt i matlageret som «Lettmelk»')).toBeInTheDocument();
    expect(within(first).queryByLabelText('Legg i matlageret')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Fjern også urørte varer/)).not.toBeInTheDocument();

    await user.clear(within(first).getByLabelText('Beløp'));
    await user.type(within(first).getByLabelText('Beløp'), '29,90');
    await user.click(screen.getByRole('button', { name: 'Fjern linje 2' }));
    const keep = screen.getByLabelText(/Fjern også urørte varer/);
    await user.click(keep);
    await user.click(screen.getByRole('button', { name: 'Lagre' }));
    expect(await screen.findByText('Kjøpet er oppdatert.')).toBeInTheDocument();
    expect(requests.find((r) => r.method === 'PUT')?.body).toEqual({
      storeName: 'Coop',
      purchasedOn: '2026-10-20',
      removeUntouchedBatches: false,
      lines: [
        {
          id: linked.lines[0]!.id,
          description: 'Lettmelk',
          kind: 'food',
          categoryKey: 'dairy',
          amountOre: 2990,
          toInventory: null,
        },
        {
          id: linked.lines[2]!.id,
          description: 'Oppvask',
          kind: 'nonFood',
          categoryKey: null,
          amountOre: 3990,
          toInventory: null,
        },
      ],
    });
  });
});
