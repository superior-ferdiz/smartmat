import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { RecipeDetail } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { recipeDetail, recipeLine } from '../../test/recipeFixtures';

const DISCLAIMER = /Allergeninformasjonen er veiledende/;

const recipe = recipeDetail(
  'Kyllinggryte',
  [
    recipeLine('Kyllingfilet', {
      displayText: '400 g kyllingfilet',
      quantityBase: 400,
      status: 'enough',
      haveBase: 500,
      itemNames: ['Kyllingfilet'],
      expiring: { itemName: 'Kyllingfilet', expiryKind: 'use_by', daysLeft: 2 },
    }),
    recipeLine('Fløte', {
      displayText: '2 dl matfløte',
      baseUnit: 'ml',
      quantityBase: 200,
      status: 'notEnough',
      haveBase: 150,
      missingBase: 50,
      itemNames: ['Matfløte'],
      allergens: ['milk'],
    }),
    recipeLine('Løk', {
      displayText: '1 løk',
      quantityBase: 100,
      status: 'enough',
      haveBase: 100,
      approximate: true,
      itemNames: ['Gul løk'],
    }),
    recipeLine('Ris', {
      displayText: '3 dl ris',
      status: 'missing',
      excludedUseByItems: ['Gammel ris'],
    }),
    recipeLine('Karri', { displayText: '1 ss karri', status: 'missing', optional: true }),
    recipeLine('Salt', { displayText: 'Salt', quantityBase: null, status: 'staple' }),
  ],
  {
    allergens: ['milk'],
    score: {
      total: 72,
      coverage: 62,
      expiringBonus: 10,
      requiredCount: 4,
      enoughCount: 2,
      partialCount: 1,
      missingCount: 1,
      reasons: [
        { code: 'coverage', points: 62, enough: 2, partial: 1, required: 4 },
        {
          code: 'expiring',
          points: 10,
          ingredientName: 'Kyllingfilet',
          itemName: 'Kyllingfilet',
          expiryKind: 'use_by',
          daysLeft: 2,
        },
        { code: 'missing', points: 0, names: ['Ris'] },
      ],
    },
  },
);

function show(body: RecipeDetail) {
  mockApi((r) => (r.path.endsWith(`/recipes/${body.id}`) ? { status: 200, body } : undefined));
  return renderApp(`/oppskrifter/${body.id}`);
}

const group = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).parentElement as HTMLElement;

describe('FR-REC-003 what you have and what is missing', () => {
  it('groups the ingredients and says how much you have or lack', async () => {
    const { container } = show(recipe);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kyllinggryte' }),
    ).toBeInTheDocument();

    const have = group('Har');
    expect(within(have).getByText('400 g kyllingfilet')).toBeInTheDocument();
    expect(within(have).getByText('Du har 500 g')).toBeInTheDocument();
    expect(within(have).getByText('Du har ca. 100 g')).toBeInTheDocument();
    expect(
      within(have).getByText('Kyllingfilet: siste forbruksdag om 2 dager'),
    ).toBeInTheDocument();

    const short = group('For lite eller usikker mengde');
    expect(within(short).getByText('Du har 150 ml, mangler 50 ml')).toBeInTheDocument();
    expect(within(short).getByText('Fra matlageret: Matfløte')).toBeInTheDocument();

    const missing = group('Mangler');
    expect(within(missing).getByText('3 dl ris')).toBeInTheDocument();
    expect(within(missing).getByText('valgfri')).toBeInTheDocument();
    expect(
      within(missing).getByText(/Gammel ris med passert siste forbruksdag.*bør ikke spises/),
    ).toBeInTheDocument();

    expect(
      within(group('Basisvarer')).getByText('Basisvare – sjekk at du har'),
    ).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('shows steps, authors and licence', async () => {
    show(recipe);
    expect(await screen.findByText('Steg to.')).toBeInTheDocument();
    expect(screen.getByText(/Skrevet av Linus Saxe Huseby/)).toBeInTheDocument();
  });
});

describe('FR-REC-002 the score explains itself', () => {
  it('lists every reason with its points and the total', async () => {
    show(recipe);
    const why = (await screen.findByRole('heading', { name: 'Hvorfor denne plasseringen' }))
      .parentElement as HTMLElement;
    expect(
      within(why).getByText('Du har nok av 2 av 4 ingredienser, og litt av 1'),
    ).toBeInTheDocument();
    expect(within(why).getByText('+62')).toBeInTheDocument();
    expect(within(why).getByText('+10')).toBeInTheDocument();
    expect(within(why).getByText('Mangler: Ris')).toBeInTheDocument();
    expect(within(why).getByText('72 poeng')).toBeInTheDocument();
  });

  it('best before passed is worded as best before, never as use by', async () => {
    show(
      recipeDetail('Pasta', [], {
        score: {
          ...recipe.score,
          reasons: [
            {
              code: 'expiring',
              points: 10,
              ingredientName: 'Pasta',
              itemName: 'Spagetti',
              expiryKind: 'best_before',
              daysLeft: -3,
            },
          ],
        },
      }),
    );
    expect(await screen.findByText('Spagetti: best før passert')).toBeInTheDocument();
  });
});

describe('FR-REC-004 allergen box', () => {
  it('names the user’s allergens and the ingredients they come from, with the disclaimer', async () => {
    show({ ...recipe, userAllergens: ['milk', 'egg'], allergenWarnings: ['milk'] });
    const box = (await screen.findByText('Inneholder melk')).closest('div')!.parentElement!;
    expect(within(box).getByText('melk: 2 dl matfløte')).toBeInTheDocument();
    expect(within(box).getByText(DISCLAIMER)).toBeInTheDocument();
    // The line itself is marked too.
    expect(within(group('For lite eller usikker mengde')).getByText('melk')).toBeInTheDocument();
  });

  it('no match is never worded as "free of": it says none are registered', async () => {
    show({ ...recipe, userAllergens: ['fish'], allergenWarnings: [] });
    expect(
      await screen.findByText(
        'Ingen av dine registrerte allergener er registrert i ingrediensene.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });

  it('without registered allergens it links to the profile', async () => {
    show(recipe);
    expect(await screen.findByRole('link', { name: 'Registrer allergener' })).toHaveAttribute(
      'href',
      '/profil',
    );
    expect(screen.getByText(DISCLAIMER)).toBeInTheDocument();
  });
});

describe('NFR-UX-003 states', () => {
  it('an unknown recipe shows "not found" with a way back', async () => {
    mockApi((r) =>
      r.path.includes('/recipes/')
        ? { status: 404, body: { error: { code: 'errors.notFound' } } }
        : undefined,
    );
    renderApp('/oppskrifter/0199f0a0-0000-7000-8000-000000000999');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Fant ikke oppskriften' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tilbake til oppskriftene' })).toBeInTheDocument();
  });
});
