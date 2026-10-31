import { describe, expect, it } from 'vitest';
import {
  addDays,
  addWeeks,
  isIsoWeek,
  isoWeekOf,
  needsRange,
  weekDates,
  weekStart,
  weeksInYear,
} from './week';

describe('spec 09 FR-PLAN-001 ISO weeks (Monday–Sunday)', () => {
  it.each([
    ['2026-10-24', '2026-W43'], // Saturday
    ['2026-10-26', '2026-W44'], // Monday
    ['2026-11-01', '2026-W44'], // Sunday
    ['2027-01-01', '2026-W53'], // Friday: still the last week of 2026
    ['2026-01-01', '2026-W01'], // Thursday: week 1 of its own year
    ['2024-12-30', '2025-W01'], // Monday: already week 1 of the next year
    ['2021-01-03', '2020-W53'], // Sunday after a 53-week year
  ])('%s is in %s', (date, week) => {
    expect(isoWeekOf(date)).toBe(week);
  });

  it('weeks start on Monday and have seven days', () => {
    expect(weekStart('2026-W44')).toBe('2026-10-26');
    expect(weekDates('2026-W44')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(weekStart('2026-W01')).toBe('2025-12-29');
    expect(weekStart('2026-W53')).toBe('2026-12-28');
  });

  it('knows which years have 53 weeks', () => {
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
    expect(weeksInYear(2020)).toBe(53);
  });

  it.each([
    ['2026-W44', true],
    ['2026-W53', true],
    ['2025-W53', false],
    ['2026-W00', false],
    ['2026-W54', false],
    ['2026-W1', false],
    ['2026-44', false],
    ['', false],
  ])('%j is a week: %s', (week, valid) => {
    expect(isIsoWeek(week)).toBe(valid);
  });

  it('a week that does not exist throws instead of guessing', () => {
    expect(() => weekStart('2025-W53')).toThrow();
  });

  it('moves between weeks across new year, also through week 53', () => {
    expect(addWeeks('2026-W52', 1)).toBe('2026-W53');
    expect(addWeeks('2026-W53', 1)).toBe('2027-W01');
    expect(addWeeks('2027-W01', -1)).toBe('2026-W53');
    expect(addWeeks('2025-W52', 1)).toBe('2026-W01');
  });

  it('adds days across months and summer time (calendar days, no time zones)', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('spec 09 FR-PLAN-003 the days whose needs count (decision 4)', () => {
  it('this week: from today to Sunday', () => {
    expect(needsRange('2026-W43', '2026-10-24')).toEqual({ from: '2026-10-24', to: '2026-10-25' });
  });
  it('a future week: the whole week', () => {
    expect(needsRange('2026-W44', '2026-10-24')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });
  it('a week that is over: nothing', () => {
    expect(needsRange('2026-W42', '2026-10-24')).toBeNull();
  });
  it('on Sunday only Sunday is left', () => {
    expect(needsRange('2026-W43', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-10-25' });
  });
});
