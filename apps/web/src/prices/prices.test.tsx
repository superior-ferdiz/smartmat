import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  BarcodeLookupResponse,
  BarcodePricesResponse,
  ExternalPrices,
  HistoryResponse,
  ItemPricesResponse,
  OwnPrices,
  PriceObservation,
  ShoppingPriceEstimateResponse,
} from '@smartmat/shared';
import { expectNoAxeViolations } from '../test/axe';
import { item } from '../test/inventoryFixtures';
import { mockApi, NO_EXTERNAL_PRICES, type RecordedRequest } from '../test/mockApi';
import { renderApp, TEST_SESSION } from '../test/renderApp';
import { shoppingItem } from '../test/shoppingFixtures';

/*
 * Spec 12 in the browser (jsdom): FR-PRICE-001–004 on the scan page, the item page and the shopping list.
 * The prices are made up; the API is mocked. Playwright covers the same flow against the API with a fake Kassalapp.
 */

const H = TEST_SESSION.user.householdId;
const GTIN = '7038010000737';
const PURCHASE = '0199f0a0-0000-7000-8000-0000000000b1';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-25T12:00:00Z') });
});
afterEach(() => {
  vi.useRealTimers();
});

function observation(overrides: Partial<PriceObservation>): PriceObservation {
  return {
    source: 'kassalapp',
    chainCode: 'MENY_NO',
    chainName: 'Meny',
    priceOre: 2690,
    packageQuantityBase: 1000,
    packageUnit: 'ml',
    unitPrice: { ore: 2690, per: 'l' },
    observedAt: '2026-10-24T09:00:00.000Z',
    stale: false,
    uncollected: false,
    fresh: true,
    sourceUrl: 'https://kassal.app/vare/1-meny',
    ...overrides,
  };
}

const spar = observation({
  chainCode: 'SPAR_NO',
  chainName: 'Spar',
  priceOre: 2490,
  unitPrice: { ore: 2490, per: 'l' },
  sourceUrl: 'https://kassal.app/vare/1-spar',
});
const meny = observation({});
const oda = observation({
  chainCode: 'ODA_NO',
  chainName: 'Oda',
  priceOre: 1990,
  observedAt: '2026-10-05T09:00:00.000Z',
  stale: true,
  fresh: false,
  sourceUrl: null,
});
const kiwi = observation({
  chainCode: 'KIWI',
  chainName: 'Kiwi',
  priceOre: 1790,
  observedAt: '2024-03-12T09:00:00.000Z',
  stale: true,
  uncollected: true,
  fresh: false,
  sourceUrl: null,
});

const FOUND: ExternalPrices = {
  status: 'found',
  fetchedAt: '2026-10-25T11:00:00.000Z',
  observations: [spar, meny, oda, kiwi],
  cheapest: spar,
  freshCount: 2,
};

const OWN: OwnPrices = {
  item: { id: '0199f0a0-0000-7000-8000-0000000000a1', name: 'Testmeieriet Lettmelk' },
  entries: [
    {
      batchId: '0199f0a0-0000-7000-8000-0000000000c1',
      priceOre: 2690,
      quantityBase: 1000,
      unit: 'ml',
      unitPrice: { ore: 2690, per: 'l' },
      date: '2026-10-20',
      old: false,
      origin: 'purchase',
      storeName: 'Testbutikken',
      purchaseId: PURCHASE,
    },
    {
      batchId: '0199f0a0-0000-7000-8000-0000000000c2',
      priceOre: 1990,
      quantityBase: 1000,
      unit: 'ml',
      unitPrice: { ore: 1990, per: 'l' },
      date: '2025-01-15',
      old: true,
      origin: 'item',
      storeName: null,
      purchaseId: null,
    },
  ],
};

const LOOKUP: BarcodeLookupResponse = {
  gtin: GTIN,
  storeCode: false,
  source: 'household',
  providerStatus: 'notAsked',
  suggestion: {
    name: 'Testmeieriet Lettmelk',
    brand: null,
    categoryKey: 'dairy',
    unit: 'ml',
    quantityBase: 1000,
    ingredient: null,
    locationId: null,
    expiryKind: null,
  },
  existingItem: null,
};

