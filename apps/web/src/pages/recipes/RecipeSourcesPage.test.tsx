import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { RecipeDetail, RecipeListResponse } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { recipeDetail, recipeOrigin, recipeSummary } from '../../test/recipeFixtures';

const external = recipeDetail('Fårikål', [], {
  source: 'external',
  license: 'CC-BY-SA-4.0',
  authors: ['Bidragsytere til Wikibooks'],
  origin: recipeOrigin(),
});

function showRecipe(body: RecipeDetail) {
  mockApi((r) => (r.path.endsWith(`/recipes/${body.id}`) ? { status: 200, body } : undefined));
  return renderApp(`/oppskrifter/${body.id}`);
}

function withList(body: RecipeListResponse) {
  mockApi((r) => (r.path.endsWith('/recipes') ? { status: 200, body } : undefined));
}

describe('FR-REC-006 source and licence on the recipe', () => {
  it('names the original, the site, the licence and what was changed, with safe links', async () => {
    const { container } = showRecipe(external);
    const box = (await screen.findByRole('heading', { name: 'Kilde og lisens' }))
      .parentElement as HTMLElement;
    const original = within(box).getByRole('link', {
      name: 'Fårikål (Norwegian Lamb and Cabbage Stew)',
    });
    expect(original).toHaveAttribute('href', 'https://en.wikibooks.org/w/index.php?oldid=4630337');
    expect(original).toHaveAttribute('target', '_blank');
    expect(original).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      within(box).getByText(/fra Wikibooks, skrevet av Bidragsytere til Wikibooks/),
    ).toBeInTheDocument();
    expect(within(box).getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/deed.no',
    );
    expect(within(box).getByText(/Oversatt og tilpasset med KI/)).toBeInTheDocument();
    expect(within(box).getByText('Endret: Tidene er anslått av KI.')).toBeInTheDocument();
    // An external recipe is not presented as written by someone in the team.
    expect(screen.queryByText(/Skrevet av/)).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('an unchecked recipe is marked as an AI draft, at the top and in the source box', async () => {
    showRecipe(external);
    expect(await screen.findByText('KI-utkast')).toBeInTheDocument();
    expect(screen.getByText(/KI-utkast – ikke kontrollert av teamet/)).toBeInTheDocument();
  });

  it('a recipe the team has checked says who and when, and is not a draft', async () => {
    showRecipe(
      recipeDetail('Fårikål', [], {
        source: 'external',
        origin: recipeOrigin({ reviewedBy: ['Linus Saxe Huseby'], reviewedOn: '2026-10-30' }),
      }),
    );
    expect(
      await screen.findByText(/Kontrollert av Linus Saxe Huseby 30\. okt\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('KI-utkast')).not.toBeInTheDocument();
  });

  it('the recipe list marks AI drafts on the card', async () => {
    withList({
      recipes: [recipeSummary('Fårikål', { source: 'external', origin: recipeOrigin() })],
      userAllergens: [],
      householdAllergens: [],
      avoidedIngredients: [],
      householdAvoidedIngredients: [],
    });
    renderApp('/oppskrifter');
    const card = (await screen.findByRole('link', { name: 'Fårikål' })).closest('li')!;
    expect(within(card).getByText('KI-utkast')).toBeInTheDocument();
  });
});

describe('FR-REC-006 the sources page', () => {
  it('explains the licence and lists every external recipe with its original', async () => {
    withList({
      recipes: [
        recipeSummary('Svenske kjøttboller', {
          source: 'external',
          origin: recipeOrigin({
            title: 'Swedish Meatballs I',
            url: 'https://en.wikibooks.org/w/index.php?oldid=2',
          }),
        }),
        recipeSummary('Fårikål', { source: 'external', origin: recipeOrigin() }),
        recipeSummary('Testrett', { source: 'test' }),
      ],
      userAllergens: [],
      householdAllergens: [],
      avoidedIngredients: [],
      householdAvoidedIngredients: [],
    });
    const { container } = renderApp('/oppskrifter/kilder');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kilder og lisenser' }),
    ).toBeInTheDocument();
    const list = (await screen.findByRole('heading', { name: 'Oppskrifter fra åpne kilder' }))
      .parentElement as HTMLElement;
    const items = within(list).getAllByRole('listitem');
    // Norwegian alphabetical order; the test recipe is not an open source.
    expect(items.map((li) => within(li).getAllByRole('link')[0]?.textContent)).toEqual([
      'Fårikål',
      'Svenske kjøttboller',
    ]);
    expect(within(items[1]!).getByRole('link', { name: 'Swedish Meatballs I' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(within(items[1]!).getByText(/\(Wikibooks\) · CC BY-SA 4\.0/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says so when there are no external recipes', async () => {
    withList({
      recipes: [recipeSummary('Testrett', { source: 'test' })],
      userAllergens: [],
      householdAllergens: [],
      avoidedIngredients: [],
      householdAvoidedIngredients: [],
    });
    renderApp('/oppskrifter/kilder');
    expect(await screen.findByText('Ingen oppskrifter fra åpne kilder')).toBeInTheDocument();
  });
});
