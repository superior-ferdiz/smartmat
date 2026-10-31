import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readBackupStatus } from './backupStatus';

/* Spec 13 (NFR-OPS-003): the app's reading of the status file the backup check writes. */

const dir = mkdtempSync(join(tmpdir(), 'smartmat-backup-status-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const NOW = new Date('2026-10-26T08:00:00Z');
const HOUR = 60 * 60_000;
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString();

let n = 0;
function file(content: unknown) {
  const path = join(dir, `status-${n++}.json`);
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
  return path;
}

describe('readBackupStatus', () => {
  it('not configured → off (no banner locally)', async () => {
    expect(await readBackupStatus(null, NOW)).toEqual({ state: 'off', newestBackupAt: null });
  });

  it('a fresh check and a fresh backup → ok', async () => {
    const path = file({ checkedAt: ago(1), state: 'ok', newestBackupAt: ago(5) });
    expect(await readBackupStatus(path, NOW)).toEqual({ state: 'ok', newestBackupAt: ago(5) });
  });

  it('the newest backup is older than 26 hours → stale, even if the check said ok', async () => {
    const path = file({ checkedAt: ago(1), state: 'ok', newestBackupAt: ago(27) });
    expect((await readBackupStatus(path, NOW)).state).toBe('stale');
  });

  it('the check itself has not run for 26 hours → stale (a silent checker is not "ok")', async () => {
    const path = file({ checkedAt: ago(30), state: 'ok', newestBackupAt: ago(31) });
    expect((await readBackupStatus(path, NOW)).state).toBe('stale');
  });

  it('failed stays failed, and stale stays stale', async () => {
    expect(
      (
        await readBackupStatus(
          file({ checkedAt: ago(1), state: 'failed', newestBackupAt: ago(2) }),
          NOW,
        )
      ).state,
    ).toBe('failed');
    expect(
      (
        await readBackupStatus(
          file({ checkedAt: ago(1), state: 'stale', newestBackupAt: null }),
          NOW,
        )
      ).state,
    ).toBe('stale');
  });

  it('missing file, not JSON, wrong shape or no backup yet → unknown or stale, never ok', async () => {
    expect((await readBackupStatus(join(dir, 'missing.json'), NOW)).state).toBe('unknown');
    expect((await readBackupStatus(file('not json'), NOW)).state).toBe('unknown');
    expect((await readBackupStatus(file({ state: 'ok' }), NOW)).state).toBe('unknown');
    expect(
      (await readBackupStatus(file({ checkedAt: ago(1), state: 'ok', newestBackupAt: null }), NOW))
        .state,
    ).toBe('stale');
  });
});
