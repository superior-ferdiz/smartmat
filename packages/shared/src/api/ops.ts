import { z } from 'zod';

/*
 * Spec 13 (NFR-OPS-003): how the nightly backup is doing, for the banner in the test environment.
 * off: this server has no backup configured (locally). unknown: configured, but no readable status yet.
 */
export const BACKUP_STATES = ['ok', 'stale', 'failed', 'unknown', 'off'] as const;

export const backupStatusResponseSchema = z.object({
  state: z.enum(BACKUP_STATES),
  newestBackupAt: z.string().nullable(),
});
export type BackupStatusResponse = z.infer<typeof backupStatusResponseSchema>;
