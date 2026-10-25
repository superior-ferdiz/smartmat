import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';

/* Spec 10 FR-HH-002: /bli-med#<token>. */

const TOKEN = 'abcdefghijABCDEFGHIJ0123456789-_abcdefghijk';
const preview = {
  householdName: 'Familien',
  invitedBy: 'Ola',
  memberCount: 2,
  expiresAt: '2026-10-26T10:00:00.000Z',
  alreadyMember: false,
};

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('FR-HH-002 join page', () => {
  it('reads the token from the fragment, removes it from the address, and previews', async () => {
    const requests = mockApi((r) =>
      r.path === '/invitations/preview' ? { status: 200, body: preview } : undefined,
    );
    const { router, container } = renderApp(`/bli-med#${TOKEN}`);
    expect(await screen.findByText('Ola inviterer deg til «Familien».')).toBeInTheDocument();
    expect(screen.getByText(/blir værende der/)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    const call = requests.find((r) => r.path === '/invitations/preview')!;
    expect(call.method).toBe('POST');
    expect(call.body).toEqual({ token: TOKEN });
    expect(requests.every((r) => !r.path.includes(TOKEN))).toBe(true);
    await expectNoAxeViolations(container);
  });

  it('nothing happens before "Bli med"; then it joins and forgets the token', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/invitations/preview') return { status: 200, body: preview };
      if (r.path === '/invitations/accept')
        return { status: 200, body: { householdId: '0199f0a0-0000-7000-8000-0000000000e1' } };
      return undefined;
    });
    const user = userEvent.setup();
    const { router } = renderApp(`/bli-med#${TOKEN}`);
    await screen.findByText('Ola inviterer deg til «Familien».');
    expect(requests.some((r) => r.path === '/invitations/accept')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Bli med' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(await screen.findByText('Du er nå med i Familien.')).toBeInTheDocument();
    expect(sessionStorage.getItem('smartmat.invitation')).toBeNull();
  });

  it('an invalid invitation says so with one message', async () => {
    mockApi((r) =>
      r.path === '/invitations/preview'
        ? { status: 404, body: { error: { code: 'errors.household.invitationInvalid' } } }
        : undefined,
    );
    renderApp(`/bli-med#${TOKEN}`);
    expect(await screen.findByText('Invitasjonen virker ikke')).toBeInTheDocument();
    expect(screen.getByText(/ugyldig, utløpt, trukket tilbake eller allerede brukt/)).toBeVisible();
  });

  it('logged out: keeps the token in this tab and links to login with the way back', async () => {
    const requests = mockApi(() => undefined);
    renderApp(`/bli-med#${TOKEN}`, { session: null });
    expect(await screen.findByText(/Logg inn eller lag en konto/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logg inn' })).toHaveAttribute(
      'href',
      '/logg-inn?neste=%2Fbli-med',
    );
    expect(sessionStorage.getItem('smartmat.invitation')).toBe(TOKEN);
    expect(requests.some((r) => r.path.startsWith('/invitations'))).toBe(false);
  });

  it('without a token: a pasted link is checked with the shared rule', async () => {
    mockApi((r) =>
      r.path === '/invitations/preview' ? { status: 200, body: preview } : undefined,
    );
    const user = userEvent.setup();
    renderApp('/bli-med');
    const field = await screen.findByLabelText('Invitasjonslenke');
    await user.type(field, 'https://example.test/bli-med');
    await user.click(screen.getByRole('button', { name: 'Åpne invitasjonen' }));
    expect(await screen.findByText('Dette er ikke en gyldig invitasjonslenke.')).toBeVisible();
    await user.clear(field);
    await user.type(field, `https://example.test/bli-med#${TOKEN}`);
    await user.click(screen.getByRole('button', { name: 'Åpne invitasjonen' }));
    expect(await screen.findByText('Ola inviterer deg til «Familien».')).toBeInTheDocument();
  });
});
