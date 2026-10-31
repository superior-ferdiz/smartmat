import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { expect } from 'vitest';
import {
  CSRF_HEADER,
  RECEIPT_IMAGE_FIELD,
  type ReceiptResponse,
  type ReceiptSummary,
} from '@smartmat/shared';
import { COOP_RECEIPT } from '@smartmat/shared/test-fixtures/receipts';
import { API_PREFIX } from '../src/app';
import type { Db } from '../src/db';
import { SESSION_COOKIE } from '../src/plugins/auth';
import { ReceiptProcessor } from '../src/modules/receipts/processor';
import { createReceiptRepo } from '../src/modules/receipts/repo';
import type { ReceiptQueue } from '../src/modules/receipts/service';
import type { OcrLine, OcrProvider, OcrResult } from '../src/providers/ocr/types';
import { ORIGIN, type Client } from './helpers';

/*
 * Spec 08 test helpers. Tests never call a real OCR engine and never use real receipts: the fake OCR answers
 * with the made-up texts in packages/shared/src/receipts/fixtures.ts, whatever the image shows.
 */

export function receiptsPath(client: Client, path = '') {
  return `/households/${client.user.householdId}/receipts${path}`;
}

/** Records the ids the API queued, instead of pg-boss. */
export function fakeQueue() {
  const ids: string[] = [];
  const queue: ReceiptQueue = {
    async enqueue(id) {
      ids.push(id);
    },
  };
  return { queue, ids };
}

export function fakeOcr(answer: OcrResult | (() => Promise<OcrResult>)): OcrProvider {
  return { recognize: () => (typeof answer === 'function' ? answer() : Promise.resolve(answer)) };
}

export const ocrText = (lines: readonly OcrLine[] = COOP_RECEIPT): OcrResult => ({
  ok: true,
  text: { lines: [...lines], meanConfidence: 91, engine: 'fake', rotation: 0 },
});

/** The worker's job, run in the test with a fake OCR provider. */
export async function runWorker(
  db: Db,
  receiptId: string,
  ocr: OcrProvider = fakeOcr(ocrText()),
  chainOcr?: OcrProvider,
) {
  const messages: string[] = [];
  const log = {
    info: (o: object, m: string) => void messages.push(JSON.stringify(o) + m),
    warn: (o: object, m: string) => void messages.push(JSON.stringify(o) + m),
  };
  await new ReceiptProcessor({
    repo: createReceiptRepo(db),
    ocr,
    chainOcr,
    log: log as never,
  }).process(receiptId);
  return messages.join('\n');
}

/** A made-up "phone photo": a light page with a camera name, GPS position and a turn in its EXIF. */
export async function phonePhoto(seed = 0, width = 600, height = 900) {
  // A small dark mark at a place given by the seed, so every photo is a different file.
  const mark = { create: { width: 8, height: 8, channels: 3 as const, background: '#202020' } };
  return sharp({ create: { width, height, channels: 3, background: '#f0eee6' } })
    .composite([
      { input: mark, left: seed % (width - 8), top: Math.floor(seed / (width - 8)) % (height - 8) },
    ])
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'Fiktiv 1' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '59/1 25/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '9/1 4/1 0/1',
      },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

/** A multipart/form-data body with one file, as a browser sends it. */
export function multipart(
  bytes: Buffer,
  options: { field?: string; filename?: string; type?: string } = {},
) {
  const boundary = `----smartmat${Math.random().toString(16).slice(2)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${options.field ?? RECEIPT_IMAGE_FIELD}"; ` +
      `filename="${options.filename ?? 'kvittering.jpg'}"\r\nContent-Type: ${options.type ?? 'image/jpeg'}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export function uploadRaw(
  app: FastifyInstance,
  client: Client,
  bytes: Buffer,
  options: { field?: string; type?: string; householdPath?: string } = {},
) {
  const body = multipart(bytes, options);
  return app.inject({
    method: 'POST',
    url: `${API_PREFIX}${options.householdPath ?? receiptsPath(client)}`,
    headers: {
      origin: ORIGIN,
      cookie: `${SESSION_COOKIE}=${client.cookie}`,
      [CSRF_HEADER]: client.csrfToken,
      'content-type': body.contentType,
    },
    payload: body.payload,
  });
}

let photoCount = 0;

export async function upload(
  app: FastifyInstance,
  client: Client,
  bytes?: Buffer,
): Promise<ReceiptSummary> {
  photoCount += 1;
  const response = await uploadRaw(app, client, bytes ?? (await phonePhoto(photoCount)));
  expect(response.statusCode, response.body).toBe(202);
  return response.json<ReceiptSummary>();
}

export async function getReceipt(app: FastifyInstance, client: Client, id: string) {
  const response = await app.inject({
    method: 'GET',
    url: `${API_PREFIX}${receiptsPath(client, `/${id}`)}`,
    headers: { origin: ORIGIN, cookie: `${SESSION_COOKIE}=${client.cookie}` },
  });
  return response;
}

export async function reviewed(app: FastifyInstance, client: Client, id: string) {
  const response = await getReceipt(app, client, id);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ReceiptResponse>();
}
