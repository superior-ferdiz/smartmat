import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSecretBox } from './secretBox';
import { base32Decode, base32Encode, matchTotp, otpauthUri, stepAt, totpCode } from './totp';

/* Spec 13 (FR-AUTH-010). */

// RFC 6238, appendix B: the SHA-1 secret is the ASCII text "12345678901234567890"; 8-digit codes.
const RFC_SECRET = Buffer.from('12345678901234567890');

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('the RFC test vector at %i s gives %s', (seconds, expected) => {
    expect(totpCode(RFC_SECRET, stepAt(new Date(seconds * 1000)), 8)).toBe(expected);
  });

  it('6 digits: the last 6 of the same truncation', () => {
    expect(totpCode(RFC_SECRET, stepAt(new Date(59_000)))).toBe('287082');
  });

  it('accepts the current step and one either side, nothing further', () => {
    const now = new Date(1_800_000_000_000);
    const step = stepAt(now);
    for (const offset of [-1, 0, 1]) {
      expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + offset), now, null)).toBe(
        step + offset,
      );
    }
    for (const offset of [-2, 2, 100]) {
      expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + offset), now, null)).toBeNull();
    }
    expect(matchTotp(RFC_SECRET, '000000x', now, null)).toBeNull();
  });

  it('a code that was used (or an older one) is refused: no replay', () => {
    const now = new Date(1_800_000_000_000);
    const step = stepAt(now);
    const code = totpCode(RFC_SECRET, step);
    expect(matchTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, step - 1)).toBeNull();
    expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, step)).toBe(step + 1);
  });

  it('base32 both ways (RFC 4648 example "foobar" → MZXW6YTBOI)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('MZXW6YTBOI').toString()).toBe('foobar');
    const random = randomBytes(20);
    expect(base32Decode(base32Encode(random))).toEqual(random);
  });

  it('otpauth URI for the app, with issuer and the standard settings', () => {
    const uri = new URL(otpauthUri(Buffer.from('foobar'), 'kari@example.test'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.searchParams.get('secret')).toBe('MZXW6YTBOI');
    expect(uri.searchParams.get('issuer')).toBe('SmartMat');
    expect(uri.searchParams.get('digits')).toBe('6');
    expect(uri.searchParams.get('period')).toBe('30');
  });
});

describe('secretBox (AES-256-GCM)', () => {
  const box = createSecretBox(randomBytes(32));

  it('round trip, and a new IV every time', () => {
    const secret = randomBytes(20);
    const a = box.seal(secret);
    expect(box.open(a)).toEqual(secret);
    expect(box.seal(secret)).not.toBe(a);
    expect(a).not.toContain(secret.toString('base64'));
  });

  it('a changed byte or another key is refused', () => {
    const sealed = box.seal(randomBytes(20));
    const raw = Buffer.from(sealed.slice(3), 'base64');
    raw[raw.length - 1]! ^= 1;
    expect(() => box.open(`v1:${raw.toString('base64')}`)).toThrow();
    expect(() => createSecretBox(randomBytes(32)).open(sealed)).toThrow();
    expect(() => createSecretBox(randomBytes(16))).toThrow(/32 bytes/);
  });
});
