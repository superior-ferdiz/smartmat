import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { BackupStatusResponse } from '@smartmat/shared';

/*
 * Spec 13 (NFR-OPS-003, ADR-0021): docker/backup/check-backup.sh writes a small status file after every check, and
 * the file is mounted read-only into the app. The app only reads it. A status that is itself too old means the
 * check has stopped running, and that is reported as "stale" too – a silent checker must not look like "ok".
 */

/** The backup runs every night; one missed night is allowed a couple of hours' slack. */
export const BACKUP_MAX_AGE_MS = 26 * 60 * 60_000;

const statusFileSchema = z.object({
  checkedAt: z.iso.datetime({ offset: true }),
  state: z.enum(['ok', 'stale', 'failed']),
  newestBackupAt: z.iso.datetime({ offset: true }).nullable(),
});

export async function readBackupStatus(
  path: string | null,
  now: Date,
): Promise<BackupStatusResponse> {
  if (!path) return { state: 'off', newestBackupAt: null };
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return { state: 'unknown', newestBackupAt: null };
  }
  let parsed;
  try {
    parsed = statusFileSchema.safeParse(JSON.parse(text.slice(0, 10_000)));
  } catch {
    return { state: 'unknown', newestBackupAt: null };
  }
  if (!parsed.success) return { state: 'unknown', newestBackupAt: null };
  const { state, checkedAt, newestBackupAt } = parsed.data;
  const newest = newestBackupAt ? new Date(newestBackupAt) : null;
  const tooOld = (at: Date | null) => !at || now.getTime() - at.getTime() > BACKUP_MAX_AGE_MS;
  if (state === 'failed') return { state, newestBackupAt: newest?.toISOString() ?? null };
  if (state === 'stale' || tooOld(new Date(checkedAt)) || tooOld(newest)) {
    return { state: 'stale', newestBackupAt: newest?.toISOString() ?? null };
  }
  return { state: 'ok', newestBackupAt: newest?.toISOString() ?? null };
}
