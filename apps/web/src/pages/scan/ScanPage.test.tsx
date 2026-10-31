import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BarcodeLookupResponse, IngredientResponse } from '@smartmat/shared';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi, type RecordedRequest } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { FREEZER, FRIDGE, item } from '../../test/inventoryFixtures';

/*
 * FR-SCAN-001–005 in the browser (jsdom). The camera and the barcode reader are faked: jsdom has neither.
 * The real camera is a manual test on a phone (chapter 11); Playwright covers typing a code end to end.
 */

const detect = vi.fn();
vi.mock('../../scan/detector', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../scan/detector')>();
  return {
    ...original,
    createDetector: vi.fn(async () => ({ detector: { detect }, kind: 'native' })),
  };
});

const H = TEST_SESSION.user.householdId;
const GTIN = '7038010000737';
const MELK = '0199f0a0-0000-7000-8000-0000000000e1';
const lookupPath = (gtin = GTIN) => `/households/${H}/barcodes/${gtin}`;

const INGREDIENTS: IngredientResponse[] = [
  {
    id: MELK,
    key: 'melk',
    name: 'melk',
    baseUnit: 'ml',
    isStaple: false,
    aliases: ['melk', 'lettmelk'],
  },
] as unknown as IngredientResponse[];

const empty: BarcodeLookupResponse['suggestion'] = {
  name: null,
  brand: null,
  categoryKey: null,
  unit: null,
  quantityBase: null,
  ingredient: null,
  locationId: null,
  expiryKind: null,
};

function found(overrides: Partial<BarcodeLookupResponse> = {}): BarcodeLookupResponse {
  return {
    gtin: GTIN,
    storeCode: false,
    source: 'openFoodFacts',
    providerStatus: 'found',
    suggestion: {
      ...empty,
      name: 'Testmeieriet Lettmelk',
      brand: 'Testmeieriet',
      categoryKey: 'dairy',
      unit: 'ml',
      quantityBase: 1000,
    },
    existingItem: null,
    ...overrides,
  };
}

function api(lookup: BarcodeLookupResponse | { status: number; body: unknown }) {
  const created = item('Testmeieriet Lettmelk', { unit: 'ml' });
  const requests = mockApi((r: RecordedRequest) => {
    if (r.path === '/ingredients') return { status: 200, body: INGREDIENTS };
    if (r.method === 'GET' && r.path.startsWith(`/households/${H}/barcodes/`)) {
      return 'status' in lookup ? lookup : { status: 200, body: lookup };
    }
    if (r.method === 'POST' && r.path.endsWith('/confirm'))
      return { status: 201, body: { item: created } };
    return undefined;
  });
  return { requests, created };
}

let secure: PropertyDescriptor | undefined;
beforeEach(() => {
  secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
});
afterEach(() => {
  if (secure) Object.defineProperty(window, 'isSecureContext', secure);
  else delete (window as { isSecureContext?: boolean }).isSecureContext;
  Reflect.deleteProperty(navigator, 'mediaDevices');
  detect.mockReset();
});

function fakeCamera(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(getUserMedia) },
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
}

const stream = () => {
  const track = { stop: vi.fn() };
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
};

describe('FR-SCAN-003 typing the code', () => {
  it('a wrong check digit is refused in the browser, nothing is sent; no axe violations', async () => {
    const { requests } = api(found());
    const user = userEvent.setup();
    const { container } = renderApp('/skann');
    await user.type(await screen.findByLabelText(/^Strekkode/), '7038010000738');
    await user.click(screen.getByRole('button', { name: 'Slå opp' }));
    expect(
      screen.getByText('Strekkoden stemmer ikke. Sjekk at alle sifrene er riktige.'),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.path.includes('/barcodes/'))).toEqual([]);
    await expectNoAxeViolations(container);
  });

  it('a valid code goes into the URL (normalized) and is looked up', async () => {
    const { requests } = api(found({ gtin: '0036000291452' }));
    const user = userEvent.setup();
    const { router } = renderApp('/skann');
    await user.type(await screen.findByLabelText(/^Strekkode/), '0360 0029 1452');
    await user.click(screen.getByRole('button', { name: 'Slå opp' }));
    await screen.findByText('Strekkode: 0036000291452');
    expect(router.state.location.search).toBe('?kode=0036000291452');
    expect(requests.some((r) => r.path === lookupPath('0036000291452'))).toBe(true);
  });

  it('an invalid code in the URL shows the error at the field', async () => {
    api(found());
    renderApp('/skann?kode=123');
    expect(
      await screen.findByText('Strekkoden skal ha 8, 12, 13 eller 14 sifre.'),
    ).toBeInTheDocument();
  });
});

