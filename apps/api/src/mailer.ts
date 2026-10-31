import pino from 'pino';
import { loadConfig, loadRootEnvFile, missingMailVariables } from './config';
import { createDb } from './db';
import { systemClock } from './lib/clock';
import { MAIL_QUEUE, startJobs } from './lib/receiptQueue';
import type { MailJob } from './modules/passwordReset/jobs';
import { MailProcessor } from './modules/passwordReset/processor';
import { createPasswordResetRepo } from './modules/passwordReset/repo';
import { createSmtpMailSender } from './providers/mail/smtp';
import { MailSendError } from './providers/mail/types';

/*
 * The mailer (spec 17, ADR-0024): sends the e-mails the API queues, one at a time, through SMTP. A third entry point
 * of the API package, in its own container with access to the internet – so the receipt worker can stay without it.
 *   npm run mailer -w @smartmat/api
 * The log gets job ids, outcomes and SMTP error codes only: never an address, a token or the server's reply.
 */

loadRootEnvFile();
const config = loadConfig();
const log = pino({ level: config.logLevel });

if (!config.mail) {
  // FR-AUTH-006e: off. Waits instead of exiting, so the container does not restart in a loop.
  log.info({ missing: missingMailVariables() }, 'mail off');
  const idle = setInterval(() => undefined, 60 * 60 * 1000);
  const stop = () => {
    clearInterval(idle);
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  const db = createDb(config.databaseUrl);
  const processor = new MailProcessor({
    repo: createPasswordResetRepo(db),
    sender: createSmtpMailSender(config.mail),
    now: systemClock,
    linkOrigin: config.mail.linkOrigin,
    perHour: config.passwordResetsPerHour,
  });
  const boss = await startJobs(config.databaseUrl, 'mailer');
  boss.on('error', (error: Error) => log.error({ errorName: error.name }, 'job queue error'));
  await boss.work<MailJob>(
    MAIL_QUEUE,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      if (!job) return;
      try {
        const outcome = await processor.process(job.data);
        log.info({ jobId: job.id, kind: job.data.kind, outcome }, 'mail job');
      } catch (error) {
        const code = error instanceof MailSendError ? error.code : 'EINTERNAL';
        log.warn({ jobId: job.id, kind: job.data.kind, code }, 'mail not sent');
        throw new Error(code);
      }
    },
  );
  log.info({ host: config.mail.host, port: config.mail.port }, 'mailer started');

  const shutdown = async () => {
    await boss.stop({ graceful: true, timeout: 30_000 });
    await db.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
