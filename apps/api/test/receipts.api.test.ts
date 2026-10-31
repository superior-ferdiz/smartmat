import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { API_ERRORS, type PurchaseResponse, type ReceiptListResponse } from '@smartmat/shared';
import {
  COOP_RECEIPT,
  GENERIC_RECEIPT,
  NG_RECEIPT,
  NOISY_COOP_RECEIPT,
} from '@smartmat/shared/test-fixtures/receipts';
import { createPurchaseRepo, ReceiptNotInReviewError } from '../src/modules/purchases/repo';
import { createFakeClock } from '../src/test/fakes';
import {
  captureLog,
  call,
  createTestApp,
  registerUser,
  useTestDatabase,
  type Client,
} from './helpers';
import { createPurchase, inventoryOf, purchasesPath } from './purchaseHelpers';
import { locationsOf } from './inventoryHelpers';
import {
  fakeOcr,
  fakeQueue,
  getReceipt,
  ocrText,
  phonePhoto,
  receiptsPath,
  reviewed,
  runWorker,
  upload,
  uploadRaw,
} from './receiptHelpers';

/*
 * Spec 08 against the real test database: upload → worker (with a fake OCR) → review → confirm → purchase and
 * inventory. The OCR text is always made up (packages/shared/src/receipts/fixtures.ts).
 */

const db = useTestDatabase();
const DAY = 24 * 60 * 60 * 1000;
const clock = createFakeClock(new Date('2026-10-24T10:00:00Z'));
const { queue, ids: queued } = fakeQueue();
const log = captureLog();
let app: FastifyInstance;
let user: Client;

beforeAll(async () => {
  app = await createTestApp(db, {
    now: clock.now,
    receiptQueue: queue,
    logStream: log.stream,
    config: { logLevel: 'info' },
  });
});
afterAll(() => app.close());

/** The fictional Coop receipt: Extra, 3 Feb 2026, 132,32 kr, six lines (one deposit, one bag). */
const coopConfirm = (fridge: string) => ({
  storeName: 'Extra',
  purchasedOn: '2026-02-03',
  lines: [
    {
      description: 'BANAN KG',
      kind: 'food',
      categoryKey: 'fruitVeg',
      amountOre: 2392,
      toInventory: { unit: 'g', quantityBase: 1196, locationId: fridge },
    },
    { description: 'GULROT 1KG', kind: 'food', categoryKey: 'fruitVeg', amountOre: 1990 },
    {
      description: 'YOGHURT NATURELL 4X',
      kind: 'food',
      categoryKey: 'dairy',
      amountOre: 5960,
      toInventory: { unit: 'stk', quantityBase: 4, locationId: fridge },
    },
    { description: 'BRUS SITRON 0.5L', kind: 'food', categoryKey: 'drinks', amountOre: 2290 },
    { description: 'PANT', kind: 'nonFood', amountOre: 200 },
    { description: 'PLASTPOSE', kind: 'nonFood', amountOre: 400 },
  ],
});

async function readyReceipt(client: Client, text = ocrText()) {
  const receipt = await upload(app, client);
  await runWorker(db, receipt.id, fakeOcr(text));
  return receipt;
}

