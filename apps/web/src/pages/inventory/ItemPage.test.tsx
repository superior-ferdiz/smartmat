import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HistoryResponse } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { batch, inDays, item } from '../../test/inventoryFixtures';

const milk = item('Lettmelk', {
  batches: [
    batch({ expiryKind: 'use_by', expiryDate: inDays(-2), quantityBase: 1000, priceOre: 2490 }),
    batch({ expiryKind: 'best_before', expiryDate: inDays(-1), quantityBase: 500 }),
  ],
});

const history: HistoryResponse = {
  events: [
    {
      id: '0199f0a0-0000-7000-8000-0000000e0002',
      type: 'consume',
      deltaBase: -250,
      batchId: milk.batches[0]!.id,
      fromLocationId: null,
      toLocationId: null,
      actorName: 'Kari',
      createdAt: '2026-10-21T08:15:00.000Z',
      revertsEventId: null,
      revertedType: null,
      wasteReason: null,
      wasteValueOre: null,
      wasteValueBasis: null,
      undone: false,
    },
    {
      id: '0199f0a0-0000-7000-8000-0000000e0001',
      type: 'discard',
      deltaBase: -250,
      batchId: milk.batches[0]!.id,
      fromLocationId: null,
      toLocationId: null,
      actorName: null,
      createdAt: '2026-10-20T08:15:00.000Z',
      revertsEventId: null,
      revertedType: null,
      wasteReason: 'spoiled',
      wasteValueOre: 623,
      wasteValueBasis: 'estimated',
      undone: true,
    },
  ],
  undoableEventId: '0199f0a0-0000-7000-8000-0000000e0002',
};

function api(
  extra: (r: RecordedRequest) => { status: number; body?: unknown } | undefined = () => undefined,
) {
  return mockApi((r) => {
    const own = extra(r);
    if (own) return own;
    if (r.method === 'GET' && r.path.endsWith(`/items/${milk.id}`))
      return { status: 200, body: milk };
    if (r.method === 'GET' && r.path.endsWith('/history')) return { status: 200, body: history };
    return undefined;
  });
}

/** After a change the page refetches, so the last request is a GET; this finds the change itself. */
function lastPost<T extends { method: string }>(requests: T[]): T | undefined {
  return requests.filter((r) => r.method === 'POST').at(-1);
}

