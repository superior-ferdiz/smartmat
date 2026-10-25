import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShoppingItemResponse } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { FRIDGE } from '../../test/inventoryFixtures';
import { shoppingItem } from '../../test/shoppingFixtures';

const RECIPE_ID = '0199f0a0-0000-7000-8000-00000000c001';

/** A fake server for the list: GET returns the current lines, and the handlers below change them. */
function serve(initial: ShoppingItemResponse[], handler?: (r: RecordedRequest) => unknown) {
  let items = [...initial];
  const requests = mockApi((r) => {
    const custom = handler?.(r) as { status: number; body?: unknown } | undefined;
    if (custom) return custom;
    if (r.method === 'GET' && r.path.endsWith('/shopping-list'))
      return { status: 200, body: { items } };
    const itemId = /\/items\/([^/]+)$/.exec(r.path)?.[1];
    if (r.method === 'PATCH' && itemId) {
      const body = r.body as Partial<ShoppingItemResponse>;
      items = items.map((i) =>
        i.id === itemId
          ? {
              ...i,
              ...body,
              ...(body.checked !== undefined
                ? { checkedAt: body.checked ? '2026-10-21T10:00:00.000Z' : null }
                : {}),
            }
          : i,
      );
      return { status: 200, body: items.find((i) => i.id === itemId) };
    }
    if (r.method === 'DELETE' && itemId) {
      items = items.filter((i) => i.id !== itemId);
      return { status: 204 };
    }
    return undefined;
  });
  return { requests, set: (next: ShoppingItemResponse[]) => (items = next) };
}

const section = (name: RegExp) =>
  screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

