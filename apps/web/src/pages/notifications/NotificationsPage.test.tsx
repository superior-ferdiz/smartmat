import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NotificationResponse, NotificationsResponse } from '@smartmat/shared';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';

const H = `/households/${TEST_SESSION.user.householdId}`;
const ITEM = '0199f0a0-0000-7000-8000-0000000000aa';

function expiry(kind: NotificationResponse['kind'], name: string, daysLeft: number, seen = false) {
  return {
    kind,
    key: `${kind}:${name}`,
    itemId: ITEM,
    itemName: name,
    expiryDate: '2026-10-26',
    daysLeft,
    seen,
  } as NotificationResponse;
}

/** Answers GET /notifications with `items`, and dismissals by removing the item. */
function serve(initial: NotificationResponse[]) {
  let items = initial;
  const requests = mockApi((r: RecordedRequest) => {
    if (r.method === 'GET' && r.path === `${H}/notifications`) {
      const body: NotificationsResponse = {
        items,
        unseenCount: items.filter((n) => !n.seen).length,
      };
      return { status: 200, body };
    }
    if (r.method === 'POST' && r.path === `${H}/notifications/seen`) {
      const keys = (r.body as { keys: string[] }).keys;
      items = items.map((n) => (keys.includes(n.key) ? { ...n, seen: true } : n));
      return { status: 200, body: { marked: keys.length } };
    }
    if (r.method === 'POST' && r.path === `${H}/notifications/dismiss`) {
      const { key } = r.body as { key: string };
      items = items.filter((n) => n.key !== key);
      return { status: 204 };
    }
    return undefined;
  });
  return requests;
}

describe('FR-NOTIF-001 wording: use by and best before are different', () => {
  it('says use by tomorrow / today / passed, best before with "se, lukt og smak", and never more', async () => {
    serve([
      expiry('useByPassed', 'Laks', -1),
      expiry('useByToday', 'Kjøttdeig', 0),
      expiry('useBySoon', 'Kyllingfilet', 1),
      expiry('bestBeforeSoon', 'Lettmelk', 3),
    ]);
    const { container } = renderApp('/varsler');
    const list = await screen.findByRole('list', { name: 'Varsler' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual([
      'Siste forbruksdag for Laks er passert',
      'Kjøttdeig har siste forbruksdag i dag',
      'Kyllingfilet har siste forbruksdag i morgen',
      'Lettmelk er best før om 3 dager',
    ]);
    expect(within(rows[0]!).getByText(/Bør ikke spises/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Etter i dag bør den ikke spises.')).toBeInTheDocument();
    expect(within(rows[3]!).getByText(/Se, lukt og smak/)).toBeInTheDocument();
    // "Se, lukt og smak" is only said about best before.
    for (const row of rows.slice(0, 3)) {
      expect(row.textContent).not.toMatch(/smak|fortsatt god|kan spises/i);
    }
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', `/matlager/${ITEM}`);
    await expectNoAxeViolations(container);
  });

  it('names the budget month and the shopping list adder, never a former member', async () => {
    serve([
      {
        kind: 'budgetNearlyUsed',
        key: 'budget:2026-10:80',
        month: '2026-10',
        usedPercent: 85,
        seen: false,
      },
      {
        kind: 'shoppingAdded',
        key: 'shopping:1',
        count: 5,
        texts: ['Brød', 'Egg', 'Melk'],
        addedBy: [{ kind: 'former', displayName: null }],
        latestAt: '2026-10-25T10:00:00.000Z',
        seen: false,
      },
    ]);
    renderApp('/varsler');
    expect(
      await screen.findByRole('link', { name: '85 % av matbudsjettet for oktober 2026 er brukt' }),
    ).toHaveAttribute('href', '/budsjett');
    expect(
      screen.getByRole('link', {
        name: 'Et tidligere medlem la til Brød, Egg, Melk og 2 til på handlelisten',
      }),
    ).toHaveAttribute('href', '/handleliste');
  });
});

describe('FR-NOTIF-004 seen and dismissed', () => {
  it('marks what it shows as seen, but keeps the "Nytt" label while the page is open', async () => {
    const requests = serve([
      expiry('useBySoon', 'Kyllingfilet', 1),
      expiry('bestBeforeToday', 'Melk', 0, true),
    ]);
    renderApp('/varsler');
    await screen.findByRole('list', { name: 'Varsler' });
    await waitFor(() =>
      expect(requests.filter((r) => r.path.endsWith('/notifications/seen'))).toHaveLength(1),
    );
    const seen = requests.find((r) => r.path.endsWith('/notifications/seen'));
    expect(seen?.body).toEqual({ keys: ['useBySoon:Kyllingfilet'] });
    // After the refetch the server says "seen"; the label stays for this visit.
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Varsler' })).not.toHaveLength(0),
    );
    expect(screen.getAllByText('Nytt')).toHaveLength(1);
  });

  it('"Avvis" removes it, says so, and keeps the keyboard in the list', async () => {
    const user = userEvent.setup();
    const requests = serve([
      expiry('useBySoon', 'Kyllingfilet', 1),
      expiry('useByToday', 'Laks', 0),
    ]);
    renderApp('/varsler');
    const button = await screen.findByRole('button', {
      name: 'Avvis varselet: Kyllingfilet har siste forbruksdag i morgen',
    });
    await user.click(button);
    expect(await screen.findByText('Varselet er avvist')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Kyllingfilet/ })).not.toBeInTheDocument(),
    );
    expect(requests.find((r) => r.path.endsWith('/dismiss'))?.body).toEqual({
      key: 'useBySoon:Kyllingfilet',
    });
    expect(screen.getByRole('list', { name: 'Varsler' }).parentElement).toHaveFocus();
  });

  it('empty and error states', async () => {
    serve([]);
    const first = renderApp('/varsler');
    expect(await screen.findByRole('heading', { name: 'Ingen varsler nå' })).toBeInTheDocument();
    await expectNoAxeViolations(first.container);
    first.unmount();

    mockApi((r) =>
      r.path === `${H}/notifications`
        ? { status: 500, body: { error: { code: 'errors.internal' } } }
        : undefined,
    );
    renderApp('/varsler');
    expect(await screen.findByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument();
  });
});

describe('FR-NOTIF-004 the bell', () => {
  it('has the number in its name, and the live region speaks only when it goes up', async () => {
    let items: NotificationResponse[] = [expiry('useBySoon', 'Kyllingfilet', 1)];
    mockApi((r) =>
      r.method === 'GET' && r.path === `${H}/notifications`
        ? { status: 200, body: { items, unseenCount: items.length } }
        : undefined,
    );
    const { queryClient } = renderApp('/');
    const bells = await screen.findAllByRole('link', { name: 'Varsler, 1 nytt' });
    expect(bells.length).toBeGreaterThan(0);
    const live = document.querySelector('[aria-live="polite"][aria-atomic="true"]');
    expect(live?.textContent).toBe('');

    items = [...items, expiry('useByToday', 'Laks', 0)];
    await act(() => queryClient.refetchQueries({ queryKey: ['household'] }));
    expect(await screen.findAllByRole('link', { name: 'Varsler, 2 nye' })).not.toHaveLength(0);
    await waitFor(() => expect(live?.textContent).toBe('2 nye varsler'));
  });
});
