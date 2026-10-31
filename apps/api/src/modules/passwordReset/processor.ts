import { PASSWORD_RESET_TTL_MINUTES } from '@smartmat/shared';
import type { Clock } from '../../lib/clock';
import { MailSendError, type MailSender } from '../../providers/mail/types';
import { hashSessionToken, newSessionToken } from '../auth/tokens';
import type { MailJob } from './jobs';
import { changedMail, resetMail } from './mail';
import type { PasswordResetRepo } from './repo';

const MINUTE = 60_000;
const RESET_TTL_MS = PASSWORD_RESET_TTL_MINUTES * MINUTE;
const HOUR = 60 * MINUTE;

/** What the job did. Logged with the job id – never the address, the token or the SMTP server's reply. */
export type MailOutcome = 'sent' | 'stale' | 'overLimit' | 'noAccount';

export interface MailProcessorDeps {
  repo: PasswordResetRepo;
  sender: MailSender;
  now: Clock;
  /** Where the link points: the first of APP_ORIGINS. */
  linkOrigin: string;
  /** FR-AUTH-006a: reset e-mails per account per hour. */
  perHour: number;
}

/**
 * Spec 17: runs one mail job in the mailer (src/mailer.ts). A reset job makes the link here, so the token only ever
 * exists in this process and in the e-mail. A failed send throws (pg-boss tries again) after removing the link
 * nobody received.
 */
export class MailProcessor {
  constructor(private readonly deps: MailProcessorDeps) {}

  async process(job: MailJob): Promise<MailOutcome> {
    const { repo, now } = this.deps;
    const recipient = await repo.findRecipient(job.userId);
    // The account was deleted after the request.
    if (!recipient) return 'noAccount';
    const at = now();

    if (job.kind === 'passwordChanged') {
      await this.deps.sender.send(
        changedMail(recipient, this.deps.linkOrigin, new Date(job.requestedAt)),
      );
      return 'sent';
    }

    // FR-AUTH-006b: nobody is waiting for a link asked for longer ago than it would have worked.
    if (at.getTime() - new Date(job.requestedAt).getTime() > RESET_TTL_MS) return 'stale';
    if (
      (await repo.countTokensSince(job.userId, new Date(at.getTime() - HOUR))) >= this.deps.perHour
    ) {
      return 'overLimit';
    }
    const token = newSessionToken();
    const { id } = await repo.createToken({
      userId: job.userId,
      tokenHash: hashSessionToken(token),
      createdAt: at,
      expiresAt: new Date(at.getTime() + RESET_TTL_MS),
    });
    try {
      await this.deps.sender.send(resetMail(recipient, this.deps.linkOrigin, token));
    } catch (error) {
      await repo.deleteToken(id);
      throw error instanceof MailSendError ? error : new MailSendError('EUNKNOWN');
    }
    return 'sent';
  }
}
