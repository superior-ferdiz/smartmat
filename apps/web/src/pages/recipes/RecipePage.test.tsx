import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RecipeDetail } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { recipeDetail, recipeLine } from '../../test/recipeFixtures';
import { shoppingItem } from '../../test/shoppingFixtures';

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

  it('without registered allergens it links to the allergies in the settings (spec 16)', async () => {
    show(recipe);
    expect(await screen.findByRole('link', { name: 'Registrer allergener' })).toHaveAttribute(
      'href',
      '/innstillinger#allergier',
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

describe('FR-SHOP-002 add what is missing to the shopping list', () => {
  it('ticks what is missing, leaves staples, optional and items already on the list unticked', async () => {
    const user = userEvent.setup();
    const onList = recipe.lines.find((l) => l.ingredientName === 'Løk')!;
    const requests = mockApi((r) => {
      if (r.path.endsWith(`/recipes/${recipe.id}`)) return { status: 200, body: recipe };
      if (r.method === 'GET' && r.path.endsWith('/shopping-list'))
        return {
          status: 200,
          body: { items: [shoppingItem('Løk', { ingredientId: onList.ingredientId })] },
        };
      if (r.method === 'POST' && r.path.includes('/from-recipe/'))
        return { status: 200, body: { created: 1, merged: 1, skipped: 0 } };
      return undefined;
    });
    renderApp(`/oppskrifter/${recipe.id}`);
    await user.click(await screen.findByRole('button', { name: 'Legg manglende i handlelisten' }));
    const dialog = screen.getByRole('dialog', { name: 'Legg i handlelisten' });

    // Kyllingfilet and Løk are "enough" in this recipe, so only the rest is suggested.
    const boxes = within(dialog).getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);
    expect(within(dialog).getByRole('checkbox', { name: 'Fløte' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Ris' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Karri' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Salt' })).not.toBeChecked();
    expect(within(dialog).getByText('Basisvare – sjekk at du har')).toBeInTheDocument();
    expect(within(dialog).getByText('Valgfri')).toBeInTheDocument();

    // Fløte: the 50 ml that is missing, shown in a unit the user can change.
    const amounts = within(dialog).getAllByRole('textbox', { name: /Mengde/ });
    expect(amounts[0]).toHaveValue('50');
    await user.clear(amounts[0]!);
    await user.type(amounts[0]!, '1');
    await user.selectOptions(within(dialog).getAllByRole('combobox', { name: 'Enhet' })[0]!, 'dl');
    await user.click(within(dialog).getByRole('button', { name: 'Legg i handlelisten' }));

    expect(
      await screen.findByText('Lagt i handlelisten: 1 nye, 1 slått sammen med linjer som var der.'),
    ).toBeInTheDocument();
    const fløte = recipe.lines.find((l) => l.ingredientName === 'Fløte')!;
    const ris = recipe.lines.find((l) => l.ingredientName === 'Ris')!;
    expect(requests.find((r) => r.path.includes('/from-recipe/'))?.body).toEqual({
      lines: [
        { ingredientId: fløte.ingredientId, quantityBase: 100 },
        { ingredientId: ris.ingredientId, quantityBase: 100 },
      ],
    });
  });

  it('marks an ingredient that is already on the list and leaves it unticked', async () => {
    const user = userEvent.setup();
    const ris = recipe.lines.find((l) => l.ingredientName === 'Ris')!;
    mockApi((r) => {
      if (r.path.endsWith(`/recipes/${recipe.id}`)) return { status: 200, body: recipe };
      if (r.method === 'GET' && r.path.endsWith('/shopping-list'))
        return {
          status: 200,
          body: {
            items: [
              shoppingItem('Ris', {
                ingredientId: ris.ingredientId,
                checked: true,
                checkedAt: '2026-10-21T09:00:00.000Z',
              }),
            ],
          },
        };
      return undefined;
    });
    renderApp(`/oppskrifter/${recipe.id}`);
    await user.click(await screen.findByRole('button', { name: 'Legg manglende i handlelisten' }));
    const dialog = screen.getByRole('dialog', { name: 'Legg i handlelisten' });
    expect(within(dialog).getByRole('checkbox', { name: 'Ris' })).not.toBeChecked();
    expect(within(dialog).getByText('Står allerede på listen')).toBeInTheDocument();
  });

  it('a recipe with everything in stock says so instead of offering the button', async () => {
    show(recipeDetail('Alt i boks', [recipeLine('Ris', { status: 'enough', haveBase: 500 })]));
    expect(await screen.findByText('Du har alt oppskriften trenger.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Legg manglende i handlelisten' }),
    ).not.toBeInTheDocument();
  });
});

describe('spec 09 FR-PLAN-002 servings on the recipe page', () => {
  const pot = recipeDetail(
    'Gryte',
    [
      recipeLine('Ris', {
        displayText: '250 g ris',
        quantityBase: 250,
        status: 'enough',
        haveBase: 300,
        itemNames: ['Ris'],
      }),
      recipeLine('Løk', {
        displayText: '1 løk',
        baseUnit: 'stk',
        quantityBase: 1,
        status: 'missing',
      }),
    ],
    { servings: 4 },
  );

  it('scales the amounts, rounds up, works out have/missing again, and keeps the choice in the URL', async () => {
    show(pot);
    const select = await screen.findByRole('combobox', { name: 'Porsjoner' });
    expect(select).toHaveValue('4');
    expect(screen.queryByText(/Til 6 porsjoner/)).not.toBeInTheDocument();

    await userEvent.selectOptions(select, '6');
    expect(await screen.findByText('Til 6 porsjoner: 375 g')).toBeInTheDocument();
    expect(screen.getByText('Til 6 porsjoner: ca. 2 stk')).toBeInTheDocument();
    // 300 g is no longer enough for 375 g.
    expect(
      within(group('For lite eller usikker mengde')).getByText('250 g ris'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Mengdene er regnet om til 6 porsjoner og rundet opp/),
    ).toBeInTheDocument();
  });

  it('reads the servings from the URL, and ignores values out of range', async () => {
    mockApi((r) =>
      r.path.endsWith(`/recipes/${pot.id}`) ? { status: 200, body: pot } : undefined,
    );
    const first = renderApp(`/oppskrifter/${pot.id}?porsjoner=2`);
    expect(await screen.findByRole('combobox', { name: 'Porsjoner' })).toHaveValue('2');
    expect(screen.getByText('Til 2 porsjoner: 125 g')).toBeInTheDocument();
    first.unmount();

    mockApi((r) =>
      r.path.endsWith(`/recipes/${pot.id}`) ? { status: 200, body: pot } : undefined,
    );
    renderApp(`/oppskrifter/${pot.id}?porsjoner=500`);
    expect(await screen.findByRole('combobox', { name: 'Porsjoner' })).toHaveValue('4');
  });

  it('"Legg i måltidsplanen" sends the chosen servings, day and meal', async () => {
    const posts: unknown[] = [];
    mockApi((r) => {
      if (r.path.endsWith(`/recipes/${pot.id}`)) return { status: 200, body: pot };
      if (r.method === 'POST' && r.path.endsWith('/meal-plan/entries')) {
        posts.push(r.body);
        return {
          status: 201,
          body: {
            id: '0199f0a0-0000-7000-8000-0000000000f1',
            date: '2026-11-02',
            meal: 'dinner',
            kind: 'recipe',
            recipeId: pot.id,
            recipeTitle: 'Gryte',
            recipeServings: 4,
            servings: 6,
            note: null,
            allergenWarnings: [],
            createdAt: '2026-10-24T10:00:00.000Z',
          },
        };
      }
      return undefined;
    });
    renderApp(`/oppskrifter/${pot.id}?porsjoner=6`);
    await userEvent.click(await screen.findByRole('button', { name: 'Legg i måltidsplanen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Legg i måltidsplanen' });
    expect(within(dialog).getByText('Gryte · 6 porsjoner')).toBeInTheDocument();
    const date = within(dialog).getByLabelText('Dato');
    await userEvent.clear(date);
    await userEvent.type(date, '2026-11-02');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Legg til' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      kind: 'recipe',
      recipeId: pot.id,
      servings: 6,
      date: '2026-11-02',
      meal: 'dinner',
    });
    expect(await screen.findByRole('link', { name: 'Åpne uka' })).toHaveAttribute(
      'href',
      '/maltidsplan?uke=2026-W45',
    );
  });
});