describe('FR-RCPT-001/002 upload', () => {
  it('accepts a photo, queues it and stores it rewritten without any metadata', async () => {
    user = await registerUser(app);
    const original = await phonePhoto(1);
    expect((await sharp(original).metadata()).exif).toBeDefined();

    const response = await uploadRaw(app, user, original);
    expect(response.statusCode, response.body).toBe(202);
    const receipt = response.json<{ id: string; status: string; deleteAfter: string }>();
    expect(receipt.status).toBe('queued');
    expect(queued).toContain(receipt.id);
    // FR-RCPT-008: deleted after 7 days unless confirmed.
    expect(new Date(receipt.deleteAfter).getTime() - clock.now().getTime()).toBe(7 * DAY);

    const stored = await db.receiptImage.findUniqueOrThrow({ where: { receiptId: receipt.id } });
    const bytes = Buffer.from(stored.bytes);
    const meta = await sharp(bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(bytes.includes(Buffer.from('TestPhone'))).toBe(false);
    expect(bytes.equals(original)).toBe(false);
    // EXIF orientation 6 turned the 600×900 photo upright: 900×600.
    expect([stored.width, stored.height]).toEqual([900, 600]);
  });

  it('refuses the same photo twice while the first is open, pointing to it', async () => {
    user = await registerUser(app);
    const photo = await phonePhoto(2);
    const first = await upload(app, user, photo);
    const again = await uploadRaw(app, user, photo);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({
      error: { code: API_ERRORS.receiptAlreadyUploaded, refId: first.id },
    });
  });

  it('refuses other file types by their content, broken files, and a missing or wrongly named file', async () => {
    user = await registerUser(app);
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
      .gif()
      .toBuffer();
    expect((await uploadRaw(app, user, gif, { type: 'image/jpeg' })).json().error.code).toBe(
      API_ERRORS.receiptUnsupportedType,
    );
    const pdf = Buffer.from('%PDF-1.7 fiktiv');
    expect((await uploadRaw(app, user, pdf)).statusCode).toBe(415);
    const broken = (await phonePhoto(3)).subarray(0, 200);
    expect((await uploadRaw(app, user, broken)).json().error.code).toBe(
      API_ERRORS.receiptUnreadable,
    );
    const wrongField = await uploadRaw(app, user, await phonePhoto(4), { field: 'fil' });
    expect(wrongField.statusCode).toBe(400);
    const json = await call(app, 'POST', receiptsPath(user), {
      client: user,
      body: { image: 'x' },
    });
    expect(json.statusCode).toBe(415);
    expect(await db.receipt.count()).toBe(0);
  });

  it('refuses files over 10 MB and images over 40 megapixels', async () => {
    user = await registerUser(app);
    const big = Buffer.concat([await phonePhoto(5), Buffer.alloc(10 * 1024 * 1024)]);
    const tooBig = await uploadRaw(app, user, big);
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json().error.code).toBe(API_ERRORS.receiptTooLarge);
    const bomb = await sharp({
      create: { width: 8000, height: 6000, channels: 3, background: '#fff' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect((await uploadRaw(app, user, bomb, { type: 'image/png' })).statusCode).toBe(413);
    expect(await db.receipt.count()).toBe(0);
  });
});

describe('FR-RCPT-003/004 reading in the background', () => {
  it('a read receipt is ready for review: store, date and total, and no lines by default (ADR-0017)', async () => {
    user = await registerUser(app);
    const receipt = await readyReceipt(user);
    const body = await reviewed(app, user, receipt.id);
    expect(body).toMatchObject({
      status: 'review',
      failureCode: null,
      purchaseId: null,
      meanConfidence: 91,
      suggestion: {
        storeName: 'Extra',
        chain: 'extra',
        purchasedOn: '2026-02-03',
        totalOre: 13232,
        linesShown: false,
        lines: [],
        sumMatches: true,
      },
    });
    // The raw text is there to help with corrections, without the payment lines.
    expect(body.rawText).toContain('GULROT 1KG 19.90');
    expect(body.rawText!.join('\n')).not.toMatch(/xxxx|AID:|Authorization|Terminal/i);
    const stored = await db.receiptExtraction.findUniqueOrThrow({
      where: { receiptId: receipt.id },
    });
    expect(stored.rawText).not.toMatch(/xxxx|AID:|Authorization|Terminal/i);
  });

  it('with line suggestions switched on, the parsed lines are included', async () => {
    const withLines = await createTestApp(db, {
      now: clock.now,
      receiptQueue: queue,
      config: {
        receipts: {
          ocrProvider: 'tesseract',
          tesseractCommand: ['x'],
          ocrTimeoutMs: 1000,
          lineSuggestions: true,
          uploadsPerUserPerHour: 100,
          maxQueued: 100,
        },
      },
    });
    try {
      const client = await registerUser(withLines);
      const receipt = await upload(withLines, client);
      await runWorker(db, receipt.id);
      const body = await reviewed(withLines, client, receipt.id);
      expect(body.suggestion?.linesShown).toBe(true);
      expect(
        body.suggestion?.lines.map((l) => [l.description, l.amountOre, l.suggestedKind]),
      ).toEqual([
        ['BANAN KG', 2392, 'food'],
        ['GULROT 1KG', 1990, 'food'],
        ['YOGHURT NATURELL 4X', 5960, 'food'],
        ['BRUS SITRON 0.5L', 2290, 'food'],
        ['PANT', 200, 'nonFood'],
        ['PLASTPOSE', 400, 'nonFood'],
      ]);
      expect(body.suggestion?.lines[0]).toMatchObject({ weightG: 1196, unitPriceOre: 2000 });
    } finally {
      await withLines.close();
    }
  });

  it('no chain read: a second, harder reading finds the logo; a chain of another format is ignored', async () => {
    user = await registerUser(app);
    const found = await upload(app, user);
    // The second reading sees the logo (made-up text: the Coop fixture has "EXTRA" at the top).
    await runWorker(db, found.id, fakeOcr(ocrText(NOISY_COOP_RECEIPT)), fakeOcr(ocrText()));
    expect((await reviewed(app, user, found.id)).suggestion).toMatchObject({
      storeName: 'Extra',
      chain: 'extra',
      storeGuessed: false,
    });

    const wrong = await upload(app, user);
    // A NorgesGruppen chain on a Coop-format receipt is a misreading.
    await runWorker(
      db,
      wrong.id,
      fakeOcr(ocrText(NOISY_COOP_RECEIPT)),
      fakeOcr(ocrText(NG_RECEIPT)),
    );
    expect((await reviewed(app, user, wrong.id)).suggestion).toMatchObject({
      storeName: null,
      chain: null,
      storeGuessed: false,
    });
  });

  it("no chain anywhere: the household's latest store of the same format is suggested, as a guess", async () => {
    user = await registerUser(app);
    await createPurchase(app, user, {
      storeName: 'Kiwi',
      purchasedOn: '2026-10-20',
      totalOre: 5000,
      lines: [],
    });
    await createPurchase(app, user, {
      storeName: 'extra',
      purchasedOn: '2026-10-01',
      totalOre: 5000,
      lines: [],
    });
    await createPurchase(app, user, {
      storeName: 'Bakeriet',
      purchasedOn: '2026-10-22',
      totalOre: 5000,
      lines: [],
    });
    const receipt = await readyReceipt(user, ocrText(NOISY_COOP_RECEIPT));
    expect((await reviewed(app, user, receipt.id)).suggestion).toMatchObject({
      storeName: 'extra',
      chain: null,
      storeGuessed: true,
    });

    // Another household's purchases are never used.
    const other = await registerUser(app);
    const theirs = await readyReceipt(other, ocrText(NOISY_COOP_RECEIPT));
    expect((await reviewed(app, other, theirs.id)).suggestion).toMatchObject({
      storeName: null,
      storeGuessed: false,
    });
  });

  it.each([
    ['timeout', { ok: false, failure: 'timeout' }],
    ['invalidResponse', { ok: false, failure: 'invalidResponse' }],
    ['noText', { ok: false, failure: 'noText' }],
    ['unavailable', { ok: false, failure: 'unavailable' }],
  ] as const)(
    'an OCR failure (%s) leaves the receipt failed with that code',
    async (code, answer) => {
      user = await registerUser(app);
      const receipt = await readyReceipt(user, answer);
      expect(await reviewed(app, user, receipt.id)).toMatchObject({
        status: 'failed',
        failureCode: code,
        suggestion: null,
      });
    },
  );

  it('a provider that throws, or text with only payment lines, fails instead of hanging', async () => {
    user = await registerUser(app);
    const thrown = await upload(app, user);
    await runWorker(
      db,
      thrown.id,
      fakeOcr(() => Promise.reject(new Error('boom'))),
    );
    expect((await reviewed(app, user, thrown.id)).failureCode).toBe('unavailable');

    const payOnly = await upload(app, user);
    await runWorker(
      db,
      payOnly.id,
      fakeOcr(
        ocrText([
          { text: 'xxxxxxxxxxxx0000-01', confidence: 90 },
          { text: 'AID: A00000', confidence: 90 },
        ]),
      ),
    );
    expect((await reviewed(app, user, payOnly.id)).failureCode).toBe('noText');
    expect(await db.receiptExtraction.count({ where: { receiptId: payOnly.id } })).toBe(0);
  });

  it('a receipt the worker already handled is not read again', async () => {
    user = await registerUser(app);
    const receipt = await readyReceipt(user);
    const second = await runWorker(db, receipt.id, fakeOcr(ocrText(GENERIC_RECEIPT)));
    expect(second).toContain('"outcome":"skipped"');
    expect((await reviewed(app, user, receipt.id)).suggestion?.storeName).toBe('Extra');
  });

  it('retry puts a failed receipt back in the queue; a receipt in review cannot be retried', async () => {
    user = await registerUser(app);
    const failed = await readyReceipt(user, { ok: false, failure: 'timeout' });
    const retry = await call(app, 'POST', receiptsPath(user, `/${failed.id}/retry`), {
      client: user,
    });
    expect(retry.statusCode, retry.body).toBe(202);
    expect(queued.filter((id) => id === failed.id)).toHaveLength(2);
    await runWorker(db, failed.id);
    expect((await reviewed(app, user, failed.id)).status).toBe('review');
    const again = await call(app, 'POST', receiptsPath(user, `/${failed.id}/retry`), {
      client: user,
    });
    expect(again.json().error.code).toBe(API_ERRORS.receiptCannotRetry);
  });

  it('the list shows open receipts and says whether OCR and line suggestions are on', async () => {
    user = await registerUser(app);
    const a = await upload(app, user);
    const b = await readyReceipt(user);
    const list = (
      await call(app, 'GET', receiptsPath(user), { client: user })
    ).json<ReceiptListResponse>();
    expect(list.ocrAvailable).toBe(true);
    expect(list.lineSuggestions).toBe(false);
    expect(list.receipts.map((r) => [r.id, r.status]).sort()).toEqual(
      [
        [a.id, 'queued'],
        [b.id, 'review'],
      ].sort(),
    );
  });

  it('the image is served to the household with no-store', async () => {
    user = await registerUser(app);
    const receipt = await upload(app, user);
    const response = await call(app, 'GET', receiptsPath(user, `/${receipt.id}/image`), {
      client: user,
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['cache-control']).toContain('no-store');
    expect((await sharp(response.rawPayload).metadata()).format).toBe('jpeg');
  });
});

describe('FR-RCPT-006 confirm', () => {
  it('makes the purchase, its lines and the inventory batches, and closes the receipt in the same step', async () => {
    user = await registerUser(app);
    const { fridge } = await locationsOf(app, user);
    const receipt = await readyReceipt(user);
    const response = await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body: coopConfirm(fridge),
    });
    expect(response.statusCode, response.body).toBe(201);
    const purchase = response.json<PurchaseResponse>();
    expect(purchase).toMatchObject({
      source: 'receipt',
      storeName: 'Extra',
      purchasedOn: '2026-02-03',
      totalOre: 13232,
    });
    expect(purchase.lines).toHaveLength(6);

    const items = await inventoryOf(app, user);
    expect(items.map((i) => i.name).sort()).toEqual(['BANAN KG', 'YOGHURT NATURELL 4X']);
    const events = await db.inventoryEvent.findMany({
      where: { householdId: user.user.householdId },
    });
    expect(events.map((e) => e.type)).toEqual(['add', 'add']);

    const closed = await reviewed(app, user, receipt.id);
    expect(closed).toMatchObject({
      status: 'confirmed',
      purchaseId: purchase.id,
      suggestion: null,
      rawText: null,
    });
    expect(await db.receiptImage.count({ where: { receiptId: receipt.id } })).toBe(0);
    expect(await db.receiptExtraction.count({ where: { receiptId: receipt.id } })).toBe(0);
    expect(
      (await db.receipt.findUniqueOrThrow({ where: { id: receipt.id } })).imageSha256,
    ).toBeNull();
    expect(
      (await call(app, 'GET', receiptsPath(user, `/${receipt.id}/image`), { client: user }))
        .statusCode,
    ).toBe(404);
  });

  it('confirming the same receipt twice, also at the same moment, gives one purchase (NFR-DATA-002)', async () => {
    user = await registerUser(app);
    const { fridge } = await locationsOf(app, user);
    const receipt = await readyReceipt(user);
    const send = () =>
      call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
        client: user,
        body: coopConfirm(fridge),
      });
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 201]);
    expect(a.json<PurchaseResponse>().id).toBe(b.json<PurchaseResponse>().id);
    const later = await send();
    expect(later.statusCode).toBe(200);
    expect(await db.purchase.count({ where: { householdId: user.user.householdId } })).toBe(1);
    expect(await db.inventoryBatch.count({ where: { householdId: user.user.householdId } })).toBe(
      2,
    );
  });

  it('the same receipt photographed again is refused as a duplicate of the first purchase', async () => {
    user = await registerUser(app);
    const { fridge } = await locationsOf(app, user);
    const first = await readyReceipt(user);
    const saved = (
      await call(app, 'POST', receiptsPath(user, `/${first.id}/confirm`), {
        client: user,
        body: coopConfirm(fridge),
      })
    ).json<PurchaseResponse>();
    const second = await readyReceipt(user);
    const response = await call(app, 'POST', receiptsPath(user, `/${second.id}/confirm`), {
      client: user,
      body: coopConfirm(fridge),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: API_ERRORS.receiptDuplicate, refId: saved.id },
    });
    // Even when the user insists: the strong key is unique.
    const insist = await call(app, 'POST', receiptsPath(user, `/${second.id}/confirm`), {
      client: user,
      body: { ...coopConfirm(fridge), allowPossibleDuplicate: true },
    });
    expect(insist.statusCode).toBe(409);
    expect(await db.purchase.count({ where: { householdId: user.user.householdId } })).toBe(1);
    expect((await reviewed(app, user, second.id)).status).toBe('review');
  });

  it('without receipt number and time, a purchase with the same date and total is a possible duplicate', async () => {
    user = await registerUser(app);
    const manual = await call(app, 'POST', purchasesPath(user), {
      client: user,
      body: { purchasedOn: '2026-05-07', totalOre: 11470 },
    });
    const receipt = await readyReceipt(user, ocrText(GENERIC_RECEIPT));
    const body = { purchasedOn: '2026-05-07', totalOre: 11470 };
    const warned = await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body,
    });
    expect(warned.statusCode).toBe(409);
    expect(warned.json()).toEqual({
      error: {
        code: API_ERRORS.receiptPossibleDuplicate,
        refId: manual.json<PurchaseResponse>().id,
      },
    });
    const insisted = await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body: { ...body, allowPossibleDuplicate: true },
    });
    expect(insisted.statusCode, insisted.body).toBe(201);
    expect(insisted.json<PurchaseResponse>()).toMatchObject({
      source: 'receipt',
      totalOre: 11470,
      lines: [],
    });
  });

  it('a receipt that is not read yet, or failed, cannot be confirmed; the purchase rules still apply', async () => {
    user = await registerUser(app);
    const waiting = await upload(app, user);
    const early = await call(app, 'POST', receiptsPath(user, `/${waiting.id}/confirm`), {
      client: user,
      body: { purchasedOn: '2026-02-03', totalOre: 100 },
    });
    expect(early.json().error.code).toBe(API_ERRORS.receiptNotReady);

    const receipt = await readyReceipt(user);
    const future = await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body: { purchasedOn: '2026-12-01', totalOre: 100 },
    });
    expect(future.statusCode).toBe(400);
    expect(future.json().error.fields).toEqual({ purchasedOn: 'validation.purchase.dateInFuture' });
    const both = await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body: {
        purchasedOn: '2026-02-03',
        totalOre: 100,
        lines: [{ description: 'X', kind: 'nonFood', amountOre: 100 }],
      },
    });
    expect(both.statusCode).toBe(400);
    expect(await db.purchase.count({ where: { householdId: user.user.householdId } })).toBe(0);
    expect((await reviewed(app, user, receipt.id)).status).toBe('review');
  });

  it('the repo itself refuses to close a receipt that is not in review, and saves nothing', async () => {
    // The service already answers 409 before the repo is reached; this checks the second layer on its own.
    user = await registerUser(app);
    const waiting = await upload(app, user);
    const repo = createPurchaseRepo(db);
    const write = { storeName: null, purchasedOn: '2026-02-03', totalOre: 100, lines: [] };
    await expect(
      repo.create(user.user.householdId, user.user.id, write, 'receipt-id:test', {
        id: waiting.id,
        confirmedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(ReceiptNotInReviewError);
    expect(await db.purchase.count({ where: { householdId: user.user.householdId } })).toBe(0);
    expect((await reviewed(app, user, waiting.id)).status).toBe('queued');
  });

  it('an inventory line pointing to a place that does not exist saves nothing, and the receipt stays open', async () => {
    user = await registerUser(app);
    const receipt = await readyReceipt(user);
    const bad = coopConfirm('00000000-0000-7000-8000-000000000000');
    const response = await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body: bad,
    });
    expect(response.statusCode).toBe(400);
    expect(await db.purchase.count({ where: { householdId: user.user.householdId } })).toBe(0);
    expect(await db.receiptImage.count({ where: { receiptId: receipt.id } })).toBe(1);
  });
});

