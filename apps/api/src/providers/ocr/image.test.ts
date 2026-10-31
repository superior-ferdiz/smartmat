import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  histogram,
  paperIsLandscape,
  skewAngle,
  normalizeReceiptImage,
  otsuThreshold,
  paperBox,
  prepareForOcr,
  RECEIPT_IMAGE_MAX_BYTES,
  sniffImageType,
} from './image';

const blank = (width: number, height: number, background = '#ffffff') =>
  sharp({ create: { width, height, channels: 3, background } });

/** A JPEG with GPS coordinates, a camera model and "turn 90°" in its EXIF – made up, like a phone photo. */
async function phonePhoto() {
  return blank(300, 200)
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

describe('receipt image upload (spec 08 FR-RCPT-001/002)', () => {
  it('knows the type from the first bytes only', async () => {
    expect(sniffImageType(await blank(4, 4).jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImageType(await blank(4, 4).png().toBuffer())).toBe('png');
    expect(sniffImageType(await blank(4, 4).webp().toBuffer())).toBe('webp');
    expect(sniffImageType(await blank(4, 4).gif().toBuffer())).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7'))).toBeNull();
  });

  it('removes all metadata (GPS, camera) and turns the image upright', async () => {
    const input = await phonePhoto();
    const before = await sharp(input).metadata();
    expect(before.exif?.includes(Buffer.from('TestPhone'))).toBe(true);
    // The GPS IFD pointer (tag 0x8825), in either byte order.
    const gps =
      before.exif!.includes(Buffer.from([0x88, 0x25])) ||
      before.exif!.includes(Buffer.from([0x25, 0x88]));
    expect(gps).toBe(true);
    expect(before.orientation).toBe(6);

    const result = await normalizeReceiptImage(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = await sharp(result.jpeg).metadata();
    expect(after.format).toBe('jpeg');
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // Orientation 6 = turn 90° clockwise: 300×200 becomes 200×300.
    expect([result.width, result.height]).toEqual([200, 300]);
    expect(result.jpeg.includes(Buffer.from('TestPhone'))).toBe(false);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('limits the longest side and never enlarges', async () => {
    const big = await normalizeReceiptImage(await blank(4000, 1000).png().toBuffer(), 3000);
    expect(big.ok && [big.width, big.height]).toEqual([3000, 750]);
    const small = await normalizeReceiptImage(await blank(100, 50).png().toBuffer(), 3000);
    expect(small.ok && [small.width, small.height]).toEqual([100, 50]);
  });

  it('refuses other types, a body that does not match its header, broken files and too many pixels', async () => {
    expect(await normalizeReceiptImage(await blank(4, 4).gif().toBuffer())).toEqual({
      ok: false,
      reason: 'unsupportedType',
    });
    const gif = await blank(4, 4).gif().toBuffer();
    const pngHeaderOnGif = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      gif,
    ]);
    expect((await normalizeReceiptImage(pngHeaderOnGif)).ok).toBe(false);
    const jpeg = await blank(50, 50).jpeg().toBuffer();
    expect(await normalizeReceiptImage(jpeg.subarray(0, 40))).toEqual({
      ok: false,
      reason: 'unreadable',
    });
    // 8000×6000 = 48 MP, over the 40 MP limit, but a tiny file (one colour compresses well).
    const bomb = await blank(8000, 6000).png({ compressionLevel: 9 }).toBuffer();
    expect(bomb.length).toBeLessThan(RECEIPT_IMAGE_MAX_BYTES);
    expect(await normalizeReceiptImage(bomb)).toEqual({ ok: false, reason: 'tooLarge' });
    expect(await normalizeReceiptImage(Buffer.alloc(RECEIPT_IMAGE_MAX_BYTES + 1, 0xff))).toEqual({
      ok: false,
      reason: 'tooLarge',
    });
  });
});

describe('preparing for OCR', () => {
  it("Otsu's threshold splits a two-level image between the levels", () => {
    const counts = histogram(
      Uint8Array.from([...new Array(100).fill(40), ...new Array(100).fill(220)]),
    );
    const t = otsuThreshold(counts);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(220);
  });

  it('finds the paper on a dark table, ignoring bright specks', async () => {
    // 1000×800 dark table, a white "receipt" at x 300–599, y 100–699, and bright specks around it.
    const specks = Array.from({ length: 40 }, (_, i) => ({
      input: { create: { width: 6, height: 6, channels: 3 as const, background: '#f0e0c0' } },
      left: (i * 97) % 990,
      top: (i * 53) % 790,
    })).filter((s) => s.left < 290 || s.left > 610);
    const photo = await blank(1000, 800, '#202020')
      .composite([
        {
          input: { create: { width: 300, height: 600, channels: 3, background: '#f4f4f4' } },
          left: 300,
          top: 100,
        },
        ...specks,
      ])
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const box = await paperBox(photo.data, photo.info.width, photo.info.height);
    expect(box.left).toBeGreaterThanOrEqual(270);
    expect(box.left).toBeLessThanOrEqual(305);
    expect(box.left + box.width).toBeGreaterThanOrEqual(595);
    expect(box.left + box.width).toBeLessThanOrEqual(630);
    expect(box.top).toBeLessThanOrEqual(105);
    expect(box.top + box.height).toBeGreaterThanOrEqual(695);
  });

  it('raw keeps the image; clean and threshold give a turned, greyscale PNG with the paper at least PAPER_WIDTH wide', async () => {
    const jpeg = await blank(300, 200).jpeg().toBuffer();
    expect(await prepareForOcr(jpeg, 'raw')).toBe(jpeg);
    for (const variant of ['clean', 'threshold'] as const) {
      const out = await sharp(await prepareForOcr(jpeg, variant, 90)).metadata();
      expect(out.format).toBe('png');
      expect(out.channels).toBe(1);
      expect(out.width).toBe(1600);
      expect(out.height).toBeGreaterThan(out.width);
    }
  });
});

describe('straightening a tilted receipt (deskew)', () => {
  /** Dark text-like stripes on white, turned `degrees` clockwise. */
  async function stripes(degrees: number) {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      input: { create: { width: 500, height: 8, channels: 3 as const, background: '#000000' } },
      left: 50,
      top: 40 + i * 30,
    }));
    const img = await blank(600, 440).composite(rows).png().toBuffer();
    return sharp(img)
      .rotate(degrees, { background: '#ffffff' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
  }

  it.each([0, 2, -1.5, 3.5])(
    'finds a %s° tilt (rows falling to the right are positive)',
    async (degrees) => {
      const { data, info } = await stripes(degrees);
      expect(skewAngle(data, info.width, info.height)).toBeCloseTo(degrees, 0);
    },
  );

  it('leaves a blank page alone', () => {
    expect(skewAngle(new Uint8Array(100 * 100).fill(255), 100, 100)).toBe(0);
  });

  it('knows a receipt lying on its side', async () => {
    const onTable = (w: number, h: number) =>
      blank(800, 800, '#202020')
        .composite([
          {
            input: { create: { width: w, height: h, channels: 3, background: '#f4f4f4' } },
            left: 100,
            top: 100,
          },
        ])
        .jpeg()
        .toBuffer();
    expect(await paperIsLandscape(await onTable(600, 250))).toBe(true);
    expect(await paperIsLandscape(await onTable(250, 600))).toBe(false);
  });
});
