/*
 * E-mail (spec 17, ADR-0024). The mailer only sends through this interface, so tests use a fake (test/fakeMail.ts)
 * and never reach an SMTP server.
 */

/** Plain text only: no HTML, no images, no tracking (spec 17, "E-posten"). */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailSender {
  send(message: MailMessage): Promise<void>;
}

/**
 * A failed send. `code` is the SMTP client's error code (EAUTH, ECONNECTION, ETIMEDOUT …) and is the only thing that
 * may be logged: the server's reply text can contain the address.
 */
export class MailSendError extends Error {
  constructor(readonly code: string) {
    super(`mail not sent (${code})`);
    this.name = 'MailSendError';
  }
}
