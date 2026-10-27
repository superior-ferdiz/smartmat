import { osloDate } from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { unauthenticated } from '../../lib/errors';
import type { PrivacyRepo } from './repo';

export interface PrivacyServiceDeps {
  repo: PrivacyRepo;
  now: Clock;
}

/** Bumped when the shape of the file changes, so a reader can tell versions apart. */
export const EXPORT_FORMAT_VERSION = 1;

/** Spec 13 (FR-PRIV-001): a copy of the caller's own data (GDPR art. 15 and 20) as one JSON file. */
export class PrivacyService {
  constructor(private readonly deps: PrivacyServiceDeps) {}

  async export(userId: string) {
    const data = await this.deps.repo.exportFor(userId);
    // The session outlived the user (deleted in another tab).
    if (!data) throw unauthenticated();
    const now = this.deps.now();
    return {
      fileName: `smartmat-eksport-${osloDate(now)}.json`,
      body: {
        format: 'smartmat-export',
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: now.toISOString(),
        about:
          'Dine data i SmartMat (personvernforordningen art. 15 og 20). Kvitteringsbilder og OCR-tekst er ikke med: de slettes innen 7 dager. Passord og innloggingsnøkler er aldri med.',
        ...data,
      },
    };
  }
}
