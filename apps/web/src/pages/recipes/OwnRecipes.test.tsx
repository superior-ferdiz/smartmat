import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { HouseholdRecipeEdit, RecipePriceEstimate } from '@smartmat/shared';
import { renderApp } from '../../test/renderApp';
import { mockApi, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { recipeDetail, recipeLine, recipeSummary } from '../../test/recipeFixtures';
import { ingredient } from '../../test/shoppingFixtures';

/* Spec 16 in the browser: own recipes (FR-REC-007/008), avoided-food warnings (FR-ALG-002/003), prices (FR-PRICE-007). */

const RECIPE_ID = '0199f0a0-0000-7000-8000-0000000000e1';
const egg = ingredient('Egg', { baseUnit: 'stk', units: ['g', 'kg', 'stk'] });
const melk = ingredient('Melk', { baseUnit: 'ml', units: ['ml', 'dl', 'l', 'ss', 'ts', 'krm'] });

const writes = (requests: RecordedRequest[]) => requests.filter((r) => r.method !== 'GET');

const own = recipeDetail(
  'Bestemors omelett',
  [
    recipeLine('Egg', { displayText: '3 stk Egg', baseUnit: 'stk', quantityBase: 3 }),
    recipeLine('Kiwi', { displayText: '1 kiwi', baseUnit: 'stk', quantityBase: 1 }),
  ],
  {
    id: RECIPE_ID,
    source: 'household',
    slug: null,
    license: null,
    authors: [],
    createdBy: { kind: 'former', displayName: null },
    freeTextCount: 1,
    freeTextLines: [{ position: 2, displayText: 'Gressløk fra hagen' }],
    avoidedIngredients: ['Kiwi'],
    ingredientWarnings: ['Kiwi'],
  },
);

describe('FR-REC-007 a new own recipe', () => {
  it('says plainly that free-text lines never count, and has no axe violations', async () => {
    mockApi((r) => (r.path === '/ingredients' ? { status: 200, body: [melk, egg] } : undefined));
    const user = userEvent.setup();
    const { container } = renderApp('/oppskrifter/ny');
    await user.click(await screen.findByRole('button', { name: 'Legg til fritekstlinje' }));
    expect(screen.getAllByText(/Fritekst – telles ikke i matlageret/).length).toBeGreaterThan(0);
    expect(screen.getByText(/1 linje er fritekst/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('sends the lines from the ingredient list and the free text, once, and goes to the recipe', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/ingredients') return { status: 200, body: [melk, egg] };
      if (r.method === 'POST' && r.path.endsWith('/recipes'))
        return { status: 201, body: { id: RECIPE_ID, version: 1 } };
      if (r.path.endsWith(`/recipes/${RECIPE_ID}`)) return { status: 200, body: own };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/oppskrifter/ny');
    await user.type(await screen.findByLabelText('Navn'), 'Bestemors omelett');
    await user.selectOptions(screen.getByLabelText('Ingrediens 1'), 'Egg');
    await user.type(screen.getByLabelText(/^Mengde/), '3');
    await user.selectOptions(screen.getByLabelText(/^Enhet/), 'stk');
    await user.click(screen.getByRole('button', { name: 'Legg til fritekstlinje' }));
    await user.type(screen.getByLabelText('Fritekstlinje 2'), 'Gressløk fra hagen');
    await user.type(screen.getByLabelText('Trinn 1'), 'Visp og stek.');
    await user.click(screen.getByRole('button', { name: 'Lagre oppskriften' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bestemors omelett' }),
    ).toBeInTheDocument();
    const [post] = writes(requests);
    expect(post?.body).toMatchObject({
      title: 'Bestemors omelett',
      servings: 4,
      lines: [
        { kind: 'ingredient', ingredientId: egg.id, amount: '3', unit: 'stk', optional: false },
        { kind: 'freeText', text: 'Gressløk fra hagen' },
      ],
      steps: ['Visp og stek.'],
      clientRequestId: expect.any(String),
    });
  });

  it('checks in the browser first, and puts server field errors on the right line', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/ingredients') return { status: 200, body: [melk, egg] };
      if (r.method === 'POST')
        return {
          status: 400,
          body: {
            error: {
              code: 'errors.validation',
              fields: { 'lines.0.unit': 'validation.recipe.unit' },
            },
          },
        };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp('/oppskrifter/ny');
    await user.click(await screen.findByRole('button', { name: 'Lagre oppskriften' }));
    expect(screen.getAllByText('Skriv et navn på oppskriften.').length).toBeGreaterThan(0);
    expect(writes(requests)).toEqual([]);

    await user.type(screen.getByLabelText('Navn'), 'Test');
    await user.selectOptions(screen.getByLabelText('Ingrediens 1'), 'Melk');
    await user.type(screen.getByLabelText(/^Mengde/), '2');
    await user.selectOptions(screen.getByLabelText(/^Enhet/), 'dl');
    await user.type(screen.getByLabelText('Trinn 1'), 'Rør.');
    await user.click(screen.getByRole('button', { name: 'Lagre oppskriften' }));
    expect(
      (await screen.findAllByText('Velg en enhet som passer til ingrediensen.')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Enhet/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('FR-REC-007 changing an own recipe', () => {
  const edit: HouseholdRecipeEdit = {
    id: RECIPE_ID,
    version: 3,
    title: 'Bestemors omelett',
    description: '',
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 10,
    tags: ['frokost'],
    lines: [
      {
        kind: 'ingredient',
        ingredientId: egg.id,
        amount: '3',
        unit: 'stk',
        text: '3 stk Egg',
        optional: false,
      },
      { kind: 'freeText', text: 'Gressløk fra hagen' },
    ],
    steps: ['Visp og stek.'],
  };

  it('opens with what was typed and sends the version it opened with', async () => {
    const requests = mockApi((r) => {
      if (r.path === '/ingredients') return { status: 200, body: [melk, egg] };
      if (r.path.endsWith('/edit')) return { status: 200, body: edit };
      if (r.method === 'PUT') return { status: 200, body: { id: RECIPE_ID, version: 4 } };
      if (r.path.endsWith(`/recipes/${RECIPE_ID}`)) return { status: 200, body: own };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp(`/oppskrifter/${RECIPE_ID}/endre`);
    expect(await screen.findByLabelText('Navn')).toHaveValue('Bestemors omelett');
    expect(screen.getByLabelText('Ingrediens 1')).toHaveValue(egg.id);
    expect(screen.getByLabelText(/^Mengde/)).toHaveValue('3');
    expect(screen.getByLabelText('Fritekstlinje 2')).toHaveValue('Gressløk fra hagen');
    expect(screen.getByLabelText(/^Tagger/)).toHaveValue('frokost');
    await user.clear(screen.getByLabelText('Porsjoner'));
    await user.type(screen.getByLabelText('Porsjoner'), '4');
    await user.click(screen.getByRole('button', { name: 'Lagre' }));
    expect(await screen.findByText('Endringene er lagret')).toBeInTheDocument();
    const put = writes(requests).find((r) => r.method === 'PUT');
    expect(put?.body).toMatchObject({ version: 3, servings: 4 });
  });

  it('a stale version says someone else changed it', async () => {
    mockApi((r) => {
      if (r.path === '/ingredients') return { status: 200, body: [melk, egg] };
      if (r.path.endsWith('/edit')) return { status: 200, body: edit };
      if (r.method === 'PUT')
        return { status: 409, body: { error: { code: 'errors.recipe.changedMeanwhile' } } };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp(`/oppskrifter/${RECIPE_ID}/endre`);
    await screen.findByLabelText('Navn');
    await user.click(screen.getByRole('button', { name: 'Lagre' }));
    expect(await screen.findByText(/Noen andre har endret oppskriften/)).toBeInTheDocument();
  });

  it('a global recipe (or another household’s) cannot be opened for editing', async () => {
    mockApi((r) =>
      r.path.endsWith('/edit')
        ? { status: 404, body: { error: { code: 'errors.notFound' } } }
        : undefined,
    );
    renderApp(`/oppskrifter/${RECIPE_ID}/endre`);
    expect(
      await screen.findByText('Bare husholdningens egne oppskrifter kan endres.'),
    ).toBeInTheDocument();
  });
});

describe('the recipe page for an own recipe', () => {
  it('says "Egen oppskrift" and who added it, shows free text apart and the avoided food', async () => {
    mockApi((r) =>
      r.path.endsWith(`/recipes/${RECIPE_ID}`) ? { status: 200, body: own } : undefined,
    );
    const { container } = renderApp(`/oppskrifter/${RECIPE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Bestemors omelett' });
    expect(screen.getByText('Egen oppskrift')).toBeInTheDocument();
    expect(screen.queryByText('KI-utkast')).not.toBeInTheDocument();
    expect(screen.getByText(/Lagt inn av Tidligere medlem/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Endre' })).toHaveAttribute(
      'href',
      `/oppskrifter/${RECIPE_ID}/endre`,
    );
    expect(screen.getByText('Gressløk fra hagen')).toBeInTheDocument();
    expect(
      screen.getByText('1 linje er fritekst og er ikke sjekket mot allergiene.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Inneholder Kiwi (registrert av deg)').length).toBeGreaterThan(0);
    expect(screen.getByText('Registrert av deg')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('deletes after the user confirms', async () => {
    const requests = mockApi((r) => {
      if (r.method === 'DELETE') return { status: 204, body: undefined };
      if (r.path.endsWith(`/recipes/${RECIPE_ID}`)) return { status: 200, body: own };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp(`/oppskrifter/${RECIPE_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Slett' }));
    const dialog = screen.getByRole('dialog', { name: 'Slette oppskriften?' });
    expect(writes(requests)).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Slett oppskriften' }));
    expect(await screen.findByText('Oppskriften er slettet')).toBeInTheDocument();
    expect(writes(requests).map((r) => r.method)).toEqual(['DELETE']);
  });

  it('a global recipe has no change or delete buttons', async () => {
    const global = recipeDetail('Fårikål', [recipeLine('Lam')], { id: RECIPE_ID });
    mockApi((r) =>
      r.path.endsWith(`/recipes/${RECIPE_ID}`) ? { status: 200, body: global } : undefined,
    );
    renderApp(`/oppskrifter/${RECIPE_ID}`);
    await screen.findByRole('heading', { level: 1, name: 'Fårikål' });
    expect(screen.queryByRole('link', { name: 'Endre' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Slett' })).not.toBeInTheDocument();
  });
});

describe('FR-PRICE-007 the price estimate on a recipe', () => {
  const estimate: RecipePriceEstimate = {
    externalEnabled: false,
    lines: [
      {
        position: 0,
        text: '3 stk Egg',
        estimateOre: null,
        source: null,
        basis: null,
        date: null,
        missing: 'noMatch',
        skipped: null,
      },
      {
        position: 1,
        text: '2 dl Melk',
        estimateOre: 498,
        source: 'own',
        basis: 'scaled',
        date: '2026-10-28',
        missing: null,
        skipped: null,
      },
      {
        position: 2,
        text: 'Gressløk fra hagen',
        estimateOre: null,
        source: null,
        basis: null,
        date: null,
        missing: null,
        skipped: 'freeText',
      },
    ],
    summary: {
      pricedLines: 2,
      estimatedLines: 1,
      missingLines: 1,
      skippedLines: 1,
      estimatedOre: 498,
      fromOwn: 1,
      fromKassalapp: 0,
    },
  };

  it('is an honest estimate: how many lines, what is missing, what is left out – never a total', async () => {
    mockApi((r) => {
      if (r.path.endsWith('/price-estimate')) return { status: 200, body: estimate };
      if (r.path.endsWith(`/recipes/${RECIPE_ID}`)) return { status: 200, body: own };
      return undefined;
    });
    const user = userEvent.setup();
    renderApp(`/oppskrifter/${RECIPE_ID}`);
    const section = await screen.findByRole('region', { name: 'Anslått pris på ingrediensene' });
    expect(
      await within(section).findByText(/Anslag for 1 av 2 ingredienser: ca\. 4,98/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText('1 ingrediens mangler pris og er ikke med.'),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/1 linje er ikke med: basisvare, fritekst/),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(/Priser fra butikkene på nett \(Kassalapp\) er slått av/),
    ).toBeInTheDocument();
    expect(within(section).getByText(/Du må ofte kjøpe en hel pakke/)).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/Totalt|koster/i);
    await user.click(within(section).getByText('Vis anslag per ingrediens'));
    expect(within(section).getByText(/andel av det dere betalte/)).toBeInTheDocument();
    expect(within(section).getByText('fritekst, ikke med')).toBeInTheDocument();
  });

  it('with Kassalapp on, it says which chains are missing', async () => {
    mockApi((r) => {
      if (r.path.endsWith('/price-estimate'))
        return { status: 200, body: { ...estimate, externalEnabled: true } };
      if (r.path.endsWith(`/recipes/${RECIPE_ID}`)) return { status: 200, body: own };
      return undefined;
    });
    renderApp(`/oppskrifter/${RECIPE_ID}`);
    expect(
      await screen.findByText(/Rema 1000, Kiwi og Coop er ikke med\. Dette er ikke/),
    ).toBeInTheDocument();
  });
});

describe('FR-REC-007 the list', () => {
  it('has "Ny oppskrift", and "Bare egne oppskrifter" filters to the household’s own', async () => {
    const mine = recipeSummary('Bestemors omelett', {
      source: 'household',
      createdBy: { kind: 'member', displayName: 'Kari' },
    });
    const theirs = recipeSummary('Fårikål');
    mockApi((r) =>
      r.path.endsWith('/recipes')
        ? {
            status: 200,
            body: {
              recipes: [theirs, mine],
              userAllergens: [],
              householdAllergens: [],
              avoidedIngredients: [],
              householdAvoidedIngredients: [],
            },
          }
        : undefined,
    );
    const user = userEvent.setup();
    renderApp('/oppskrifter');
    expect(await screen.findByRole('link', { name: 'Ny oppskrift' })).toHaveAttribute(
      'href',
      '/oppskrifter/ny',
    );
    await user.click(await screen.findByText(/^Filtrer/));
    await user.click(screen.getByLabelText('Bare egne oppskrifter'));
    const list = screen.getByRole('list', { name: /oppskrifter/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByText('Bestemors omelett')).toBeInTheDocument();
    expect(within(list).getByText('Egen oppskrift')).toBeInTheDocument();
  });
});
