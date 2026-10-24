import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  MealEntryResponse,
  MealPlanNeedsResponse,
  RecipeListResponse,
} from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { recipeSummary } from '../../test/recipeFixtures';

/*
 * Spec 09 FR-PLAN-001–005 in the browser. "Today" is Saturday 24 October 2026 (week 43); week 44 is
 * 26 October – 1 November.
 */

const H = '0199f0a0-0000-7000-8000-000000000002';
const RECIPE = '0199f0a0-0000-7000-8000-0000000000a1';
let counter = 0;

function entry(overrides: Partial<MealEntryResponse> = {}): MealEntryResponse {
  counter++;
  return {
    id: `0199f0a0-0000-7000-8000-${String(counter).padStart(12, '9')}`,
    date: '2026-10-26',
    meal: 'dinner',
    kind: 'recipe',
    recipeId: RECIPE,
    recipeTitle: 'Fårikål',
    recipeServings: 4,
    servings: 4,
    note: null,
    allergenWarnings: [],
    createdAt: '2026-10-24T10:00:00.000Z',
    ...overrides,
  };
}

function emptyNeeds(from: string, to: string): MealPlanNeedsResponse {
  return { from, to, recipeEntryCount: 0, ingredients: [], suggestions: [], unplannedExpiring: [] };
}

interface Api {
  entries?: MealEntryResponse[];
  needs?: MealPlanNeedsResponse;
  recipes?: RecipeListResponse;
  onWrite?: (request: RecordedRequest) => { status: number; body?: unknown } | undefined;
}