describe('FR-SHOP-001 the list', () => {
  it('tells the server the list was seen (spec 11, FR-NOTIF-003)', async () => {
    const { requests } = serve([]);
    renderApp('/handleliste');
    await screen.findByRole('textbox', { name: 'Vare' });
    await waitFor(() =>
      expect(
        requests.some((r) => r.method === 'POST' && r.path.endsWith('/shopping-list/seen')),
      ).toBe(true),
    );
  });

  it('empty: says so, and links to the recipes', async () => {
    serve([]);
    renderApp('/handleliste');
    expect(await screen.findByRole('heading', { name: 'Handlelisten er tom' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se oppskrifter' })).toHaveAttribute(
      'href',
      '/oppskrifter',
    );
  });

  it('open lines first, checked ones after, with amounts and the recipes they came from', async () => {
    serve([
      shoppingItem('Egg', { checked: true, checkedAt: '2026-10-21T09:00:00.000Z' }),
      shoppingItem('Melk', {
        quantityBase: 1500,
        unit: 'ml',
        recipes: [{ recipeId: RECIPE_ID, title: 'Pannekaker', quantityBase: 500 }],
      }),
      shoppingItem('Tannkrem'),
    ]);
    const { container } = renderApp('/handleliste');
    const open = await screen.findByRole('heading', { name: 'Skal kjøpes (2)' });
    const openList = within(open.closest('section') as HTMLElement);
    expect(openList.getAllByRole('checkbox').map((c) => c.closest('li')?.textContent)).toEqual([
      expect.stringContaining('Melk'),
      expect.stringContaining('Tannkrem'),
    ]);
    expect(openList.getByText('1,5 l')).toBeInTheDocument();
    expect(openList.getByText('Pannekaker: 500 ml')).toBeInTheDocument();
    expect(within(section(/Huket av/)).getByRole('checkbox', { name: 'Egg' })).toBeChecked();
    await expectNoAxeViolations(container);
  });

  it('quick add: Enter sends text, amount in base units and a request id; the field is ready again', async () => {
    const user = userEvent.setup();
    const { requests } = serve([], (r) =>
      r.method === 'POST' && r.path.endsWith('/items')
        ? {
            status: 201,
            body: {
              item: shoppingItem('Mel', { quantityBase: 1500, unit: 'g' }),
              similarItemId: null,
            },
          }
        : undefined,
    );
    renderApp('/handleliste');
    const text = await screen.findByRole('textbox', { name: 'Vare' });
    await user.type(screen.getByRole('textbox', { name: /Mengde/ }), '1,5');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Enhet' }), 'kg');
    await user.type(text, 'Mel{Enter}');

    await waitFor(() => expect(text).toHaveValue(''));
    const post = requests.find((r) => r.method === 'POST' && r.path.endsWith('/items'));
    expect(post?.body).toEqual({
      text: 'Mel',
      quantity: { quantityBase: 1500, unit: 'g' },
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(text).toHaveFocus();
    expect(screen.getByText('Mel er lagt til.')).toBeInTheDocument();
  });

  it('quick add: an empty text is stopped in the browser, with the message on the field', async () => {
    const user = userEvent.setup();
    const { requests } = serve([]);
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Legg til' }));
    expect(screen.getByText('Skriv inn hva du skal kjøpe.')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST' && r.path.endsWith('/items'))).toBe(false);
  });
});

describe('FR-SHOP-001 ticking off (optimistic, KURS-03 delegated events)', () => {
  it('the line moves to "Huket av" before the server has answered, and PATCH sets checked', async () => {
    const user = userEvent.setup();
    const melk = shoppingItem('Melk');
    const { requests } = serve([melk, shoppingItem('Egg')]);
    // Hold the PATCH back until the test lets it go, to see the screen in between.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.mocked(globalThis.fetch);
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) => {
      if (init?.method === 'PATCH') await gate;
      return answer(input, init);
    });

    renderApp('/handleliste');
    await user.click(await screen.findByRole('checkbox', { name: 'Melk' }));

    await waitFor(() =>
      expect(within(section(/Huket av/)).getByRole('checkbox', { name: 'Melk' })).toBeChecked(),
    );
    expect(screen.getByRole('heading', { name: 'Skal kjøpes (1)' })).toBeInTheDocument();
    // Focus stays in the open list, on the row that took Melk's place.
    expect(screen.getByRole('checkbox', { name: 'Egg' })).toHaveFocus();
    expect(screen.getByText('Melk er huket av.')).toBeInTheDocument();
    release();
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')).toMatchObject({
        path: expect.stringContaining(`/items/${melk.id}`),
        body: { checked: true },
      }),
    );
  });

  it('if the server refuses, the line goes back and the user is told', async () => {
    const user = userEvent.setup();
    let gets = 0;
    serve([shoppingItem('Melk')], (r) => {
      if (r.method === 'PATCH')
        return { status: 500, body: { error: { code: 'errors.internal' } } };
      // The refetch after the error fails too, so only the rollback itself can restore the line.
      if (r.method === 'GET' && r.path.endsWith('/shopping-list') && ++gets > 1)
        return { status: 500, body: { error: { code: 'errors.internal' } } };
      return undefined;
    });
    renderApp('/handleliste');
    await user.click(await screen.findByRole('checkbox', { name: 'Melk' }));
    expect(await screen.findByText('Kunne ikke lagre avhukingen. Prøv igjen.')).toBeInTheDocument();
    await waitFor(() => expect(gets).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Melk' })).not.toBeChecked());
    expect(screen.getByRole('heading', { name: 'Skal kjøpes (1)' })).toBeInTheDocument();
  });

  it('unticking a checked line sends checked: false', async () => {
    const user = userEvent.setup();
    const egg = shoppingItem('Egg', { checked: true, checkedAt: '2026-10-21T09:00:00.000Z' });
    const { requests } = serve([egg]);
    renderApp('/handleliste');
    await user.click(await screen.findByRole('checkbox', { name: 'Egg' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ checked: false }),
    );
    expect(await screen.findByRole('heading', { name: 'Skal kjøpes (1)' })).toBeInTheDocument();
  });

  it('remove: DELETE, and focus moves to the next row', async () => {
    const user = userEvent.setup();
    const melk = shoppingItem('Melk');
    const { requests } = serve([melk, shoppingItem('Egg')]);
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Fjern Melk' }));
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Melk' })).not.toBeInTheDocument(),
    );
    expect(requests.find((r) => r.method === 'DELETE')?.path).toContain(`/items/${melk.id}`);
    expect(screen.getByRole('checkbox', { name: 'Egg' })).toHaveFocus();
    expect(screen.getByText('Melk er fjernet.')).toBeInTheDocument();
  });

  it('removing the last line moves focus to the quick-add field', async () => {
    const user = userEvent.setup();
    serve([shoppingItem('Melk')]);
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Fjern Melk' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Vare' })).toHaveFocus());
  });

  it('edit: corrects text and amount, and an empty amount clears it', async () => {
    const user = userEvent.setup();
    const melk = shoppingItem('Melk', { quantityBase: 1000, unit: 'ml' });
    const { requests } = serve([melk]);
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Endre Melk' }));
    const dialog = screen.getByRole('dialog', { name: 'Endre linje' });
    const amount = within(dialog).getByRole('textbox', { name: /Mengde/ });
    expect(amount).toHaveValue('1');
    expect(within(dialog).getByRole('combobox', { name: 'Enhet' })).toHaveValue('l');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Vare' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Vare' }), 'Lettmelk');
    await user.clear(amount);
    await user.click(within(dialog).getByRole('button', { name: 'Lagre' }));
    await waitFor(() =>
      expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({
        text: 'Lettmelk',
        quantity: null,
      }),
    );
  });

  it('"Fjern avhukede" asks first, then clears', async () => {
    const user = userEvent.setup();
    const { requests, set } = serve(
      [shoppingItem('Egg', { checked: true, checkedAt: '2026-10-21T09:00:00.000Z' })],
      (r) =>
        r.path.endsWith('/clear-checked') ? { status: 200, body: { removed: 1 } } : undefined,
    );
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Fjern avhukede' }));
    const dialog = screen.getByRole('dialog', { name: 'Fjerne avhukede linjer?' });
    expect(within(dialog).getByText(/1 avhuket linje fjernes/)).toBeInTheDocument();
    set([]);
    await user.click(within(dialog).getByRole('button', { name: 'Fjern' }));
    expect(await screen.findByText('1 linje er fjernet.')).toBeInTheDocument();
    expect(requests.some((r) => r.path.endsWith('/clear-checked'))).toBe(true);
  });
});

