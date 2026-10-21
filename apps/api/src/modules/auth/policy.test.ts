import { describe, expect, it } from 'vitest';
import { isLocked, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, sessionExpiry } from './policy';

describe('ADR-0005 session expiry', () => {
  const created = new Date('2026-10-01T00:00:00Z');

  it('is 14 days after last use while that is within 30 days of login', () => {
    const now = new Date(created.getTime() + 24 * 60 * 60 * 1000);
    expect(sessionExpiry(created, now).getTime()).toBe(now.getTime() + SESSION_IDLE_MS);
  });

  it('is capped at 30 days after login', () => {
    const now = new Date(created.getTime() + 25 * 24 * 60 * 60 * 1000);
    expect(sessionExpiry(created, now).getTime()).toBe(created.getTime() + SESSION_ABSOLUTE_MS);
  });
});

describe('FR-AUTH-003 isLocked', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  it('not locked without a date or after the date', () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isLocked(now, now)).toBe(false);
  });
  it('locked until the date', () => {
    expect(isLocked(new Date(now.getTime() + 1), now)).toBe(true);
  });
});
