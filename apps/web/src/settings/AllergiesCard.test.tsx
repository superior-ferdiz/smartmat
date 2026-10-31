import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, TEST_SESSION } from '../test/renderApp';
import { mockApi, TEST_HOUSEHOLD, type RecordedRequest } from '../test/mockApi';
import { expectNoAxeViolations } from '../test/axe';
import { ingredient } from '../test/shoppingFixtures';

/*
 * Spec 16 (FR-ALG-001) in the browser: allergies and avoided foods in the settings, and the household sharing
 * that stays off until the user turns it on (decision 3).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

const kiwi = ingredient('Kiwi');
const egg = ingredient('Egg', { baseUnit: 'stk' });
const melk = ingredient('Melk', { baseUnit: 'ml' });

const changes = (requests: RecordedRequest[]) => requests.filter((r) => r.method !== 'GET');

function api(overrides: { avoided?: string[]; memberCount?: number; share?: boolean } = {}) {
  return mockApi((r) => {
    if (r.path === '/ingredients') return { status: 200, body: [melk, kiwi, egg] };
    if (r.path === '/me/allergens')
      return r.method === 'GET'
        ? { status: 200, body: { allergens: ['milk'] } }
        : { status: 200, body: r.body };
    if (r.path === '/me/avoided-ingredients') {
      const ids =
        r.method === 'GET'
          ? (overrides.avoided ?? [])
          : (r.body as { ingredientIds: string[] }).ingredientIds;
      const all = [egg, kiwi, melk];
      return {
        status: 200,
        body: {
          ingredients: all.filter((i) => ids.includes(i.id)).map(({ id, name }) => ({ id, name })),
        },
      };
    }
    if (r.path === `/households/${TEST_SESSION.user.householdId}` && r.method === 'GET')
      return {
        status: 200,
        body: {
          ...TEST_HOUSEHOLD,
          memberCount: overrides.memberCount ?? 1,
          shareAllergens: overrides.share ?? false,
        },
      };
    if (r.method === 'PATCH' && r.path.endsWith('/members/me'))
      return { status: 200, body: { ...TEST_HOUSEHOLD, memberCount: 2, shareAllergens: true } };
    return undefined;
  });
}

describe('FR-ALG-001 allergies and foods in the settings', () => {
  it('shows what is saved, adds and removes foods, and saves both lists', async () => {
    const requests = api({ avoided: [egg.id] });
    const user = userEvent.setup();
    const { container } = renderApp('/innstillinger');
    const section = await screen.findByRole('region', { name: 'Allergier og matvarer' });
    expect(await within(section).findByLabelText('melk')).toBeChecked();
    expect(within(section).getByText('Egg')).toBeInTheDocument();
    expect(
      within(section).getByText(/Det er frivillig, og slettes sammen med kontoen/),
    ).toBeInTheDocument();

    await user.selectOptions(within(section).getByLabelText(/Legg til en matvare/), 'Kiwi');
    await user.click(within(section).getByRole('button', { name: 'Legg til' }));
    await user.click(within(section).getByRole('button', { name: 'Fjern Egg' }));
    await user.click(within(section).getByLabelText('gluten'));
    await user.click(within(section).getByRole('button', { name: 'Lagre' }));

    expect(await screen.findByText('Allergiene er lagret')).toBeInTheDocument();
    expect(changes(requests).map((r) => [r.method, r.path, r.body])).toEqual([
      ['PUT', '/me/allergens', { allergens: ['gluten', 'milk'] }],
      ['PUT', '/me/avoided-ingredients', { ingredientIds: [kiwi.id] }],
    ]);
    await expectNoAxeViolations(container);
  });

  it('the food picker only offers foods that are not already chosen', async () => {
    api({ avoided: [kiwi.id] });
    renderApp('/innstillinger');
    const picker = await screen.findByLabelText(/Legg til en matvare/);
    const options = within(picker)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Velg matvare', 'Egg', 'Melk']);
  });
});

describe('spec 16 decision 3: sharing is the user’s own choice', () => {
  it('is off by default and is never sent on its own; it covers both allergens and foods', async () => {
    const requests = api({ memberCount: 2 });
    const user = userEvent.setup();
    renderApp('/innstillinger');
    const toggle = await screen.findByLabelText(
      'Ta hensyn til allergiene og matvarene mine i «Kari»',
    );
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/Gjelder både allergener og matvarer/)).toBeInTheDocument();
    expect(screen.getByText(/men ikke hvem som har registrert det/)).toBeInTheDocument();
    expect(changes(requests)).toEqual([]);

    await user.click(toggle);
    expect(
      await screen.findByText('Allergiene og matvarene dine deles nå med «Kari».'),
    ).toBeInTheDocument();
    const patch = changes(requests).find((r) => r.path.endsWith('/members/me'));
    expect(patch?.body).toEqual({ shareAllergens: true });
  });

  it('says the others get no warning when something is registered but not shared (shared household)', async () => {
    api({ memberCount: 2 });
    renderApp('/innstillinger');
    expect(
      await screen.findByText(/Det du har registrert, deles ikke med «Kari»/),
    ).toBeInTheDocument();
  });

  it('says nothing about it in a household of one, or when it is already shared', async () => {
    api({ memberCount: 1 });
    const { unmount } = renderApp('/innstillinger');
    await screen.findByLabelText('Ta hensyn til allergiene og matvarene mine i «Kari»');
    expect(screen.queryByText(/deles ikke med «Kari»/)).not.toBeInTheDocument();
    unmount();
    api({ memberCount: 2, share: true });
    renderApp('/innstillinger');
    expect(
      await screen.findByLabelText('Ta hensyn til allergiene og matvarene mine i «Kari»'),
    ).toBeChecked();
    expect(screen.queryByText(/deles ikke med «Kari»/)).not.toBeInTheDocument();
  });
});
