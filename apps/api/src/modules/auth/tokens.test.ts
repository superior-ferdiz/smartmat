import { describe, expect, it } from 'vitest';
import { hashSessionToken, newCsrfToken, newSessionToken, safeEqual } from './tokens';

describe('ADR-0005 session tokens', () => {
  it('are 256-bit random values in URL-safe base64, never repeated', () => {
    const tokens = new Set(Array.from({ length: 1000 }, newSessionToken));
    expect(tokens.size).toBe(1000);
    for (const token of [...tokens].slice(0, 10)) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newCsrfToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('are stored as a SHA-256 hash: 64 hex characters, same input gives the same hash', () => {
    const token = newSessionToken();
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(hashSessionToken(newSessionToken()));
  });

  it('safeEqual compares exactly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});
