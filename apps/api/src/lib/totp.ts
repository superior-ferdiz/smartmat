import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TOTP_DIGITS } from '@smartmat/shared';

/*
 * Spec 13 (FR-AUTH-010): time-based one-time codes, RFC 6238 (HMAC-SHA1, 30-second steps, 6 digits) – the
 * settings every authenticator app supports. Written here with node:crypto instead of adding a dependency; checked
 * against the RFC's own test vectors (totp.test.ts).
 */

export const TOTP_STEP_SECONDS = 30;
/** One step before and after: the phone's clock may be a little off, and typing takes time. */
const WINDOW = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/=+$/, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size RFC 4226 recommends for HMAC-SHA1. */
export function newTotpSecret(): Buffer {
  return randomBytes(20);
}

export function stepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/** The code for one time step (RFC 4226 dynamic truncation). */
export function totpCode(secret: Buffer, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * The step the code belongs to, if it is valid now (± one step) and newer than `lastUsedStep` – a code that was
 * used once (or an older one) is refused, so a code seen over someone's shoulder cannot be used again.
 */
export function matchTotp(
  secret: Buffer,
  code: string,
  now: Date,
  lastUsedStep: number | null,
): number | null {
  const current = stepAt(now);
  const given = Buffer.from(code);
  let found: number | null = null;
  // Every candidate is compared (no early exit), in constant time.
  for (let step = current - WINDOW; step <= current + WINDOW; step++) {
    const expected = Buffer.from(totpCode(secret, step));
    if (expected.length === given.length && timingSafeEqual(expected, given)) found = step;
  }
  if (found === null || (lastUsedStep !== null && found <= lastUsedStep)) return null;
  return found;
}

/** For the authenticator app: otpauth://totp/SmartMat:<label>?secret=…&issuer=SmartMat. */
export function otpauthUri(secret: Buffer, label: string): string {
  const name = encodeURIComponent(`SmartMat:${label}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer: 'SmartMat',
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${name}?${params.toString()}`;
}
