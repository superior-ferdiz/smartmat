import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReceiptResponse, ReceiptSuggestion } from '@smartmat/shared';
import { renderApp, TEST_SESSION } from '../../test/renderApp';
import { mockApi } from '../../test/mockApi';
import { expectNoAxeViolations } from '../../test/axe';
import { purchase } from '../../test/purchaseFixtures';

// Spec 08. All receipt data here is made up.
const H = `/households/${TEST_SESSION.user.householdId}`;
const ID = '0199f0a0-0000-7000-8000-0000000000f1';
const RECEIPT_ID = '0199f0a0-0000-7000-8000-000000000001';
const NOW = new Date().toISOString();

const suggestion: ReceiptSuggestion = {
  storeName: 'Extra',
  storeGuessed: false,
  chain: 'extra',
  purchasedOn: '2026-02-03',
  totalOre: 13232,
  linesShown: false,
  lines: [],
  linesSumOre: 0,
  sumMatches: false,
};

const receipt = (patch: Partial<ReceiptResponse> = {}): ReceiptResponse => ({
  id: RECEIPT_ID,
  status: 'review',
  failureCode: null,
  createdAt: NOW,
  deleteAfter: NOW,
  purchaseId: null,
  suggestion,
  rawText: ['EXTRA', 'GULROT 1KG 19.90'],
  meanConfidence: 88,
  ...patch,
});

const list = (patch: object = {}) => ({
  ocrAvailable: true,
  lineSuggestions: false,
  receipts: [],
  ...patch,
});

