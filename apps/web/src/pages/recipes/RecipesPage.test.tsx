import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecipeListResponse } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { recipeSummary } from '../../test/recipeFixtures';

const DISCLAIMER = /Allergeninformasjonen er veiledende/;

const wok = recipeSummary('Kyllingwok', {
  tags: ['middag', 'asiatisk'],
  score: {
    total: 60,
    coverage: 50,
    expiringBonus: 10,
    requiredCount: 4,
    enoughCount: 2,
    partialCount: 0,
    missingCount: 2,
    reasons: [
      { code: 'coverage', points: 50, enough: 2, partial: 0, required: 4 },
      {
        code: 'expiring',
        points: 10,
        ingredientName: 'Kyllingfilet',
        itemName: 'Kyllingfilet',
        expiryKind: 'use_by',
        daysLeft: 1,
      },
      { code: 'missing', points: 0, names: ['Løk', 'Fløte'] },
    ],
  },
});
const vafler = recipeSummary('Vafler', {
  tags: ['dessert'],
  allergens: ['gluten', 'milk'],
  allergenWarnings: ['milk'],
});

function withRecipes(body: RecipeListResponse) {
  return mockApi((r) => (r.path.endsWith('/recipes') ? { status: 200, body } : undefined));
}

describe('FR-REC-001/002 recipe list', () => {
  it('shows the ranked recipes with status, first reason and the disclaimer', async () => {
    withRecipes({ recipes: [wok], userAllergens: [], householdAllergens: [] });
    const { container } = renderApp('/oppskrifter');
    const card = (await screen.findByRole('link', { name: 'Kyllingwok' })).closest('li')!;
    expect(within(card).getByText('60 poeng')).toBeInTheDocument();
    expect(within(card).getByText('Har 2 av 4 · 2 mangler · 1 går snart ut')).toBeInTheDocument();
    expect(within(card).getByText('Du har nok av 2 av 4 ingredienser')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kyllingwok' })).toHaveAttribute(
      'href',
      `/oppskrifter/${wok.id}`,
    );
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('without recipes: an empty state (the team has not written any yet)', async () => {
    renderApp('/oppskrifter');
    expect(
      await screen.findByRole('heading', { name: 'Ingen oppskrifter ennå' }),
    ).toBeInTheDocument();
  });

  it('marks fictional test recipes as test data', async () => {
    withRecipes({
      recipes: [recipeSummary('Testrett', { source: 'test' })],
      userAllergens: [],
      householdAllergens: [],
    });
    renderApp('/oppskrifter');
    expect(await screen.findByText('Testdata')).toBeInTheDocument();
  });

  it('search filters the list and is kept in the URL', async () => {
    withRecipes({
      recipes: [wok, recipeSummary('Ertesuppe', { ingredientNames: ['Erter'] })],
      userAllergens: [],
      householdAllergens: [],
    });
    const user = userEvent.setup();
    const { router } = renderApp('/oppskrifter');
    await user.type(await screen.findByLabelText(/Søk i oppskrifter/), 'erter');
    expect(screen.queryByRole('link', { name: 'Kyllingwok' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ertesuppe' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?q=erter');
  });
});

describe('FR-REC-004 allergens in the list', () => {
  it('hides recipes with the user’s allergens by default and says how many', async () => {
    withRecipes({ recipes: [vafler, wok], userAllergens: ['milk'], householdAllergens: [] });
    const user = userEvent.setup();
    renderApp('/oppskrifter');
    expect(await screen.findByRole('link', { name: 'Kyllingwok' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Vafler' })).not.toBeInTheDocument();
    expect(screen.getByText(/1 oppskrift er skjult/)).toBeInTheDocument();

    // The hidden count links straight to the switched-on list.
    await user.click(screen.getByRole('link', { name: 'Vis dem likevel' }));
    expect(screen.getByLabelText('Vis oppskrifter med registrerte allergener')).toBeChecked();
    const card = screen.getByRole('link', { name: 'Vafler' }).closest('li')!;
    expect(within(card).getByText('Inneholder melk')).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('without registered allergens there is no switch, and nothing is hidden', async () => {
    // The API only sends warnings for allergens the user has registered.
    withRecipes({
      recipes: [{ ...vafler, allergenWarnings: [] }],
      userAllergens: [],
      householdAllergens: [],
    });
    renderApp('/oppskrifter');
    expect(await screen.findByRole('link', { name: 'Vafler' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Vis oppskrifter med registrerte allergener'),
    ).not.toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('when every recipe is hidden, the empty state still says why', async () => {
    withRecipes({ recipes: [vafler], userAllergens: ['milk'], householdAllergens: [] });
    renderApp('/oppskrifter');
    expect(
      await screen.findByRole('heading', { name: 'Ingen oppskrifter passer søket' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 oppskrift er skjult/)).toBeInTheDocument();
  });
});

describe('NFR-UX-003 states', () => {
  it('shows an error with retry when the API fails', async () => {
    mockApi((r) =>
      r.path.endsWith('/recipes')
        ? { status: 500, body: { error: { code: 'errors.internal' } } }
        : undefined,
    );
    renderApp('/oppskrifter');
    // A 5xx is retried once (queryClient.ts) before the error state shows.
    expect(
      await screen.findByRole('button', { name: 'Prøv igjen' }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });
});