describe('FR-RCPT-008 deleting', () => {
  it('discard deletes the receipt with image and extraction; a confirmed receipt cannot be discarded', async () => {
    user = await registerUser(app);
    const receipt = await readyReceipt(user);
    const response = await call(app, 'DELETE', receiptsPath(user, `/${receipt.id}`), {
      client: user,
    });
    expect(response.statusCode).toBe(204);
    expect(await db.receipt.count({ where: { id: receipt.id } })).toBe(0);
    expect(await db.receiptImage.count({ where: { receiptId: receipt.id } })).toBe(0);
    expect(await db.receiptExtraction.count({ where: { receiptId: receipt.id } })).toBe(0);

    const done = await readyReceipt(user);
    await call(app, 'POST', receiptsPath(user, `/${done.id}/confirm`), {
      client: user,
      body: { purchasedOn: '2026-02-03', totalOre: 13232 },
    });
    const refused = await call(app, 'DELETE', receiptsPath(user, `/${done.id}`), { client: user });
    expect(refused.json().error.code).toBe(API_ERRORS.receiptAlreadyConfirmed);
  });

  it('after 7 days an unconfirmed receipt is gone at once, and the cleanup deletes the rows; confirmed ones stay', async () => {
    const local = createFakeClock(new Date('2026-10-24T10:00:00Z'));
    const timed = await createTestApp(db, { now: local.now, receiptQueue: queue });
    try {
      const client = await registerUser(timed);
      const open = await upload(timed, client);
      await runWorker(db, open.id);
      const done = await upload(timed, client);
      await runWorker(db, done.id);
      await call(timed, 'POST', receiptsPath(client, `/${done.id}/confirm`), {
        client,
        body: { purchasedOn: '2026-02-03', totalOre: 13232 },
      });

      local.advance(7 * DAY - 60_000);
      expect((await getReceipt(timed, client, open.id)).statusCode).toBe(200);
      local.advance(2 * 60_000);
      expect((await getReceipt(timed, client, open.id)).statusCode).toBe(404);
      expect(
        (await call(timed, 'GET', receiptsPath(client, `/${open.id}/image`), { client }))
          .statusCode,
      ).toBe(404);
      expect(
        (await call(timed, 'GET', receiptsPath(client), { client })).json<ReceiptListResponse>()
          .receipts,
      ).toEqual([]);
      expect((await getReceipt(timed, client, done.id)).statusCode).toBe(200);

      const { createReceiptRepo } = await import('../src/modules/receipts/repo');
      expect(await createReceiptRepo(db).deleteExpired(local.now())).toBeGreaterThanOrEqual(1);
      expect(await db.receipt.count({ where: { id: open.id } })).toBe(0);
      expect(await db.receiptImage.count({ where: { receiptId: open.id } })).toBe(0);
      expect(await db.receipt.count({ where: { id: done.id } })).toBe(1);
    } finally {
      await timed.close();
    }
  });

  it('deleting the purchase deletes the receipt row, so the receipt can be imported again', async () => {
    user = await registerUser(app);
    const receipt = await readyReceipt(user);
    const purchase = (
      await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
        client: user,
        body: { purchasedOn: '2026-02-03', totalOre: 13232 },
      })
    ).json<PurchaseResponse>();
    expect(
      (await call(app, 'DELETE', purchasesPath(user, `/${purchase.id}`), { client: user }))
        .statusCode,
    ).toBe(200);
    expect(await db.receipt.count({ where: { id: receipt.id } })).toBe(0);
    const again = await readyReceipt(user);
    const response = await call(app, 'POST', receiptsPath(user, `/${again.id}/confirm`), {
      client: user,
      body: { purchasedOn: '2026-02-03', totalOre: 13232 },
    });
    expect(response.statusCode).toBe(201);
  });

  it('a worker that died mid-job leaves no receipt "processing" forever', async () => {
    user = await registerUser(app);
    const receipt = await upload(app, user);
    await db.receipt.update({ where: { id: receipt.id }, data: { status: 'processing' } });
    const { createReceiptRepo } = await import('../src/modules/receipts/repo');
    expect(
      await createReceiptRepo(db).failStuck(new Date(Date.now() + 60_000)),
    ).toBeGreaterThanOrEqual(1);
    expect((await reviewed(app, user, receipt.id)).failureCode).toBe('timeout');
  });
});

