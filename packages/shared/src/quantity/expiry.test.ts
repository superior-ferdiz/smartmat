import { describe, expect, it } from 'vitest';
import { daysBetween, monthRange, osloDate } from '../dates/dates';
import { expiryStatus, mostSevere, needsAttention } from './expiry';

describe('FR-INV-005 expiryStatus (today = 2026-10-21)', () => {
  const today = '2026-10-21';
  it.each([
    [null, 'none', undefined],
    ['2026-10-20', 'passed', -1],
    ['2026-01-01', 'passed', -293],
    ['2026-10-21', 'today', 0],
    ['2026-10-22', 'soon', 1],
    ['2026-10-24', 'soon', 3],
    ['2026-10-25', 'ok', 4],
  ] as const)('%s → %s (%s days)', (date, status, daysLeft) => {
    expect(expiryStatus(date, today)).toEqual(
      daysLeft === undefined ? { status } : { status, daysLeft },
    );
  });

  it('the most severe status wins for an item; no dated batches → none', () => {
    expect(mostSevere(['ok', 'soon', 'none'])).toBe('soon');
    expect(mostSevere(['ok', 'passed', 'today'])).toBe('passed');
    expect(mostSevere(['none', 'none'])).toBe('none');
    expect(mostSevere([])).toBe('none');
  });

  it('needs attention: passed, today and soon', () => {
    expect(
      ['passed', 'today', 'soon', 'ok', 'none'].map((s) => needsAttention(s as never)),
    ).toEqual([true, true, true, false, false]);
  });
});

describe('dates in Norwegian time', () => {
  it('"today" is the date in Oslo, not in UTC', () => {
    // 23:30 UTC on 20 October is 01:30 on 21 October in Oslo (summer time, UTC+2).
    expect(osloDate(new Date('2026-10-20T23:30:00Z'))).toBe('2026-10-21');
    // 22:59 UTC on 31 December is 23:59 in Oslo (winter time, UTC+1): still the old year.
    expect(osloDate(new Date('2026-12-31T22:59:00Z'))).toBe('2026-12-31');
    expect(osloDate(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });

  it('counts calendar days across the summer/winter time change (25 Oct 2026)', () => {
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-21', '2026-10-20')).toBe(-1);
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // leap year
  });

  it('month ranges, also over new year', () => {
    expect(monthRange('2026-10-21')).toEqual({ start: '2026-10-01', next: '2026-11-01' });
    expect(monthRange('2026-12-05')).toEqual({ start: '2026-12-01', next: '2027-01-01' });
  });
});