describe('FR-SCAN-002/-005 from lookup to the pantry', () => {
  it('known code: the form is filled in; confirming sends what the user checked, once', async () => {
    const { requests, created } = api(found());
    const user = userEvent.setup();
    const { container, router } = renderApp(`/skann?kode=${GTIN}`);
    expect(await screen.findByText(/Funnet i Open Food Facts/)).toBeInTheDocument();
    expect(screen.getByText(/Merke: Testmeieriet/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk');
    expect(screen.getByLabelText('Kategori')).toHaveValue('dairy');
    expect(screen.getByLabelText('Mengde')).toHaveValue('1');
    expect(screen.getByLabelText('Enhet')).toHaveValue('l');
    expect(screen.getByLabelText('Lagringssted')).toHaveValue(FRIDGE);
    // Spec 05 rules, live in the form.
    expect(await screen.findByRole('option', { name: 'Automatisk: melk' })).toBeInTheDocument();
    await expectNoAxeViolations(container);

    await user.selectOptions(screen.getByLabelText('Lagringssted'), FREEZER);
    await user.click(screen.getByRole('button', { name: 'Legg i matlageret' }));
    expect(await screen.findByText(`${created.name} er lagt i matlageret.`)).toBeInTheDocument();
    expect(router.state.location.search).toBe('');

    const posts = requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      path: `${lookupPath()}/confirm`,
      body: {
        mode: 'newItem',
        name: 'Testmeieriet Lettmelk',
        categoryKey: 'dairy',
        unit: 'ml',
        ingredient: { match: 'auto' },
        batch: { quantityBase: 1000, locationId: FREEZER, expiry: null },
      },
    });
    expect(posts[0]?.body).toHaveProperty(
      'clientRequestId',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(screen.getByRole('link', { name: 'Se varen' })).toHaveAttribute(
      'href',
      `/matlager/${created.id}`,
    );
  });

  it('nothing is sent while required fields are missing', async () => {
    const { requests } = api(
      found({ source: 'none', providerStatus: 'notFound', suggestion: empty }),
    );
    const user = userEvent.setup();
    renderApp(`/skann?kode=${GTIN}`);
    expect(await screen.findByText(/Vi fant ikke denne strekkoden/)).toBeInTheDocument();
    expect(await screen.findByLabelText(/Navn på varen/)).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Legg i matlageret' }));
    const summary = screen.getByRole('alert', { name: /feil/ });
    expect(summary).toHaveTextContent('Skriv inn navnet på varen.');
    expect(summary).toHaveTextContent('Velg en kategori.');
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
  });

  it.each([
    [
      found({ source: 'none', providerStatus: 'unavailable', suggestion: empty }),
      /svarer ikke akkurat nå/,
    ],
    [
      found({ storeCode: true, source: 'none', providerStatus: 'notAsked', suggestion: empty }),
      /Butikkens egen kode/,
    ],
    [
      found({ source: 'none', providerStatus: 'off', suggestion: empty }),
      /Produktoppslag er ikke slått på/,
    ],
    [
      found({
        gtin: '9812345678902',
        storeCode: true,
        source: 'none',
        providerStatus: 'notAsked',
        suggestion: empty,
      }),
      /strekkoden på en kvittering eller kupong/,
    ],
    [found({ source: 'household', providerStatus: 'notAsked' }), /Dere har skannet denne før/],
  ])('says where the answers come from (%#)', async (lookup, text) => {
    api(lookup);
    renderApp(`/skann?kode=${GTIN}`);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Legg i matlageret' })).toBeInTheDocument();
  });

  it("a receipt's own barcode: says so and links to receipt upload", async () => {
    api(
      found({
        gtin: '9812345678902',
        storeCode: true,
        source: 'none',
        providerStatus: 'notAsked',
        suggestion: empty,
      }),
    );
    renderApp('/skann?kode=9812345678902');
    expect(await screen.findByRole('link', { name: 'Les kvitteringen i stedet' })).toHaveAttribute(
      'href',
      '/budsjett/kvittering',
    );
  });

  it('the item from last time: "new batch" is chosen; the item fields are hidden', async () => {
    const existing = {
      id: '0199f0a0-0000-7000-8000-0000000000a1',
      name: 'Melka vår',
      unit: 'ml' as const,
    };
    const { requests } = api(
      found({ source: 'household', providerStatus: 'notAsked', existingItem: existing }),
    );
    const user = userEvent.setup();
    renderApp(`/skann?kode=${GTIN}`);
    expect(await screen.findByLabelText('Nytt parti på «Melka vår»')).toBeChecked();
    expect(screen.queryByLabelText(/Navn på varen/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Legg i matlageret' }));
    await screen.findByText(/er lagt i matlageret/);
    expect(requests.find((r) => r.method === 'POST')?.body).toMatchObject({
      mode: 'existingItem',
      itemId: existing.id,
      batch: { quantityBase: 1000 },
    });
  });

  it('"Ny vare" instead of the item from last time shows the item fields again', async () => {
    const existing = {
      id: '0199f0a0-0000-7000-8000-0000000000a1',
      name: 'Melka vår',
      unit: 'ml' as const,
    };
    api(found({ source: 'household', providerStatus: 'notAsked', existingItem: existing }));
    const user = userEvent.setup();
    renderApp(`/skann?kode=${GTIN}`);
    await user.click(await screen.findByLabelText('Ny vare'));
    expect(screen.getByLabelText(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk');
  });

  it('a rate-limited lookup says so, with a retry button', async () => {
    api({ status: 429, body: { error: { code: 'errors.rateLimited' } } });
    renderApp(`/skann?kode=${GTIN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/For mange forsøk|vent/i);
    expect(screen.getByRole('button', { name: 'Prøv igjen' })).toBeInTheDocument();
  });

  it('credits Open Food Facts with the licence (ODbL)', async () => {
    api(found());
    renderApp('/skann');
    expect(await screen.findByRole('link', { name: 'Open Food Facts' })).toHaveAttribute(
      'href',
      'https://openfoodfacts.org',
    );
    expect(screen.getByRole('link', { name: 'lisens ODbL' })).toBeInTheDocument();
  });
});

describe('FR-SCAN-001 camera states', () => {
  it('not a secure page (http): says so, no camera button', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    api(found());
    renderApp('/skann');
    expect(await screen.findByText('Kameraet krever en sikker side')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start kamera' })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Strekkode/)).toBeInTheDocument();
  });

  it('no camera support in the browser', async () => {
    api(found());
    renderApp('/skann');
    expect(await screen.findByText('Nettleseren støtter ikke kamera')).toBeInTheDocument();
  });

  it.each([
    ['NotAllowedError', 'Ingen tilgang til kameraet'],
    ['NotFoundError', 'Fant ikke noe kamera'],
    ['AbortError', 'Kameraet startet ikke'],
  ])('%s → "%s", and the code can still be typed', async (name, title) => {
    fakeCamera(() => Promise.reject(new DOMException('no', name)));
    api(found());
    const user = userEvent.setup();
    renderApp('/skann');
    await user.click(await screen.findByRole('button', { name: 'Start kamera' }));
    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText(/Du kan skrive inn strekkoden i stedet/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Strekkode/)).toBeInTheDocument();
  });

  it('the camera is only started on request; a read code is looked up and the camera stopped', async () => {
    const { stream: media, track } = stream();
    fakeCamera(() => Promise.resolve(media));
    // First a misread (wrong check digit) that must be ignored, then the real code.
    detect
      .mockResolvedValueOnce([{ rawValue: '7038010000738', format: 'ean_13' }])
      .mockResolvedValue([{ rawValue: GTIN, format: 'ean_13' }]);
    const { requests } = api(found());
    const user = userEvent.setup();
    const { router } = renderApp('/skann');
    await screen.findByRole('button', { name: 'Start kamera' });
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Start kamera' }));
    await waitFor(() => expect(router.state.location.search).toBe(`?kode=${GTIN}`));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false }),
    );
    expect(track.stop).toHaveBeenCalled();
    expect(await screen.findByLabelText(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk');
    // Only the code went to the API – no picture.
    const bodies = requests.filter((r) => r.body !== undefined);
    expect(bodies).toEqual([]);
  });

  it('UPC-E from the camera is written out before the lookup', async () => {
    fakeCamera(() => Promise.resolve(stream().stream));
    detect.mockResolvedValue([{ rawValue: '04252614', format: 'upc_e' }]);
    api(found({ gtin: '0042100005264' }));
    const user = userEvent.setup();
    const { router } = renderApp('/skann');
    await user.click(await screen.findByRole('button', { name: 'Start kamera' }));
    await waitFor(() => expect(router.state.location.search).toBe('?kode=0042100005264'));
  });

  it('"Stopp kamera" stops the camera', async () => {
    const { stream: media, track } = stream();
    fakeCamera(() => Promise.resolve(media));
    detect.mockResolvedValue([]);
    api(found());
    const user = userEvent.setup();
    renderApp('/skann');
    await user.click(await screen.findByRole('button', { name: 'Start kamera' }));
    await screen.findByText('Hold strekkoden inne i rammen.');
    await user.click(screen.getByRole('button', { name: 'Stopp kamera' }));
    expect(track.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Start kamera' })).toBeInTheDocument();
  });
});
