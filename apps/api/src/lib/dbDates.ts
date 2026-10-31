/*
 * Postgres DATE columns come back from Prisma as a Date at UTC midnight. The API and the app work with
 * "YYYY-MM-DD" strings; these two helpers convert at the database boundary only.
 */
export function toDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
