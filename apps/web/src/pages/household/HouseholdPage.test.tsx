import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HouseholdMemberResponse, SessionResponse } from '@smartmat/shared';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi, TEST_HOUSEHOLD, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';

/* Spec 10 in the browser: the household page for an owner and a member, and what happens on leaving. */

afterEach(() => {
  vi.restoreAllMocks();
});

const H = TEST_SESSION.user.householdId;
const OTHER = '0199f0a0-0000-7000-8000-0000000000b2';
const OLA = '0199f0a0-0000-7000-8000-0000000000c1';
const TOKEN = 'abcdefghijABCDEFGHIJ0123456789-_abcdefghijk';

const kari: HouseholdMemberResponse = {
  userId: TEST_SESSION.user.id,
  displayName: 'Kari',
  role: 'owner',
  joinedAt: '2026-10-01T10:00:00.000Z',
  isYou: true,
};
const ola: HouseholdMemberResponse = {
  userId: OLA,
  displayName: 'Ola',
  role: 'member',
  joinedAt: '2026-10-24T10:00:00.000Z',
  isYou: false,
};

const asMember: SessionResponse = {
  ...TEST_SESSION,
  user: {
    ...TEST_SESSION.user,
    householdRole: 'member',
    households: [
      { id: OTHER, name: 'Ola', role: 'owner' },
      { id: H, name: 'Familien', role: 'member' },
    ],
  },
};

function api(members: HouseholdMemberResponse[], extra?: (r: RecordedRequest) => unknown) {
  return mockApi((r) => {
    const answer = extra?.(r);
    if (answer) return answer as { status: number; body?: unknown };
    if (r.method === 'GET' && r.path === `/households/${H}/members`)
      return { status: 200, body: { members } };
    if (r.method === 'GET' && r.path === `/households/${H}/invitations`)
      return { status: 200, body: { invitations: [] } };
    if (r.method === 'GET' && r.path === `/households/${H}`)
      return {
        status: 200,
        body: { ...TEST_HOUSEHOLD, name: 'Familien', memberCount: members.length },
      };
    return undefined;
  });
}

const card = (name: string) => screen.getByRole('region', { name });