function withApi({ entries = [], needs, recipes, onWrite }: Api = {}) {
  return mockApi((r) => {
    if (r.method !== 'GET') return onWrite?.(r) ?? { status: 200, body: entries[0] ?? {} };
    const plan = /^\/households\/[^/]+\/meal-plan(\/needs)?\?from=([\d-]+)&to=([\d-]+)$/.exec(
      r.path,
    );
    if (plan) {
      const [, isNeeds, from = '', to = ''] = plan;
      if (isNeeds) return { status: 200, body: needs ?? emptyNeeds(from, to) };
      return {
        status: 200,
        body: { from, to, entries: entries.filter((e) => e.date >= from && e.date <= to) },
      };
    }
    if (recipes && /\/recipes\?for=/.test(r.path)) return { status: 200, body: recipes };
    return undefined;
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-24T10:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

const dayCard = (name: RegExp) =>
  screen.getByRole('heading', { level: 3, name }).closest('li') as HTMLElement;

describe('FR-PLAN-001 the week', () => {
  it('shows Monday to Sunday with recipes, notes and removed recipes', async () => {
    withApi({
      entries: [
        entry({ allergenWarnings: ['milk'] }),
        entry({
          date: '2026-10-27',
          kind: 'note',
          recipeId: null,
          recipeTitle: null,
          recipeServings: null,
          servings: null,
          note: 'Rester',
        }),
        entry({ date: '2026-10-28', recipeId: null, recipeTitle: 'Gammel rett', servings: 2 }),
      ],
    });
    const { container } = renderApp('/maltidsplan?uke=2026-W44');
    expect(await screen.findByRole('heading', { level: 2, name: /Uke 44/ })).toBeInTheDocument();
    const days = (await screen.findAllByRole('heading', { level: 3 })).map((h) => h.textContent);
    expect(days).toEqual([
      'mandag 26. okt.',
      'tirsdag 27. okt.',
      'onsdag 28. okt.',
      'torsdag 29. okt.',
      'fredag 30. okt.',
      'lørdag 31. okt.',
      'søndag 1. nov.',
    ]);

    const monday = dayCard(/mandag 26/);
    expect(await within(monday).findByRole('link', { name: 'Fårikål' })).toHaveAttribute(
      'href',
      `/oppskrifter/${RECIPE}`,
    );
    expect(within(monday).getByText('4 porsjoner')).toBeInTheDocument();
    expect(within(monday).getByText('Inneholder melk')).toBeInTheDocument();
    expect(within(dayCard(/tirsdag 27/)).getByText('Rester')).toBeInTheDocument();
    expect(
      within(dayCard(/onsdag 28/)).getByText('Gammel rett (oppskriften finnes ikke lenger)'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Allergeninformasjonen er veiledende/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('this week is the default, today is marked, and the arrows move a week', async () => {
    withApi();
    renderApp('/maltidsplan');
    expect(await screen.findByRole('heading', { level: 2, name: /Uke 43/ })).toBeInTheDocument();
    await screen.findByRole('heading', { level: 3, name: /lørdag 24/ });
    const today = dayCard(/lørdag 24/);
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(within(today).getByText('I dag')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forrige uke' })).toHaveAttribute(
      'href',
      '/maltidsplan?uke=2026-W42',
    );
    expect(screen.getByRole('link', { name: 'Neste uke' })).toHaveAttribute(
      'href',
      '/maltidsplan?uke=2026-W44',
    );
    expect(screen.queryByRole('link', { name: 'Gå til denne uka' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'Neste uke' }));
    expect(await screen.findByRole('heading', { level: 2, name: /Uke 44/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gå til denne uka' })).toHaveAttribute(
      'href',
      '/maltidsplan',
    );
  });

  it('an invalid week in the URL shows this week', async () => {
    withApi();
    renderApp('/maltidsplan?uke=2026-W99');
    expect(await screen.findByRole('heading', { level: 2, name: /Uke 43/ })).toBeInTheDocument();
  });

  it('an empty week says so; breakfast and lunch are behind a switch', async () => {
    withApi({ entries: [entry({ meal: 'lunch' })] });
    const first = renderApp('/maltidsplan?uke=2026-W44');
    expect(await screen.findByText(/Uka har også frokost eller lunsj/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 4, name: 'Lunsj' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Vis frokost og lunsj' }));
    expect(
      await within(dayCard(/mandag 26/)).findByRole('link', { name: 'Fårikål' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 4, name: 'Frokost' })).toHaveLength(7);
    first.unmount();

    withApi();
    renderApp('/maltidsplan?uke=2026-W45');
    expect(await screen.findByText(/Ingenting er planlagt denne uka/)).toBeInTheDocument();
  });

  it('adds a note with a quick choice, once, and announces it', async () => {
    const posts: unknown[] = [];
    withApi({
      onWrite: (r) => {
        posts.push(r.body);
        return {
          status: 201,
          body: entry({
            kind: 'note',
            note: 'Rester',
            recipeId: null,
            recipeTitle: null,
            servings: null,
          }),
        };
      },
    });
    renderApp('/maltidsplan?uke=2026-W44');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Legg til Middag, mandag 26. okt.' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Middag, mandag 26. okt.' });
    // No recipes yet: the dialog starts on the note.
    expect(within(dialog).getByRole('radio', { name: 'Fritekst' })).toBeChecked();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rester' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Legg til' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      kind: 'note',
      note: 'Rester',
      date: '2026-10-26',
      meal: 'dinner',
    });
    expect((posts[0] as { clientRequestId: string }).clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Rester er lagt til i planen.')).toBeInTheDocument();
  });

  it('picks a recipe ranked for that day, shows why, and checks the servings', async () => {
    const posts: unknown[] = [];
    withApi({
      recipes: {
        recipes: [
          recipeSummary('Fårikål', {
            id: RECIPE,
            servings: 4,
            score: {
              total: 60,
              coverage: 50,
              expiringBonus: 10,
              requiredCount: 2,
              enoughCount: 1,
              partialCount: 0,
              missingCount: 1,
              reasons: [{ code: 'coverage', points: 50, enough: 1, partial: 0, required: 2 }],
            },
          }),
          recipeSummary('Melkerett', { allergenWarnings: ['milk'] }),
        ],
        userAllergens: ['milk'],
      },
      onWrite: (r) => {
        posts.push(r.body);
        return { status: 201, body: entry() };
      },
    });
    renderApp('/maltidsplan?uke=2026-W44');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Legg til Middag, onsdag 28. okt.' }),
    );
    const dialog = await screen.findByRole('dialog');
    const choice = await within(dialog).findByRole('radio', { name: /Fårikål/ });
    expect(
      within(dialog).getByText(/60 poeng · Du har nok av 1 av 2 ingredienser/),
    ).toBeInTheDocument();
    // Hidden because of the user's allergens, with a switch (spec 05).
    expect(within(dialog).queryByRole('radio', { name: /Melkerett/ })).not.toBeInTheDocument();

    await userEvent.click(choice);
    const servings = within(dialog).getByRole('textbox', { name: 'Porsjoner' });
    expect(servings).toHaveValue('4');
    await userEvent.clear(servings);
    await userEvent.type(servings, '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Legg til' }));
    expect(await within(dialog).findByText(/helt tall fra 1 til 50/)).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await userEvent.clear(servings);
    await userEvent.type(servings, '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Legg til' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      kind: 'recipe',
      recipeId: RECIPE,
      servings: 2,
      date: '2026-10-28',
    });
  });

  it('moves an entry with the dialog, sending only what changed', async () => {
    const patches: RecordedRequest[] = [];
    const planned = entry();
    withApi({
      entries: [planned],
      onWrite: (r) => {
        patches.push(r);
        return { status: 200, body: planned };
      },
    });
    renderApp('/maltidsplan?uke=2026-W44');
    await userEvent.click(await screen.findByRole('button', { name: 'Endre eller flytt Fårikål' }));
    const dialog = await screen.findByRole('dialog', { name: 'Endre Fårikål' });
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Dag' }),
      '2026-10-29',
    );
    await userEvent.selectOptions(
      within(dialog).getByRole('combobox', { name: 'Måltid' }),
      'lunch',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Lagre' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({
      method: 'PATCH',
      path: `/households/${H}/meal-plan/entries/${planned.id}`,
      body: { date: '2026-10-29', meal: 'lunch' },
    });
  });

  it('removes an entry, says so and moves focus, also when the entry is gone after the refetch', async () => {
    const deletes: RecordedRequest[] = [];
    const entries = [entry()];
    withApi({
      entries,
      onWrite: (r) => {
        deletes.push(r);
        // The plan comes back without it, so the entry unmounts (TanStack would drop its mutate callbacks).
        entries.splice(0);
        return { status: 204 };
      },
    });
    renderApp('/maltidsplan?uke=2026-W44');
    await userEvent.click(await screen.findByRole('button', { name: 'Fjern Fårikål' }));
    await waitFor(() => expect(deletes).toHaveLength(1));
    expect(deletes[0]?.method).toBe('DELETE');
    expect(await screen.findByText('Fårikål er fjernet fra planen.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Fårikål' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Legg til Middag, mandag 26. okt.' })).toHaveFocus();
  });
});

describe('FR-PLAN-003/004 what the week needs', () => {
  const needs: MealPlanNeedsResponse = {
    from: '2026-10-26',
    to: '2026-11-01',
    recipeEntryCount: 2,
    ingredients: [
      {
        ingredientId: '0199f0a0-0000-7000-8000-00000000e001',
        ingredientName: 'Lammekjøtt',
        baseUnit: 'g',
        isStaple: false,
        optional: false,
        needBase: 3000,
        untilTaste: false,
        rounded: true,
        coveredBase: 500,
        missingBase: 2500,
        unknownAmount: false,
        approximate: false,
        status: 'notEnough',
        onListBase: 0,
        toBuyBase: 2500,
        alreadyAdded: false,
        itemNames: ['Lammeskulder'],
        excludedUseByItems: ['Gammelt lam'],
        entries: [
          {
            entryId: '0199f0a0-0000-7000-8000-00000000f001',
            date: '2026-10-26',
            meal: 'dinner',
            recipeTitle: 'Fårikål',
            needBase: 2000,
            rounded: false,
            optional: false,
            shortfallBase: 1500,
            unmet: false,
            addedBase: null,
            added: false,
          },
        ],
      },
      {
        ingredientId: '0199f0a0-0000-7000-8000-00000000e002',
        ingredientName: 'Salt',
        baseUnit: 'g',
        isStaple: true,
        optional: false,
        needBase: 18,
        untilTaste: false,
        rounded: false,
        coveredBase: 0,
        missingBase: 18,
        unknownAmount: false,
        approximate: false,
        status: 'staple',
        onListBase: 0,
        toBuyBase: 18,
        alreadyAdded: false,
        itemNames: [],
        excludedUseByItems: [],
        entries: [],
      },
      {
        ingredientId: '0199f0a0-0000-7000-8000-00000000e003',
        ingredientName: 'Vann',
        baseUnit: 'ml',
        isStaple: false,
        optional: false,
        needBase: 600,
        untilTaste: false,
        rounded: false,
        coveredBase: 600,
        missingBase: 0,
        unknownAmount: false,
        approximate: false,
        status: 'enough',
        onListBase: 0,
        toBuyBase: 0,
        alreadyAdded: false,
        itemNames: ['Vann'],
        excludedUseByItems: [],
        entries: [],
      },
    ],
    suggestions: [
      {
        ingredientId: '0199f0a0-0000-7000-8000-00000000e001',
        ingredientName: 'Lammekjøtt',
        quantityBase: 2500,
        baseUnit: 'g',
        reason: 'notEnough',
        selected: true,
      },
      {
        ingredientId: '0199f0a0-0000-7000-8000-00000000e002',
        ingredientName: 'Salt',
        quantityBase: 18,
        baseUnit: 'g',
        reason: 'staple',
        selected: false,
      },
    ],
    unplannedExpiring: [
      {
        itemId: '0199f0a0-0000-7000-8000-00000000d001',
        itemName: 'Rømme',
        expiryKind: 'use_by',
        expiryDate: '2026-10-27',
        daysLeft: 3,
      },
    ],
  };

  it('explains each need and adds only what is ticked, after a confirm', async () => {
    const posts: RecordedRequest[] = [];
    withApi({
      entries: [entry()],
      needs,
      onWrite: (r) => {
        posts.push(r);
        return { status: 200, body: { created: 1, merged: 0, skipped: 0 } };
      },
    });
    const { container } = renderApp('/maltidsplan?uke=2026-W44');
    const section = (await screen.findByRole('heading', { level: 2, name: 'Hva mangler for uka' }))
      .parentElement as HTMLElement;
    const lam = await within(section).findByRole('checkbox', { name: /Lammekjøtt/ });
    expect(lam).toBeChecked();
    expect(within(section).getByRole('checkbox', { name: /Salt/ })).not.toBeChecked();
    expect(
      within(section).getByText(/Trenger ca\. 3 kg \(rundet opp\) · har 500 g/),
    ).toBeInTheDocument();
    expect(within(section).getByText('man. 26. okt. middag: Fårikål, 2 kg')).toBeInTheDocument();
    expect(
      within(section).getByText(/Gammelt lam med passert siste forbruksdag/),
    ).toBeInTheDocument();
    expect(within(section).getByText('Dette har du nok av (1)')).toBeInTheDocument();
    // FR-INV-005: what goes off and is not planned, with the phase 3 wording.
    expect(within(section).getByRole('link', { name: 'Rømme' })).toBeInTheDocument();
    expect(within(section).getByText('Siste forbruksdag om 3 dager')).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    await expectNoAxeViolations(container);

    await userEvent.click(within(section).getByRole('button', { name: 'Legg på handlelisten' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      method: 'POST',
      path: `/households/${H}/meal-plan/shopping`,
      body: {
        from: '2026-10-26',
        to: '2026-11-01',
        lines: [{ ingredientId: '0199f0a0-0000-7000-8000-00000000e001', quantityBase: 2500 }],
      },
    });
    expect(
      await within(section).findByText(/Lagt på handlelisten: 1 nye linjer/),
    ).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Åpne handlelisten' })).toHaveAttribute(
      'href',
      '/handleliste',
    );
  });

  it('a week that is over has no needs; a plan without recipes says what to do', async () => {
    withApi();
    const first = renderApp('/maltidsplan?uke=2026-W42');
    expect(await screen.findByText(/Uka er over/)).toBeInTheDocument();
    first.unmount();

    withApi();
    renderApp('/maltidsplan?uke=2026-W44');
    expect(await screen.findByText(/Legg oppskrifter i planen/)).toBeInTheDocument();
  });

  it('this week counts from today', async () => {
    const requests = withApi();
    renderApp('/maltidsplan');
    await screen.findByText(/Legg oppskrifter i planen/);
    expect(requests.map((r) => r.path)).toContain(
      `/households/${H}/meal-plan/needs?from=2026-10-24&to=2026-10-25`,
    );
  });
});
