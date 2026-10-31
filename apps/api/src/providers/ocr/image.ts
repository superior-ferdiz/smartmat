import { createHash } from 'node:crypto';
import sharp from 'sharp';

/*
 * Receipt images (spec 08). An upload is decoded and written again as a plain JPEG: turned upright from its EXIF
 * orientation, no metadata at all (EXIF, GPS, ICC, XMP – sharp drops it unless asked to keep it), and at most
 * STORED_MAX_SIDE pixels on the longest side. The original bytes are never stored.
 */

export const RECEIPT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Decompression bombs: a small file can claim a huge image. sharp refuses to decode past this. */
export const RECEIPT_IMAGE_MAX_PIXELS = 40_000_000;
export const STORED_MAX_SIDE = 3000;

export const RECEIPT_IMAGE_TYPES = ['jpeg', 'png', 'webp'] as const;
export type ReceiptImageType = (typeof RECEIPT_IMAGE_TYPES)[number];

/** The type from the first bytes of the file, never from its name or Content-Type. */
export function sniffImageType(bytes: Buffer): ReceiptImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export type NormalizeResult =
  | { ok: true; jpeg: Buffer; width: number; height: number; sha256: string }
  | { ok: false; reason: 'unsupportedType' | 'tooLarge' | 'unreadable' };

export async function normalizeReceiptImage(
  input: Buffer,
  maxSide = STORED_MAX_SIDE,
): Promise<NormalizeResult> {
  if (input.length > RECEIPT_IMAGE_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  const type = sniffImageType(input);
  if (!type) return { ok: false, reason: 'unsupportedType' };

  const options = { limitInputPixels: RECEIPT_IMAGE_MAX_PIXELS, failOn: 'error' } as const;
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, options).metadata());
  } catch (error) {
    return { ok: false, reason: isPixelLimit(error) ? 'tooLarge' : 'unreadable' };
  }
  // The decoder must agree with the first bytes (a PNG header on a GIF body is not a PNG).
  if (format !== type) return { ok: false, reason: 'unsupportedType' };

  try {
    const { data, info } = await sharp(input, options)
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      jpeg: data,
      width: info.width,
      height: info.height,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  } catch (error) {
    return { ok: false, reason: isPixelLimit(error) ? 'tooLarge' : 'unreadable' };
  }
}

function isPixelLimit(error: unknown) {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

/*
 * Preparing the stored image for Tesseract. The pilot measures the variants (spec 08, "Pilotmåling"):
 * - raw:       the stored image as it is
 * - clean:     turned (the caller tries the rotations), greyscale, cropped to the paper, paper scaled to
 *              PAPER_WIDTH, contrast stretched
 * - threshold: clean, then black and white at Otsu's threshold
 * - deskew:    clean, then straightened by the small angle that makes the text rows sharpest (added after the
 *              first pilot run: on a tilted photo the amount column drifted onto the neighbouring line)
 */
export const OCR_VARIANTS = ['raw', 'clean', 'threshold', 'deskew'] as const;
export type OcrVariant = (typeof OCR_VARIANTS)[number];

export const PAPER_WIDTH = 1600;

export async function prepareForOcr(
  jpeg: Buffer,
  variant: OcrVariant,
  rotation: 0 | 90 | 180 | 270 = 0,
): Promise<Buffer> {
  if (variant === 'raw') return jpeg;

  const upright = await sharp(jpeg)
    .rotate(rotation)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = upright.info;
  const box = await paperBox(upright.data, width, height);
  let image = sharp(upright.data, { raw: { width, height, channels: 1 } }).extract(box);
  if (box.width < PAPER_WIDTH) image = image.resize({ width: PAPER_WIDTH, kernel: 'lanczos3' });
  image = image.normalise();
  if (variant === 'deskew') {
    const grey = await image.toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
    const angle = skewAngle(grey.data, grey.info.width, grey.info.height);
    image = sharp(grey.data, {
      raw: { width: grey.info.width, height: grey.info.height, channels: 1 },
    }).rotate(-angle, { background: '#ffffff' });
  }
  if (variant === 'threshold') {
    const grey = await image.toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
    image = sharp(grey.data, {
      raw: { width: grey.info.width, height: grey.info.height, channels: 1 },
    }).threshold(otsuThreshold(histogram(grey.data)));
  }
  return image.toColourspace('b-w').png().toBuffer();
}

/** True when the paper is wider than it is tall: the receipt lies on its side and needs 90° or 270°. */
export async function paperIsLandscape(jpeg: Buffer) {
  const grey = await sharp(jpeg).greyscale().raw().toBuffer({ resolveWithObject: true });
  const box = await paperBox(grey.data, grey.info.width, grey.info.height);
  return box.width > box.height;
}

export const MAX_SKEW_DEGREES = 4;
const SKEW_STEP = 0.25;

/**
 * How many degrees the text rows lean clockwise (rows falling to the right are positive), between
 * −MAX_SKEW_DEGREES and MAX_SKEW_DEGREES. The dark pixels are counted per row along each candidate slope; the
 * slope that gives the most uneven row counts (sum of squares) follows the text lines. Turn by −angle to fix it.
 */
export function skewAngle(grey: Uint8Array, width: number, height: number) {
  const threshold = otsuThreshold(histogram(grey));
  // Every second pixel is enough, and keeps this fast on a full receipt.
  const dark: [number, number][] = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2)
      if ((grey[y * width + x] ?? 255) < threshold) dark.push([x, y]);
  }
  let best = { angle: 0, score: -1 };
  for (let angle = -MAX_SKEW_DEGREES; angle <= MAX_SKEW_DEGREES + 1e-9; angle += SKEW_STEP) {
    const slope = Math.tan((angle * Math.PI) / 180);
    const counts = new Map<number, number>();
    for (const [x, y] of dark) {
      const row = Math.round((y - x * slope) / 2);
      counts.set(row, (counts.get(row) ?? 0) + 1);
    }
    let score = 0;
    for (const n of counts.values()) score += n * n;
    // Ties go to the smaller angle, so a page with no clear lines is left alone.
    if (score > best.score || (score === best.score && Math.abs(angle) < Math.abs(best.angle))) {
      best = { angle, score };
    }
  }
  return Math.round(best.angle * 100) / 100;
}