describe('FR-RCPT-001 the upload page', () => {
  it('offers camera and file, says what happens to the image; no axe violations', async () => {
    mockApi((r) => (r.path === `${H}/receipts` ? { status: 200, body: list() } : undefined));
    const { container } = renderApp('/budsjett/kvittering');
    expect(await screen.findByRole('button', { name: 'Ta bilde' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Velg fil' })).toBeInTheDocument();
    expect(
      screen.getByText(/slettes når du har bekreftet kjøpet, eller etter 7 dager/),
    ).toBeInTheDocument();
    expect(container.querySelector('#receipt-camera')).toHaveAttribute('capture', 'environment');
    expect(container.querySelector('#receipt-file')).not.toHaveAttribute('capture');
    expect(await screen.findByText('Ingen kvitteringer venter.')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('a chosen photo is sent as multipart and the page opens the new receipt', async () => {
    const requests = mockApi((r) => {
      if (r.path === `${H}/receipts` && r.method === 'GET') return { status: 200, body: list() };
      if (r.path === `${H}/receipts` && r.method === 'POST') {
        return {
          status: 202,
          body: {
            id: RECEIPT_ID,
            status: 'queued',
            failureCode: null,
            createdAt: NOW,
            deleteAfter: NOW,
          },
        };
      }
      if (r.path === `${H}/receipts/${RECEIPT_ID}`)
        return { status: 200, body: receipt({ status: 'queued', suggestion: null }) };
      return undefined;
    });
    const user = userEvent.setup();
    const { container, router } = renderApp('/budsjett/kvittering');
    await screen.findByRole('button', { name: 'Velg fil' });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'bilde.jpg', {
      type: 'image/jpeg',
    });
    await user.upload(container.querySelector<HTMLInputElement>('#receipt-file')!, file);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/budsjett/kvittering/${RECEIPT_ID}`),
    );
    const post = requests.find((r) => r.method === 'POST')!;
    expect(post.body).toBeInstanceOf(FormData);
    expect((post.body as FormData).get('image')).toBeInstanceOf(Blob);
    expect(post.headers['content-type']).toBeUndefined();
    expect(post.headers['x-csrf-token']).toBe(TEST_SESSION.csrfToken);
  });

  it('the same photo again: says so and links to the receipt that is already there', async () => {
    mockApi((r) => {
      if (r.method === 'GET') return { status: 200, body: list() };
      return {
        status: 409,
        body: { error: { code: 'errors.receipt.alreadyUploaded', refId: RECEIPT_ID } },
      };
    });
    const user = userEvent.setup();
    const { container } = renderApp('/budsjett/kvittering');
    await screen.findByRole('button', { name: 'Velg fil' });
    await user.upload(
      container.querySelector<HTMLInputElement>('#receipt-file')!,
      new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByText('Dette bildet er allerede lastet opp.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Åpne den' })).toHaveAttribute(
      'href',
      `/budsjett/kvittering/${RECEIPT_ID}`,
    );
  });

  it('without OCR on the server: no upload, a link to the manual form instead', async () => {
    mockApi((r) =>
      r.path === `${H}/receipts` ? { status: 200, body: list({ ocrAvailable: false }) } : undefined,
    );
    renderApp('/budsjett/kvittering');
    expect(await screen.findByText('Kvitteringslesing er ikke tilgjengelig')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ta bilde' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrer kjøp' })).toHaveAttribute(
      'href',
      '/budsjett/kjop/ny',
    );
  });

  it('lists the open receipts with their status in words', async () => {
    mockApi(() => ({
      status: 200,
      body: list({
        receipts: [
          { id: RECEIPT_ID, status: 'review', failureCode: null, createdAt: NOW, deleteAfter: NOW },
          { id: ID, status: 'failed', failureCode: 'timeout', createdAt: NOW, deleteAfter: NOW },
        ],
      }),
    }));
    renderApp('/budsjett/kvittering');
    expect(await screen.findByText('Klar til sjekk')).toBeInTheDocument();
    expect(screen.getByText('Kunne ikke leses')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Åpne' })).toHaveLength(2);
  });
});

describe('FR-RCPT-001 the camera inside the page', () => {
  let secure: PropertyDescriptor | undefined;
  afterEach(() => {
    if (secure) Object.defineProperty(window, 'isSecureContext', secure);
    else delete (window as { isSecureContext?: boolean }).isSecureContext;
    secure = undefined;
    Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.restoreAllMocks();
  });

  function fakeCamera(getUserMedia: () => Promise<MediaStream>) {
    secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(getUserMedia) },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  }

  const uploaded = () =>
    mockApi((r) => {
      if (r.path === `${H}/receipts` && r.method === 'GET') return { status: 200, body: list() };
      if (r.path === `${H}/receipts` && r.method === 'POST') {
        return {
          status: 202,
          body: {
            id: RECEIPT_ID,
            status: 'queued',
            failureCode: null,
            createdAt: NOW,
            deleteAfter: NOW,
          },
        };
      }
      if (r.path === `${H}/receipts/${RECEIPT_ID}`)
        return { status: 200, body: receipt({ status: 'queued', suggestion: null }) };
      return undefined;
    });

  it('"Ta bilde" opens the back camera in the page; the photo is sent and the camera stopped', async () => {
    const track = { stop: vi.fn() };
    fakeCamera(() => Promise.resolve({ getTracks: () => [track] } as unknown as MediaStream));
    vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
    vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(new Blob(['x'], { type: 'image/jpeg' })),
    );
    const requests = uploaded();
    const user = userEvent.setup();
    const { router } = renderApp('/budsjett/kvittering');
    await user.click(await screen.findByRole('button', { name: 'Ta bilde' }));

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ facingMode: { ideal: 'environment' } }),
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Ta bildet' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/budsjett/kvittering/${RECEIPT_ID}`),
    );
    expect(track.stop).toHaveBeenCalled();
    const post = requests.find((r) => r.method === 'POST')!;
    expect((post.body as FormData).get('image')).toBeInstanceOf(Blob);
  });

  it('camera refused: says so and offers the camera app instead', async () => {
    fakeCamera(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    uploaded();
    const user = userEvent.setup();
    const { container } = renderApp('/budsjett/kvittering');
    await user.click(await screen.findByRole('button', { name: 'Ta bilde' }));

    expect(await screen.findByText('Ingen tilgang til kameraet')).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>('#receipt-camera')!;
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: 'Bruk kamera-appen' }));
    expect(click).toHaveBeenCalled();
    expect(screen.queryByText('Ingen tilgang til kameraet')).not.toBeInTheDocument();
  });

  it("without camera access in the browser: the phone's camera app is asked at once", async () => {
    uploaded();
    const user = userEvent.setup();
    const { container } = renderApp('/budsjett/kvittering');
    await screen.findByRole('button', { name: 'Ta bilde' });
    const click = vi.spyOn(container.querySelector<HTMLInputElement>('#receipt-camera')!, 'click');
    await user.click(screen.getByRole('button', { name: 'Ta bilde' }));
    expect(click).toHaveBeenCalled();
  });
});

describe('FR-RCPT-003 waiting and failing', () => {
  it('queued: a status message, and the manual form as a way out', async () => {
    mockApi(() => ({
      status: 200,
      body: receipt({ status: 'queued', suggestion: null, rawText: null }),
    }));
    const { container } = renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(
      (await screen.findByText(/Kvitteringen står i kø/)).closest('[role="status"]'),
    ).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Fyll inn selv' })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('after a minute of waiting it says it is taking longer than usual', async () => {
    const old = new Date(Date.now() - 2 * 60_000).toISOString();
    mockApi(() => ({
      status: 200,
      body: receipt({ status: 'processing', suggestion: null, createdAt: old }),
    }));
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByText(/tar lengre tid enn vanlig/)).toBeInTheDocument();
    expect(screen.getByText(/Leser kvitteringen/).closest('[role="status"]')).not.toBeNull();
  });

  it('failed: says why, and "try again" queues it again', async () => {
    let status: ReceiptResponse['status'] = 'failed';
    const requests = mockApi((r) => {
      if (r.method === 'POST') {
        status = 'queued';
        return {
          status: 202,
          body: {
            id: RECEIPT_ID,
            status: 'queued',
            failureCode: null,
            createdAt: NOW,
            deleteAfter: NOW,
          },
        };
      }
      return {
        status: 200,
        body: receipt({
          status,
          failureCode: status === 'failed' ? 'noText' : null,
          suggestion: null,
        }),
      };
    });
    const user = userEvent.setup();
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByText(/Vi fant ingen tekst i bildet/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Prøv igjen' }));
    expect(await screen.findByText('Kvitteringen står i kø …')).toBeInTheDocument();
    expect(
      requests.some((r) => r.method === 'POST' && r.path === `${H}/receipts/${RECEIPT_ID}/retry`),
    ).toBe(true);
  });

  it('a receipt that is gone (discarded or past 7 days) says so', async () => {
    mockApi(() => ({ status: 404, body: { error: { code: 'errors.notFound' } } }));
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByText('Fant ikke kvitteringen')).toBeInTheDocument();
  });
});