describe('limits and availability', () => {
  it('without OCR set up (no queue), uploads are refused and the list says so', async () => {
    const off = await createTestApp(db, { now: clock.now });
    try {
      const client = await registerUser(off);
      const response = await uploadRaw(off, client, await phonePhoto(900));
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe(API_ERRORS.receiptOcrUnavailable);
      expect(
        (await call(off, 'GET', receiptsPath(client), { client })).json<ReceiptListResponse>()
          .ocrAvailable,
      ).toBe(false);
      expect(await db.receipt.count()).toBe(0);
    } finally {
      await off.close();
    }
  });

  it('per user: at most N uploads an hour (429)', async () => {
    const limited = await createTestApp(db, {
      now: clock.now,
      receiptQueue: queue,
      config: {
        receipts: {
          ocrProvider: 'tesseract',
          tesseractCommand: ['x'],
          ocrTimeoutMs: 1000,
          lineSuggestions: false,
          uploadsPerUserPerHour: 2,
          maxQueued: 100,
        },
      },
    });
    try {
      const client = await registerUser(limited);
      await upload(limited, client);
      await upload(limited, client);
      const third = await uploadRaw(limited, client, await phonePhoto(901));
      expect(third.statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('a full queue on the server gives 503 busy', async () => {
    const small = await createTestApp(db, {
      now: clock.now,
      receiptQueue: queue,
      config: {
        receipts: {
          ocrProvider: 'tesseract',
          tesseractCommand: ['x'],
          ocrTimeoutMs: 1000,
          lineSuggestions: false,
          uploadsPerUserPerHour: 100,
          maxQueued: 1,
        },
      },
    });
    try {
      const client = await registerUser(small);
      await upload(small, client);
      const second = await uploadRaw(small, client, await phonePhoto(902));
      expect(second.statusCode).toBe(503);
      expect(second.json().error.code).toBe(API_ERRORS.receiptBusy);
    } finally {
      await small.close();
    }
  });
});

describe('NFR-SEC-004 no receipt content in logs', () => {
  it('neither the API nor the worker logs text, amounts or store from a receipt', async () => {
    user = await registerUser(app);
    const { fridge } = await locationsOf(app, user);
    const receipt = await upload(app, user);
    const workerLog = await runWorker(db, receipt.id);
    await reviewed(app, user, receipt.id);
    await call(app, 'POST', receiptsPath(user, `/${receipt.id}/confirm`), {
      client: user,
      body: coopConfirm(fridge),
    });
    const all = log.text() + workerLog;
    expect(all).toContain(receipt.id);
    for (const secret of ['GULROT', 'BANAN', 'Extra', '132.32', 'Fiktiv', 'kvittering.jpg']) {
      expect(all, secret).not.toContain(secret);
    }
    // Numbers only count when they are not part of an id: the log is full of UUIDs, and a run of hex digits can
    // contain "13232" by chance (that made this test fail once in five runs before).
    for (const number of ['13232', '424242']) {
      expect(all, number).not.toMatch(new RegExp(`(?<![0-9a-f-])${number}(?![0-9a-f-])`));
    }
    expect(COOP_RECEIPT.length).toBeGreaterThan(0);
  });
});
