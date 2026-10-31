import { describe, expect, it } from 'vitest';
import { WindowLimiter } from './windowLimiter';

describe('WindowLimiter', () => {
  it('allows max per window and key, then refuses until the window is over', () => {
    let time = 0;
    const limiter = new WindowLimiter(2, 60_000, () => new Date(time));
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(true);
    expect(limiter.take('a')).toBe(false);
    expect(limiter.take('b')).toBe(true);
    time = 59_999;
    expect(limiter.take('a')).toBe(false);
    time = 60_000;
    expect(limiter.take('a')).toBe(true);
  });

  it('forgets finished windows when it has many keys', () => {
    let time = 0;
    const limiter = new WindowLimiter(1, 1000, () => new Date(time));
    for (let i = 0; i < 1500; i++) limiter.take(`user-${i}`);
    time = 5000;
    limiter.take('new');
    // A forgotten key starts a fresh window.
    expect(limiter.take('user-1')).toBe(true);
    expect(limiter.take('user-1')).toBe(false);
  });
});