function scanApi(prices: Partial<BarcodePricesResponse> | { status: number; body: unknown }) {
  return mockApi((r: RecordedRequest) => {
    if (r.path === `/households/${H}/barcodes/${GTIN}`) return { status: 200, body: LOOKUP };
    if (r.path === `/households/${H}/prices/${GTIN}`) {
      if ('status' in prices && typeof prices.status === 'number')
        return prices as { status: number; body: unknown };
      return {
        status: 200,
        body: {
          gtin: GTIN,
          storeCode: false,
          own: { item: null, entries: [] },
          external: NO_EXTERNAL_PRICES,
          ...prices,
        },
      };
    }
    return undefined;
  });
}

const pricesSection = async () =>
  within((await screen.findByRole('heading', { name: 'Priser' })).closest('section')!);

describe('FR-PRICE-001/-004 the scan page', () => {
  it('shows the cheapest fresh price, a table of fresh prices and the old ones folded away; no axe violations', async () => {
    scanApi({ own: OWN, external: FOUND });
    const { container } = renderApp(`/skann?kode=${GTIN}`);
    const section = await pricesSection();
    expect(
      await section.findByText('Billigst sist observert: Spar, 24,90 kr (sjekket 24. okt.)'),
    ).toBeInTheDocument();
    expect(
      section.getByText('Laveste av 2 kjeder med pris sjekket de siste 14 dagene.'),
    ).toBeInTheDocument();

    const tables = section.getAllByRole('table');
    const freshRows = within(tables[0]!).getAllByRole('row').slice(1);
    expect(freshRows.map((row) => row.textContent?.replace(/\u00A0/g, ' '))).toEqual([
      'Spar24,90 kr24,90 kr per l24. okt.',
      'Meny26,90 kr26,90 kr per l24. okt.',
    ]);
    expect(
      within(tables[0]!).getByRole('link', { name: 'Spar, se varen hos Kassalapp' }),
    ).toHaveAttribute('href', 'https://kassal.app/vare/1-spar');

    // The old prices are there, but folded away and labelled – never in "cheapest".
    const older = section.getByText('Eldre priser (2)');
    expect(older.closest('details')).not.toHaveAttribute('open');
    expect(
      section.getByText('Kassalapp henter ikke lenger priser fra denne kjeden'),
    ).toBeInTheDocument();
    expect(section.getByText('Ikke sjekket på 14 dager')).toBeInTheDocument();
    expect(section.getByText('12. mars 2024', { exact: false })).toBeInTheDocument();

    // ADR-0010: never shown as a complete comparison.
    expect(section.getByText(/Rema 1000, Kiwi og Coop er ikke med/)).toBeInTheDocument();
    expect(section.getByText(/Dette er ikke en fullstendig sammenligning/)).toBeInTheDocument();
    expect(section.getByRole('link', { name: 'Kassalapp' })).toHaveAttribute(
      'href',
      'https://kassal.app',
    );
    await expectNoAxeViolations(container);
  });

  it('FR-PRICE-002: own prices in their own block, with where they came from and an "old" mark', async () => {
    scanApi({ own: OWN, external: FOUND });
    renderApp(`/skann?kode=${GTIN}`);
    const section = await pricesSection();
    const own = within(
      (await section.findByRole('heading', { name: 'Det dere har betalt' })).parentElement!,
    );
    expect(own.getByText('For «Testmeieriet Lettmelk» i matlageret.')).toBeInTheDocument();
    expect(own.getByText('Fra kjøp hos Testbutikken')).toBeInTheDocument();
    expect(own.getByRole('link', { name: 'Se kjøpet' })).toHaveAttribute(
      'href',
      `/budsjett/kjop/${PURCHASE}`,
    );
    expect(own.getByText('Ført på varen')).toBeInTheDocument();
    expect(own.getByText('Over 3 måneder gammel')).toBeInTheDocument();
    expect(own.getByText('26,90 kr per l')).toBeInTheDocument();
    // The chains' prices are not in the own block.
    expect(own.queryByText('Spar')).toBeNull();
  });

  it('without a key: says the chains are off and shows no coverage text or credit', async () => {
    scanApi({});
    renderApp(`/skann?kode=${GTIN}`);
    const section = await pricesSection();
    expect(
      await section.findByText(
        'Priser fra kjedene er slått av. Bare det dere selv har betalt, vises.',
      ),
    ).toBeInTheDocument();
    expect(
      section.getByText(
        'Dere har ikke lagt denne strekkoden i matlageret før, så det finnes ingen egne priser for den.',
      ),
    ).toBeInTheDocument();
    expect(section.queryByRole('table')).toBeNull();
    expect(section.queryByText(/Rema 1000/)).toBeNull();
  });

  it('Kassalapp down, with stored prices: a warning with the date they were fetched', async () => {
    scanApi({
      external: { ...FOUND, status: 'unavailable', fetchedAt: '2026-10-24T08:00:00.000Z' },
    });
    renderApp(`/skann?kode=${GTIN}`);
    const section = await pricesSection();
    expect(
      await section.findByText(
        'Prisoppslaget svarer ikke akkurat nå. Prisene under ble hentet 24. okt. og kan være utdaterte.',
      ),
    ).toBeInTheDocument();
    expect(section.getAllByRole('table').length).toBeGreaterThan(0);
  });

  it('Kassalapp down, nothing stored', async () => {
    scanApi({ external: { ...NO_EXTERNAL_PRICES, status: 'unavailable' } });
    renderApp(`/skann?kode=${GTIN}`);
    expect(
      await (
        await pricesSection()
      ).findByText('Prisoppslaget svarer ikke akkurat nå. Prøv igjen senere.'),
    ).toBeInTheDocument();
  });

  it('price not found', async () => {
    scanApi({ external: { ...NO_EXTERNAL_PRICES, status: 'notFound' } });
    renderApp(`/skann?kode=${GTIN}`);
    expect(
      await (await pricesSection()).findByText('Kassalapp har ingen priser for denne strekkoden.'),
    ).toBeInTheDocument();
  });

  it('only old prices: no "cheapest", and it says why', async () => {
    scanApi({
      external: { ...FOUND, observations: [oda, kiwi], cheapest: null, freshCount: 0 },
    });
    renderApp(`/skann?kode=${GTIN}`);
    const section = await pricesSection();
    expect(
      await section.findByText('Ingen kjeder har sjekket prisen de siste 14 dagene.'),
    ).toBeInTheDocument();
    expect(section.queryByText(/Billigst/)).toBeNull();
  });

  it('a failed price request shows an error with a retry, and the scan form is still there', async () => {
    scanApi({ status: 500, body: { error: { code: 'errors.internal' } } });
    renderApp(`/skann?kode=${GTIN}`);
    const section = await pricesSection();
    expect(await section.findByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Legg i matlageret' })).toBeInTheDocument();
  });
});

describe('FR-PRICE-002 the item page', () => {
  const milk = item('Lettmelk', { unit: 'ml' });
  const history: HistoryResponse = { events: [], undoableEventId: null };

  function itemApi(prices: ItemPricesResponse) {
    return mockApi((r) => {
      if (r.path.endsWith(`/items/${milk.id}`)) return { status: 200, body: milk };
      if (r.path.endsWith('/history')) return { status: 200, body: history };
      if (r.path === `/households/${H}/items/${milk.id}/prices`)
        return { status: 200, body: prices };
      return undefined;
    });
  }

  it('an item that was never scanned: own prices, and why there are no chain prices', async () => {
    itemApi({
      own: { ...OWN, item: { id: milk.id, name: 'Lettmelk' } },
      gtin: null,
      external: { ...NO_EXTERNAL_PRICES, status: 'notAsked' },
    });
    const { container } = renderApp(`/matlager/${milk.id}`);
    const section = await pricesSection();
    expect(await section.findByText('Fra kjøp hos Testbutikken')).toBeInTheDocument();
    expect(
      section.getByText(
        'Varen er ikke skannet, så vi kan ikke hente priser fra kjedene. Skann varen neste gang du kjøper den.',
      ),
    ).toBeInTheDocument();
    // The item's own name is the page title; it is not repeated in the block.
    expect(section.queryByText(/i matlageret\./)).toBeNull();
    await expectNoAxeViolations(container);
  });

  it('no own prices yet', async () => {
    itemApi({
      own: { item: { id: milk.id, name: 'Lettmelk' }, entries: [] },
      gtin: GTIN,
      external: FOUND,
    });
    renderApp(`/matlager/${milk.id}`);
    const section = await pricesSection();
    expect(
      await section.findByText(/Dere har ikke ført noen pris for denne varen ennå/),
    ).toBeInTheDocument();
    expect(section.getByText(/Billigst sist observert: Spar/)).toBeInTheDocument();
  });
});

describe('FR-PRICE-003 the shopping list estimate', () => {
  const melk = shoppingItem('Melk', { quantityBase: 500, unit: 'ml' });
  const kaffe = shoppingItem('Testkaffe');
  const tannkrem = shoppingItem('Tannkrem');

  function listApi(estimate: ShoppingPriceEstimateResponse) {
    return mockApi((r) => {
      if (r.path === `/households/${H}/shopping-list`)
        return { status: 200, body: { items: [melk, kaffe, tannkrem] } };
      if (r.path === `/households/${H}/shopping-list/price-estimate`)
        return { status: 200, body: estimate };
      return undefined;
    });
  }

  const ESTIMATE: ShoppingPriceEstimateResponse = {
    lines: [
      {
        shoppingItemId: melk.id,
        estimateOre: 1245,
        source: 'own',
        basis: 'scaled',
        date: '2026-10-20',
        missing: null,
      },
      {
        shoppingItemId: kaffe.id,
        estimateOre: 3990,
        source: 'kassalapp',
        basis: 'onePackage',
        date: '2026-10-22',
        missing: null,
      },
      {
        shoppingItemId: tannkrem.id,
        estimateOre: null,
        source: null,
        basis: null,
        date: null,
        missing: 'noMatch',
      },
    ],
    summary: {
      openLines: 3,
      estimatedLines: 2,
      missingLines: 1,
      estimatedOre: 5235,
      fromOwn: 1,
      fromKassalapp: 1,
    },
  };

  it('says how many lines the estimate covers and how many are missing – never a total; no axe violations', async () => {
    listApi(ESTIMATE);
    const user = userEvent.setup();
    const { container } = renderApp('/handleliste');
    const card = within(
      (await screen.findByRole('heading', { name: 'Anslått pris' })).closest('section')!,
    );
    expect(await card.findByText('Anslag for 2 av 3 linjer: ca. 52,35 kr')).toBeInTheDocument();
    expect(card.getByText('1 linje mangler pris og er ikke med.')).toBeInTheDocument();
    expect(card.getByText('Fra det dere har betalt: 1. Fra Kassalapp: 1.')).toBeInTheDocument();
    expect(card.queryByText(/totalt/i)).toBeNull();
    expect(card.getByText(/Det blir ikke med i budsjettet/)).toBeInTheDocument();

    await user.click(card.getByText('Vis anslag per linje'));
    expect(
      card.getByText('ca. 12,45 kr (regnet ut fra mengden, det dere har betalt, 20. okt.)'),
    ).toBeInTheDocument();
    expect(card.getByText('ca. 39,90 kr (én pakke, Kassalapp, 22. okt.)')).toBeInTheDocument();
    expect(card.getByText('ingen vare i matlageret med dette navnet')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('no line has a price yet', async () => {
    listApi({
      lines: ESTIMATE.lines.map((l) => ({
        ...l,
        estimateOre: null,
        source: null,
        basis: null,
        date: null,
        missing: 'noPrice',
      })),
      summary: {
        openLines: 3,
        estimatedLines: 0,
        missingLines: 3,
        estimatedOre: 0,
        fromOwn: 0,
        fromKassalapp: 0,
      },
    });
    renderApp('/handleliste');
    expect(await screen.findByText(/Ingen av linjene har pris ennå/)).toBeInTheDocument();
    expect(screen.queryByText(/Anslag for/)).toBeNull();
  });

  it('no estimate card when every line is ticked off', async () => {
    mockApi((r) =>
      r.path === `/households/${H}/shopping-list`
        ? {
            status: 200,
            body: {
              items: [
                shoppingItem('Melk', { checked: true, checkedAt: '2026-10-25T10:00:00.000Z' }),
              ],
            },
          }
        : undefined,
    );
    renderApp('/handleliste');
    await screen.findByText('Melk');
    expect(screen.queryByRole('heading', { name: 'Anslått pris' })).toBeNull();
  });
});
