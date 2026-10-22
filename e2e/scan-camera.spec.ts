import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BASE_URL, expect, test } from './fixtures';
import { ean13Modules, writeBarcodeVideo } from './fakeCamera';

/*
 * FR-SCAN-001 with a camera in a real browser: Chromium's fake camera plays a video of a barcode (fakeCamera.ts).
 * Chromium on Linux has no built-in BarcodeDetector, so this runs the fallback reader (barcode-detector +
 * zxing-wasm) – the same path an iPhone takes. A phone is still the real test (chapter 11).
 */

const CODE = '7038010000737';
const video = join(tmpdir(), `smartmat-fake-camera-${process.pid}.y4m`);
writeBarcodeVideo(video, CODE);
test.afterAll(() => rmSync(video, { force: true }));

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${video}`,
    ],
  },
});

test('the EAN-13 drawing is right: the same 95 modules as the zxing-wasm writer draws', () => {
  // From zxing-wasm's writeBarcode('7038010000737', { format: 'EAN13' }), 2026-10-22 (1 = black).
  // The first version of the parity table had the rows for 6 and 7 swapped; this caught it.
  expect(ean13Modules(CODE)).toBe(
    '10100011010100001011011101001110011001010011101010111001011100101110010100010010000101000100101',
  );
});

test('FR-SCAN-001: the camera reads the code; the reader and its .wasm come from our own server', async ({
  page,
}) => {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto('/skann');
  await page.getByRole('button', { name: 'Start kamera' }).click();

  await expect(page).toHaveURL(new RegExp(`\\?kode=${CODE}$`), { timeout: 20_000 });
  await expect(page.getByLabel(/Navn på varen/)).toHaveValue('Testmeieriet Lettmelk 1 %');
  // The camera is stopped once the code is read.
  await expect(page.locator('video')).toHaveCount(0);

  const wasm = urls.filter((u) => u.endsWith('.wasm'));
  expect(wasm.length).toBeGreaterThan(0);
  expect(new Set(urls.map((u) => new URL(u).origin))).toEqual(new Set([BASE_URL]));
});