/**
 * The receipt is the large bright area. On a small copy, a column (or row) is paper when at least PAPER_SHARE of
 * its pixels (inside the paper's rough rows or columns) are brighter than Otsu's threshold; the longest run of
 * paper columns and rows is the box. Bright
 * specks on a dark table are too few per column to count. A photo with no clear paper gives the whole image.
 */
const PAPER_SHARE = 0.4;
const ROUGH_SHARE = 0.15;
const SMALL_WIDTH = 400;
const MARGIN = 0.02;

export async function paperBox(grey: Buffer, width: number, height: number) {
  const scale = Math.min(1, SMALL_WIDTH / width);
  const small = await sharp(grey, { raw: { width, height, channels: 1 } })
    .resize({ width: Math.max(1, Math.round(width * scale)) })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = small.info.width;
  const h = small.info.height;
  const threshold = otsuThreshold(histogram(small.data));

  const bright = (x: number, y: number) => (small.data[y * w + x] ?? 0) > threshold;
  /** Bright pixels per column (or row), counted only inside the other direction's range. */
  const share = (axis: 'x' | 'y', across: { start: number; end: number }) => {
    const length = axis === 'x' ? w : h;
    const counts = new Array<number>(length).fill(0);
    for (let i = 0; i < length; i++) {
      for (let j = across.start; j <= across.end; j++) {
        if (axis === 'x' ? bright(i, j) : bright(j, i)) counts[i]! += 1;
      }
    }
    return counts.map((count) => count / (across.end - across.start + 1));
  };
  // First a rough box with a low share (bright specks on a table stay far below it), then each direction is
  // counted only inside the other's rough range: a receipt lying on its side covers little of the full height,
  // a standing one little of the full width.
  const roughX = longestRun(share('x', { start: 0, end: h - 1 }).map((s) => s >= ROUGH_SHARE));
  const roughY = longestRun(share('y', { start: 0, end: w - 1 }).map((s) => s >= ROUGH_SHARE));
  if (!roughX || !roughY) return { left: 0, top: 0, width, height };
  const xs = longestRun(share('x', roughY).map((s) => s >= PAPER_SHARE));
  const ys = longestRun(share('y', roughX).map((s) => s >= PAPER_SHARE));
  if (!xs || !ys) return { left: 0, top: 0, width, height };

  const toFull = (value: number, size: number, max: number) =>
    Math.min(max, Math.max(0, Math.round(value / scale + size)));
  const left = toFull(xs.start, -MARGIN * width, width);
  const top = toFull(ys.start, -MARGIN * height, height);
  const right = toFull(xs.end + 1, MARGIN * width, width);
  const bottom = toFull(ys.end + 1, MARGIN * height, height);
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function longestRun(flags: readonly boolean[]) {
  let best: { start: number; end: number } | null = null;
  let start = -1;
  flags.forEach((flag, i) => {
    if (flag && start < 0) start = i;
    if ((!flag || i === flags.length - 1) && start >= 0) {
      const end = flag ? i : i - 1;
      if (!best || end - start > best.end - best.start) best = { start, end };
      start = -1;
    }
  });
  return best as { start: number; end: number } | null;
}

export function histogram(grey: Uint8Array) {
  const counts = new Array<number>(256).fill(0);
  for (const value of grey) counts[value]! += 1;
  return counts;
}

/** Otsu's method: the grey level that best splits the histogram into two classes. */
export function otsuThreshold(counts: readonly number[]) {
  const total = counts.reduce((sum, n) => sum + n, 0);
  const weightedTotal = counts.reduce((sum, n, level) => sum + n * level, 0);
  let below = 0;
  let weightedBelow = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level++) {
    below += counts[level] ?? 0;
    if (below === 0) continue;
    const above = total - below;
    if (above === 0) break;
    weightedBelow += level * (counts[level] ?? 0);
    const meanBelow = weightedBelow / below;
    const meanAbove = (weightedTotal - weightedBelow) / above;
    const variance = below * above * (meanBelow - meanAbove) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}