describe('FR-RCPT-005/006 review and confirm', () => {
  it('ADR-0017: store, date and total are filled in as "only a total"; confirm sends the purchase', async () => {
    const saved = purchase({ id: ID, purchasedOn: '2026-02-03', totalOre: 13232, lines: [] });
    const requests = mockApi((r) => {
      if (r.path === `${H}/receipts/${RECEIPT_ID}`) return { status: 200, body: receipt() };
      if (r.path === `${H}/receipts/${RECEIPT_ID}/confirm`) return { status: 201, body: saved };
      return undefined;
    });
    const user = userEvent.setup();
    const { container, router } = renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByLabelText(/^Butikk/)).toHaveValue('Extra');
    expect(screen.getByLabelText('Kjøpsdato')).toHaveValue('2026-02-03');
    expect(screen.getByRole('radio', { name: 'Bare totalsum' })).toBeChecked();
    expect(screen.getByLabelText('Totalsum')).toHaveValue('132,32');
    expect(screen.getByText(/Linjene leses ikke godt nok ennå/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Bildet av kvitteringen' })).toHaveAttribute(
      'src',
      `/api/v1${H}/receipts/${RECEIPT_ID}/image`,
    );
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'Bekreft kjøpet' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/budsjett/kjop/${ID}`));
    const sent = requests.find((r) => r.method === 'POST')!;
    expect(sent.body).toEqual({
      storeName: 'Extra',
      purchasedOn: '2026-02-03',
      totalOre: 13232,
      lines: [],
      allowPossibleDuplicate: false,
    });
  });

  it('low confidence and a date that was not read are pointed out', async () => {
    mockApi(() => ({
      status: 200,
      body: receipt({ meanConfidence: 40, suggestion: { ...suggestion, purchasedOn: null } }),
    }));
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByText('Lav sikkerhet')).toBeInTheDocument();
    expect(screen.getByText(/Vi fant ikke datoen/)).toBeInTheDocument();
  });

  it('with line suggestions: lines in the form, uncertain ones marked in words, and a sum that does not match', async () => {
    mockApi((r) =>
      r.path !== `${H}/receipts/${RECEIPT_ID}`
        ? undefined
        : {
            status: 200,
            body: receipt({
              suggestion: {
                ...suggestion,
                linesShown: true,
                linesSumOre: 2390,
                sumMatches: false,
                lines: [
                  {
                    description: 'SJOKOLADE',
                    amountOre: 2390,
                    kind: 'item',
                    discountOre: 0,
                    count: 2,
                    weightG: null,
                    unitPriceOre: 1195,
                    vatRate: null,
                    suggestedKind: 'food',
                    confidence: 80,
                    flags: ['quantityMismatch'],
                    uncertain: true,
                  },
                ],
              },
            }),
          },
    );
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByRole('radio', { name: 'Med linjer' })).toBeChecked();
    const lineGroup = screen.getByRole('group', { name: 'Linje 1' });
    expect(within(lineGroup).getByLabelText('Hva')).toHaveValue('SJOKOLADE');
    expect(screen.getByText(/antall × pris stemte ikke med beløpet/)).toBeInTheDocument();
    expect(
      screen.getByText(/Linjene blir 23,90 kr, men kvitteringen sier 132,32 kr/),
    ).toBeInTheDocument();
  });

  it('food lines start ticked for the inventory; a guessed store is pointed out', async () => {
    const parsed = {
      amountOre: 2490,
      kind: 'item' as const,
      discountOre: 0,
      count: null,
      weightG: null,
      unitPriceOre: null,
      vatRate: null,
      confidence: 90,
      flags: [],
      uncertain: false,
    };
    mockApi((r) =>
      r.path === `${H}/receipts/${RECEIPT_ID}`
        ? {
            status: 200,
            body: receipt({
              suggestion: {
                ...suggestion,
                storeName: 'Extra',
                storeGuessed: true,
                chain: null,
                linesShown: true,
                linesSumOre: 2690,
                sumMatches: false,
                lines: [
                  { ...parsed, description: 'MELK', suggestedKind: 'food' },
                  {
                    ...parsed,
                    description: 'PANT',
                    amountOre: 200,
                    kind: 'deposit',
                    suggestedKind: 'nonFood',
                  },
                ],
              },
            }),
          }
        : undefined,
    );
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(
      await screen.findByText(/Vi fant ikke butikknavnet på kvitteringen/),
    ).toBeInTheDocument();
    const milk = screen.getByRole('group', { name: 'Linje 1' });
    expect(within(milk).getByRole('checkbox', { name: 'Legg i matlageret' })).toBeChecked();
    const deposit = screen.getByRole('group', { name: 'Linje 2' });
    expect(
      within(deposit).queryByRole('checkbox', { name: 'Legg i matlageret' }),
    ).not.toBeInTheDocument();
  });

  it('a possible duplicate: warns with a link, and "save anyway" sends allowPossibleDuplicate', async () => {
    const saved = purchase({ id: ID, purchasedOn: '2026-02-03', totalOre: 13232, lines: [] });
    let attempts = 0;
    const requests = mockApi((r) => {
      if (r.path === `${H}/receipts/${RECEIPT_ID}`) return { status: 200, body: receipt() };
      if (r.path === `${H}/receipts/${RECEIPT_ID}/confirm`) {
        attempts += 1;
        return attempts === 1
          ? {
              status: 409,
              body: { error: { code: 'errors.receipt.possibleDuplicate', refId: ID } },
            }
          : { status: 201, body: saved };
      }
      return undefined;
    });
    const user = userEvent.setup();
    const { router } = renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Bekreft kjøpet' }));
    expect(await screen.findByText(/samme dato og sum/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se kjøpet som finnes fra før' })).toHaveAttribute(
      'href',
      `/budsjett/kjop/${ID}`,
    );
    await user.click(screen.getByLabelText(/Lagre likevel/));
    await user.click(screen.getByRole('button', { name: 'Bekreft kjøpet' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/budsjett/kjop/${ID}`));
    const posts = requests.filter((r) => r.method === 'POST');
    expect(
      posts.map((p) => (p.body as { allowPossibleDuplicate: boolean }).allowPossibleDuplicate),
    ).toEqual([false, true]);
  });

  it('discard asks first, then deletes and goes back to the list', async () => {
    const requests = mockApi((r) => {
      if (r.method === 'DELETE') return { status: 204 };
      if (r.path === `${H}/receipts`) return { status: 200, body: list() };
      return { status: 200, body: receipt() };
    });
    const user = userEvent.setup();
    const { router } = renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    await user.click(await screen.findByRole('button', { name: 'Forkast kvitteringen' }));
    const dialog = screen.getByRole('dialog', { name: 'Forkaste kvitteringen?' });
    await user.click(within(dialog).getByRole('button', { name: 'Forkast' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/budsjett/kvittering'));
    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === `${H}/receipts/${RECEIPT_ID}`),
    ).toBe(true);
  });

  it('confirmed: links to the purchase', async () => {
    mockApi(() => ({
      status: 200,
      body: receipt({ status: 'confirmed', purchaseId: ID, suggestion: null, rawText: null }),
    }));
    renderApp(`/budsjett/kvittering/${RECEIPT_ID}`);
    expect(await screen.findByText('Kvitteringen er registrert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se kjøpet' })).toHaveAttribute(
      'href',
      `/budsjett/kjop/${ID}`,
    );
  });
});
