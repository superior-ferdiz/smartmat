/*
 * Spec 17: the mail jobs the API queues for the mailer (src/mailer.ts). A job carries only the account id and when
 * it was asked for – never the address or a token (the mailer reads the address and makes the token itself), so
 * neither ends up in the pgboss tables or in backups.
 */

export const MAIL_KINDS = ['passwordReset', 'passwordChanged'] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

export interface MailJob {
  kind: MailKind;
  userId: string;
  /** ISO time. A reset link nobody has received 30 minutes after it was asked for is not sent (FR-AUTH-006b). */
  requestedAt: string;
}

export interface MailQueue {
  enqueue(job: MailJob): Promise<void>;
}