describe('FR-HH-003 owner view', () => {
  it('alone: says so, offers an invitation, and has no axe violations', async () => {
    api([kari]);
    const { container } = renderApp('/husholdning');
    expect(await screen.findByText('Du er alene i husholdningen')).toBeInTheDocument();
    expect(
      within(card('Inviter')).getByRole('button', { name: 'Lag invitasjonslenke' }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Slett husholdningen' })).toBeInTheDocument();
    // The owner cannot leave without transferring.
    expect(within(card('Forlat husholdningen')).queryByRole('button')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('FR-HH-001: makes a link with the token in the fragment and copies it', async () => {
    const requests = api([kari], (r) =>
      r.method === 'POST' && r.path === `/households/${H}/invitations`
        ? {
            status: 201,
            body: {
              token: TOKEN,
              invitation: {
                id: '0199f0a0-0000-7000-8000-0000000000d1',
                createdAt: '2026-10-24T10:00:00.000Z',
                expiresAt: '2026-10-26T10:00:00.000Z',
                status: 'active',
                usedBy: null,
              },
            },
          }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/husholdning');
    await user.click(await screen.findByRole('button', { name: 'Lag invitasjonslenke' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invitasjonslenken er klar' });
    const link = within(dialog).getByLabelText('Invitasjonslenke');
    expect(link).toHaveValue(`${window.location.origin}/bli-med#${TOKEN}`);
    expect(link).toHaveAttribute('readonly');
    await user.click(within(dialog).getByRole('button', { name: 'Kopier lenken' }));
    // user-event replaces navigator.clipboard with its own stub, so the copied text can be read back.
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/bli-med#${TOKEN}`);
    expect(await screen.findByText('Lenken er kopiert.')).toBeInTheDocument();
    // The token is never in a URL the app requests.
    expect(requests.every((r) => !r.path.includes(TOKEN))).toBe(true);
  });

  it('removes a member after confirming', async () => {
    const requests = api([kari, ola], (r) =>
      r.method === 'DELETE' && r.path === `/households/${H}/members/${OLA}`
        ? { status: 204 }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/husholdning');
    await user.click(await screen.findByRole('button', { name: 'Fjern Ola' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fjerne Ola?' });
    await user.click(within(dialog).getByRole('button', { name: 'Fjern fra husholdningen' }));
    expect(await screen.findByText('Ola er fjernet fra husholdningen.')).toBeInTheDocument();
    expect(requests.filter((r) => r.method === 'DELETE')).toHaveLength(1);
  });

  it('transfer: validates with the shared schema before asking the server', async () => {
    const requests = api([kari, ola]);
    const user = userEvent.setup();
    renderApp('/husholdning');
    const transfer = await screen.findByRole('region', { name: 'Overfør eierskapet' });
    await user.click(within(transfer).getByRole('button', { name: 'Overfør eierskapet' }));
    expect(await within(transfer).findAllByText('Velg et medlem.')).not.toHaveLength(0);
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });
});

describe('FR-HH-003 member view', () => {
  it('no owner actions, can leave, and sees the switcher', async () => {
    api([
      { ...kari, role: 'member' },
      { ...ola, role: 'owner' },
    ]);
    renderApp('/husholdning', { session: asMember });
    expect(await screen.findByText('Bare eieren kan invitere nye medlemmer.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lag invitasjonslenke' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Slett husholdningen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fjern/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forlat husholdningen' })).toBeVisible();
    // FR-HH-004: the active one is marked, the other can be chosen; the bar says which is active.
    const switcher = card('Dine husholdninger');
    expect(within(switcher).getByText('Aktiv')).toBeInTheDocument();
    expect(within(switcher).getByRole('button', { name: 'Bruk Ola' })).toBeVisible();
    expect(screen.getByText('Husholdning: Familien')).toBeInTheDocument();
  });

  it('FR-HH-005: leaving drops the household from the cache and says so', async () => {
    let left = false;
    const after: SessionResponse = {
      ...asMember,
      user: {
        ...asMember.user,
        householdId: OTHER,
        householdRole: 'owner',
        households: [{ id: OTHER, name: 'Ola', role: 'owner' }],
      },
    };
    api(
      [
        { ...kari, role: 'member' },
        { ...ola, role: 'owner' },
      ],
      (r) => {
        if (r.method === 'POST' && r.path === `/households/${H}/leave`) {
          left = true;
          return { status: 204 };
        }
        if (r.path === '/auth/session') return { status: 200, body: left ? after : asMember };
        if (r.method === 'GET' && r.path === `/households/${OTHER}`)
          return { status: 200, body: { ...TEST_HOUSEHOLD, id: OTHER, name: 'Ola' } };
        return undefined;
      },
    );
    const user = userEvent.setup();
    const { router, queryClient } = renderApp('/husholdning', { session: asMember });
    await user.click(await screen.findByRole('button', { name: 'Forlat husholdningen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Forlate Familien?' });
    await user.click(within(dialog).getByRole('button', { name: 'Ja, forlat husholdningen' }));
    expect(await screen.findByText('Du er ikke lenger medlem av Familien.')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(queryClient.getQueryCache().findAll({ queryKey: ['household', H] })).toHaveLength(0);
  });

  it('a 404 from the household (removed elsewhere) refetches the session', async () => {
    let removed = false;
    const after: SessionResponse = {
      ...asMember,
      user: {
        ...asMember.user,
        householdId: OTHER,
        householdRole: 'owner',
        households: [{ id: OTHER, name: 'Ola', role: 'owner' }],
      },
    };
    api([], (r) => {
      if (r.path === '/auth/session') return { status: 200, body: removed ? after : asMember };
      if (r.path.startsWith(`/households/${H}`) && removed)
        return { status: 404, body: { error: { code: 'errors.notFound' } } };
      if (r.method === 'GET' && r.path.startsWith(`/households/${OTHER}`)) return undefined;
      return undefined;
    });
    const { queryClient } = renderApp('/handleliste', { session: asMember });
    await screen.findByRole('heading', { level: 1 });
    removed = true;
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['household', H] });
    });
    expect(await screen.findByText('Du er ikke lenger medlem av Familien.')).toBeInTheDocument();
  });
});
