import { writeFileSync } from 'node:fs';

/*
 * A fake camera for Chromium (--use-file-for-fake-video-capture): a Y4M video that shows one EAN-13 barcode.
 * Written here without image libraries: EAN-13 is drawn from its encoding tables, and Y4M is a header plus raw
 * frames (grey picture: brightness only, colour planes neutral).
 */

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
];
const R = L.map((code) => [...code].map((bit) => (bit === '1' ? '0' : '1')).join(''));
const G = R.map((code) => [...code].reverse().join(''));
/** Which left-hand digits use the L or G table, decided by the first digit. */
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
];

/** The 95 modules of an EAN-13 code ("1" = black bar). */
export function ean13Modules(code: string): string {
  if (!/^\d{13}$/.test(code)) throw new Error('EAN-13 needs 13 digits');
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0]!]!;
  let modules = '101';
  for (let i = 1; i <= 6; i++) {
    const table = parity[i - 1] === 'L' ? L : G;
    modules += table[digits[i]!];
  }
  modules += '01010';
  for (let i = 7; i <= 12; i++) modules += R[digits[i]!];
  return `${modules}101`;
}

/** Writes a short Y4M video (Chromium loops it) with the barcode in the middle of a white picture. */
export function writeBarcodeVideo(path: string, code: string, width = 640, height = 480) {
  const modules = ean13Modules(code);
  const moduleWidth = 4;
  const barsWidth = modules.length * moduleWidth;
  const left = Math.floor((width - barsWidth) / 2);
  const top = Math.floor(height * 0.2);
  const bottom = Math.floor(height * 0.8);

  const luma = Buffer.alloc(width * height, 255);
  for (let y = top; y < bottom; y++) {
    for (let m = 0; m < modules.length; m++) {
      if (modules[m] !== '1') continue;
      luma.fill(0, y * width + left + m * moduleWidth, y * width + left + (m + 1) * moduleWidth);
    }
  }
  const chroma = Buffer.alloc((width / 2) * (height / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), luma, chroma]);
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F10:1 Ip A1:1 C420jpeg\n`);
  writeFileSync(path, Buffer.concat([header, ...Array.from({ length: 10 }, () => frame)]));
}