describe('FR-SHOP-003 into the inventory', () => {
  it('confirms item, amount, place and date, and sends one request', async () => {
    const user = userEvent.setup();
    const melk = shoppingItem('Melk', {
      checked: true,
      checkedAt: '2026-10-21T09:00:00.000Z',
      quantityBase: 1000,
      unit: 'ml',
    });
    const { requests } = serve([melk], (r) =>
      r.path.endsWith('/to-inventory')
        ? { status: 200, body: { added: 1, itemIds: ['0199f0a0-0000-7000-8000-00000000a001'] } }
        : undefined,
    );
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Legg i matlageret' }));
    const dialog = screen.getByRole('dialog', { name: 'Legg i matlageret' });
    const line = within(await within(dialog).findByRole('group', { name: 'Melk' }));
    expect(line.getByRole('combobox', { name: 'Vare i matlageret' })).toHaveValue('new');
    expect(line.getByRole('textbox', { name: 'Navn på ny vare' })).toHaveValue('Melk');
    expect(line.getByRole('textbox', { name: 'Mengde' })).toHaveValue('1');
    await user.selectOptions(line.getByRole('combobox', { name: 'Dato' }), 'use_by');
    await user.type(line.getByLabelText('Dato', { selector: 'input' }), '2026-10-25');
    expect(within(dialog).getByText(/registreres ikke som et kjøp/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Legg i matlageret' }));

    expect(await screen.findByText('1 vare er lagt i matlageret.')).toBeInTheDocument();
    expect(requests.find((r) => r.path.endsWith('/to-inventory'))?.body).toEqual({
      lines: [
        {
          shoppingItemId: melk.id,
          target: { kind: 'new', name: 'Melk', categoryKey: 'other', unit: 'ml' },
          quantityBase: 1000,
          locationId: FRIDGE,
          expiry: { kind: 'use_by', date: '2026-10-25' },
        },
      ],
    });
  });

  it('a new item takes its unit from the amount: "0,5 kg" is sent as 500 g', async () => {
    const user = userEvent.setup();
    const ost = shoppingItem('Ost', { checked: true, checkedAt: '2026-10-21T09:00:00.000Z' });
    const { requests } = serve([ost], (r) =>
      r.path.endsWith('/to-inventory')
        ? { status: 200, body: { added: 1, itemIds: ['0199f0a0-0000-7000-8000-00000000a001'] } }
        : undefined,
    );
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Legg i matlageret' }));
    const line = within(await screen.findByRole('group', { name: 'Ost' }));
    // One unit field only (no separate "measured in" choice for a new item).
    expect(line.getAllByRole('combobox', { name: 'Enhet' })).toHaveLength(1);
    await user.type(line.getByRole('textbox', { name: 'Mengde' }), '0,5');
    await user.selectOptions(line.getByRole('combobox', { name: 'Enhet' }), 'kg');
    await user.click(
      within(screen.getByRole('dialog', { name: 'Legg i matlageret' })).getByRole('button', {
        name: 'Legg i matlageret',
      }),
    );
    await screen.findByText('1 vare er lagt i matlageret.');
    expect(requests.find((r) => r.path.endsWith('/to-inventory'))?.body).toMatchObject({
      lines: [{ target: { kind: 'new', unit: 'g' }, quantityBase: 500 }],
    });
  });

  it('a line that changed meanwhile shows the server message and keeps the dialog open', async () => {
    const user = userEvent.setup();
    serve(
      [
        shoppingItem('Melk', {
          checked: true,
          checkedAt: '2026-10-21T09:00:00.000Z',
          quantityBase: 1,
          unit: 'stk',
        }),
      ],
      (r) =>
        r.path.endsWith('/to-inventory')
          ? { status: 409, body: { error: { code: 'errors.shopping.changedMeanwhile' } } }
          : undefined,
    );
    renderApp('/handleliste');
    await user.click(await screen.findByRole('button', { name: 'Legg i matlageret' }));
    const dialog = screen.getByRole('dialog', { name: 'Legg i matlageret' });
    await within(dialog).findByRole('group', { name: 'Melk' });
    await user.click(within(dialog).getByRole('button', { name: 'Legg i matlageret' }));
    expect(
      await within(dialog).findByText(/Handlelisten ble endret i mellomtiden/),
    ).toBeInTheDocument();
  });
});

describe('spec 09 FR-PLAN-004 lines from the meal plan', () => {
  it('says which planned meal put what on the line', async () => {
    mockApi((r) =>
      r.path.endsWith('/shopping-list')
        ? {
            status: 200,
            body: {
              items: [
                shoppingItem('Lammekjøtt', {
                  quantityBase: 2500,
                  unit: 'g',
                  meals: [
                    {
                      entryId: '0199f0a0-0000-7000-8000-0000000000f1',
                      date: '2026-10-26',
                      meal: 'dinner',
                      title: 'Fårikål',
                      quantityBase: 1500,
                    },
                    {
                      entryId: '0199f0a0-0000-7000-8000-0000000000f2',
                      date: '2026-10-29',
                      meal: 'dinner',
                      title: 'Lammegryte',
                      quantityBase: 1000,
                    },
                  ],
                }),
              ],
            },
          }
        : undefined,
    );
    renderApp('/handleliste');
    expect(
      await screen.findByText(
        'Måltidsplan man. 26. okt.: Fårikål, 1,5 kg og Måltidsplan tor. 29. okt.: Lammegryte, 1 kg',
      ),
    ).toBeInTheDocument();
  });
});
