import nodemailer, { type SendMailOptions, type SMTPTransportOptions } from 'nodemailer';
import type { MailSettings } from '../../config';
import { MailSendError, type MailMessage, type MailSender } from './types';

/** Spec 17: 10 s to connect and greet, 20 s for the whole conversation. */
const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

/**
 * SMTP with encryption required: STARTTLS on 587, TLS from the start on 465 (ADR-0024). The password is handed to
 * nodemailer and nowhere else; `logger` and `debug` stay off, so the SMTP conversation is never printed.
 */
export function smtpTransportOptions(settings: MailSettings): SMTPTransportOptions {
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: true,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: CONNECT_TIMEOUT_MS,
    greetingTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    logger: false,
    debug: false,
  };
}

/** What nodemailer is given for one message. Plain text; the sender is always ours. */
export function mailOptions(settings: MailSettings, message: MailMessage): SendMailOptions {
  return {
    from: { name: settings.from.name, address: settings.from.address },
    to: message.to,
    subject: message.subject,
    text: message.text,
    disableUrlAccess: true,
    disableFileAccess: true,
  };
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z_]{2,30}$/.test(code) ? code : 'EUNKNOWN';
}

export function createSmtpMailSender(settings: MailSettings): MailSender {
  const transport = nodemailer.createTransport(smtpTransportOptions(settings));
  return {
    async send(message) {
      try {
        await transport.sendMail(mailOptions(settings, message));
      } catch (error) {
        // Only the code goes on: the error's message and `response` can contain the recipient's address.
        throw new MailSendError(errorCode(error));
      }
    },
  };
}
