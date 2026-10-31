import { tokenFromResetHash } from '@smartmat/shared';
import type { Db } from '../src/db';
import type { Clock } from '../src/lib/clock';
import type { MailJob, MailQueue } from '../src/modules/passwordReset/jobs';
import { MailProcessor, type MailOutcome } from '../src/modules/passwordReset/processor';
import { createPasswordResetRepo } from '../src/modules/passwordReset/repo';
import { MailSendError, type MailMessage, type MailSender } from '../src/providers/mail/types';
import { ORIGIN } from './helpers';

/*
 * Spec 17 test helpers. No test ever connects to an SMTP server: the API gets a fake queue, and the mailer's job is
 * run here with a fake sender that keeps the messages (made-up addresses only).
 */

/** Records the jobs the API queued, instead of pg-boss. */
export function fakeMailQueue() {
  const jobs: MailJob[] = [];
  const queue: MailQueue = {
    async enqueue(job) {
      jobs.push(job);
    },
  };
  return { queue, jobs };
}

/** Keeps every message. `failWith` makes the next sends fail with that SMTP error code. */
export function fakeMailSender() {
  const sent: MailMessage[] = [];
  const state = { failWith: null as string | null };
  const sender: MailSender = {
    async send(message) {
      if (state.failWith) throw new MailSendError(state.failWith);
      sent.push(message);
    },
  };
  return { sender, sent, state };
}

/** The mailer's work: runs and removes every queued job, like pg-boss would one at a time. */
export async function runMailJobs(
  db: Db,
  jobs: MailJob[],
  sender: MailSender,
  now: Clock,
  perHour = 3,
): Promise<MailOutcome[]> {
  const processor = new MailProcessor({
    repo: createPasswordResetRepo(db),
    sender,
    now,
    linkOrigin: ORIGIN,
    perHour,
  });
  const outcomes: MailOutcome[] = [];
  for (const job of jobs.splice(0)) outcomes.push(await processor.process(job));
  return outcomes;
}

/** The token in the link of a reset e-mail. */
export function tokenFromMail(message: MailMessage | undefined): string {
  const match = message?.text.match(/\/nytt-passord(#\S+)/);
  const token = match?.[1] ? tokenFromResetHash(match[1]) : null;
  if (!token) throw new Error('no reset link in the message');
  return token;
}
