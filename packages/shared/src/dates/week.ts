/*
 * FR-PLAN-001 (spec 09): ISO weeks, Monday to Sunday, as "2026-W44". Dates are calendar dates
 * ("YYYY-MM-DD") in Norway, so there are no time zones here: "today" comes from osloDate().
 */

const DAY_MS = 86_400_000;
const WEEK = /^(\d{4})-W(\d{2})$/;

function toDay(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

function fromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
function weekday(day: number): number {
  // 1970-01-01 was a Thursday.
  return (((day + 3) % 7) + 7) % 7;
}

/** "2026-10-24" + 3 → "2026-10-27". */
export function addDays(date: string, count: number): string {
  return fromDay(toDay(date) + count);
}

/** The ISO week a date belongs to: "2026-10-24" → "2026-W43". The year is the week's (Thursday's) year. */
export function isoWeekOf(date: string): string {
  const day = toDay(date);
  const thursday = day - weekday(day) + 3;
  const year = new Date(thursday * DAY_MS).getUTCFullYear();
  const week = Math.floor((thursday - firstMonday(year)) / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday of week 1: the week with 4 January in it. */
function firstMonday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4) / DAY_MS;
  return jan4 - weekday(jan4);
}

/** 52 or 53. */
export function weeksInYear(year: number): number {
  // 28 December is always in the last week of its year.
  return Number(isoWeekOf(`${year}-12-28`).slice(6));
}

/** True for a week that exists ("2026-W53" does not: 2026 has 52 weeks). */
export function isIsoWeek(week: string): boolean {
  const match = WEEK.exec(week);
  if (!match) return false;
  const year = Number(match[1]);
  const number = Number(match[2]);
  return year >= 1970 && number >= 1 && number <= weeksInYear(year);
}

/** "2026-W44" → its Monday, "2026-10-26". The week must exist (isIsoWeek). */
export function weekStart(week: string): string {
  const match = WEEK.exec(week);
  if (!match || !isIsoWeek(week)) throw new Error(`not an ISO week: ${week}`);
  return fromDay(firstMonday(Number(match[1])) + (Number(match[2]) - 1) * 7);
}

/** The seven dates of a week, Monday first. */
export function weekDates(week: string): string[] {
  const monday = weekStart(week);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "2026-W52" + 1 → "2027-W53" or "2027-W01", whichever comes next. */
export function addWeeks(week: string, count: number): string {
  return isoWeekOf(addDays(weekStart(week), count * 7));
}

/**
 * FR-PLAN-003, decision 4: the days whose needs count. From today (or Monday, for a week in the future) to
 * Sunday; null for a week that is over.
 */
export function needsRange(week: string, today: string): { from: string; to: string } | null {
  const dates = weekDates(week);
  const monday = dates[0] ?? today;
  const sunday = dates[6] ?? today;
  if (sunday < today) return null;
  return { from: monday > today ? monday : today, to: sunday };
}