describe('FR-INV-002/005 item page', () => {
  it('shows each batch with amount, place and worded expiry – different for use by and best before', async () => {
    api();
    const { container } = renderApp(`/matlager/${milk.id}`);
    const first = await screen.findByRole('region', { name: 'Parti 1' });
    expect(within(first).getByText('Siste forbruksdag passert')).toBeInTheDocument();
    expect(
      within(first).getByText('Bør ikke spises. Siste forbruksdag handler om mattrygghet.'),
    ).toBeInTheDocument();
    const second = screen.getByRole('region', { name: 'Parti 2' });
    expect(within(second).getByText('Best før passert')).toBeInTheDocument();
    expect(within(second).getByText('Ofte fortsatt god. Se, lukt og smak.')).toBeInTheDocument();
    // Never suggests eating food past its use-by date.
    expect(within(first).queryByText(/Se, lukt og smak/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('unknown item → "Fant ikke varen"', async () => {
    mockApi((r) =>
      r.path.includes('/items/')
        ? { status: 404, body: { error: { code: 'errors.notFound' } } }
        : undefined,
    );
    renderApp('/matlager/0199f0a0-0000-7000-8000-000000000999');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fant ikke varen' }),
    ).toBeInTheDocument();
  });
});

describe('FR-INV-006 consume in a dialog', () => {
  it('"Alt" sends the whole batch; a part is converted from dl to ml', async () => {
    const requests = api((r) => (r.method === 'POST' ? { status: 200, body: milk } : undefined));
    const user = userEvent.setup();
    renderApp(`/matlager/${milk.id}`);
    const first = await screen.findByRole('region', { name: 'Parti 1' });

    await user.click(within(first).getByRole('button', { name: 'Bruk' }));
    let dialog = screen.getByRole('dialog', { name: 'Bruk Lettmelk' });
    await user.click(within(dialog).getByRole('button', { name: 'Registrer bruk' }));
    expect(lastPost(requests)).toMatchObject({
      path: expect.stringMatching(/\/consume$/),
      body: { quantityBase: 1000 },
    });

    await user.click(within(first).getByRole('button', { name: 'Bruk' }));
    dialog = screen.getByRole('dialog', { name: 'Bruk Lettmelk' });
    await user.click(within(dialog).getByLabelText(/^Alt/));
    await user.clear(within(dialog).getByLabelText('Mengde'));
    await user.type(within(dialog).getByLabelText('Mengde'), '2,5');
    await user.selectOptions(within(dialog).getByLabelText('Enhet'), 'dl');
    await user.click(within(dialog).getByRole('button', { name: 'Registrer bruk' }));
    expect(lastPost(requests)?.body).toEqual({ quantityBase: 250 });
  });

  it('more than is left is refused before sending', async () => {
    const requests = api();
    const user = userEvent.setup();
    renderApp(`/matlager/${milk.id}`);
    const second = await screen.findByRole('region', { name: 'Parti 2' });
    await user.click(within(second).getByRole('button', { name: 'Bruk' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText(/^Alt/));
    await user.clear(within(dialog).getByLabelText('Mengde'));
    await user.type(within(dialog).getByLabelText('Mengde'), '600');
    await user.click(within(dialog).getByRole('button', { name: 'Registrer bruk' }));
    expect(within(dialog).getByLabelText('Mengde')).toHaveAccessibleDescription(
      /ikke så mye igjen/,
    );
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });
});

describe('FR-INV-007 discard in a dialog', () => {
  it('needs a reason; sends the actual value when given', async () => {
    const requests = api((r) => (r.method === 'POST' ? { status: 200, body: milk } : undefined));
    const user = userEvent.setup();
    renderApp(`/matlager/${milk.id}`);
    const first = await screen.findByRole('region', { name: 'Parti 1' });
    await user.click(within(first).getByRole('button', { name: 'Kast' }));
    const dialog = screen.getByRole('dialog', { name: 'Kast Lettmelk' });
    expect(within(dialog).getByLabelText(/Verdi/)).toHaveAccessibleDescription(
      /anslås verdien ut fra prisen/,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Registrer kassering' }));
    expect(within(dialog).getByLabelText(/Hvorfor/)).toHaveAccessibleDescription(/Velg hvorfor/);

    await user.selectOptions(within(dialog).getByLabelText(/Hvorfor/), 'Ødelagt eller muggen');
    await user.type(within(dialog).getByLabelText(/Verdi/), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Registrer kassering' }));
    expect(lastPost(requests)).toMatchObject({
      path: expect.stringMatching(/\/discard$/),
      body: { quantityBase: 1000, reason: 'spoiled', valueOre: 2000 },
    });
  });
});

describe('FR-INV-008 history and undo', () => {
  it('shows what happened, who and the waste value; undone events are marked', async () => {
    api();
    renderApp(`/matlager/${milk.id}`);
    const section = await screen.findByRole('region', { name: 'Historikk' });
    const entries = await within(section).findAllByRole('listitem');
    expect(entries[0]).toHaveTextContent('Brukte 250 ml');
    expect(entries[0]).toHaveTextContent('Kari');
    expect(entries[1]).toHaveTextContent('Kastet 250 ml (Ødelagt eller muggen)');
    expect(entries[1]).toHaveTextContent('anslått verdi 6,23 kr');
    expect(entries[1]).toHaveTextContent('Slettet bruker');
    expect(within(entries[1]!).getByText('Angret')).toBeInTheDocument();
  });

  it('"Angre siste endring" calls undo; an error from the API is shown', async () => {
    const requests = api((r) =>
      r.path.endsWith('/undo')
        ? { status: 409, body: { error: { code: 'errors.inventory.cannotUndo' } } }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp(`/matlager/${milk.id}`);
    await user.click(await screen.findByRole('button', { name: 'Angre siste endring' }));
    expect(await screen.findByText('Endringen kan ikke angres lenger.')).toBeInTheDocument();
    expect(
      requests.some((r) => r.method === 'POST' && r.path.endsWith(`/items/${milk.id}/undo`)),
    ).toBe(true);
  });
});
