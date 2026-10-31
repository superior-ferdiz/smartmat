import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import type { MailSettings } from '../../config';
import { mailOptions, smtpTransportOptions } from './smtp';

/*
 * Spec 17 (ADR-0024): what the SMTP client is told, and what the message looks like. Built with nodemailer's stream
 * transport, which writes the message to a buffer: nothing is sent and no server is contacted.
 */

const settings: MailSettings = {
  host: 'smtp.example.test',
  port: 587,
  user: 'avsender@example.test',
  password: 'ikke-et-ekte-passord',
  from: { address: 'avsender@example.test', name: 'SmartMat' },
  linkOrigin: 'https://smartmat.example.test',
};

async function raw(message: Parameters<typeof mailOptions>[1]) {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await transport.sendMail(mailOptions(settings, message));
  return (info.message as Buffer).toString('utf8');
}

describe('FR-AUTH-006 SMTP settings', () => {
  it('encryption is required (STARTTLS on 587), with timeouts and no protocol logging', () => {
    expect(smtpTransportOptions(settings)).toMatchObject({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false,
      debug: false,
    });
    expect(smtpTransportOptions({ ...settings, port: 465 }).secure).toBe(true);
  });
});

describe('FR-AUTH-006 the message', () => {
  it('plain text from our sender to the one address, without HTML or attachments', async () => {
    const message = await raw({
      to: 'kari@example.test',
      subject: 'Nytt passord til SmartMat',
      text: 'Hei, Kari!\n\nhttps://smartmat.example.test/nytt-passord#abc\n',
    });
    expect(message).toMatch(/^From: SmartMat <avsender@example\.test>$/m);
    expect(message).toMatch(/^To: kari@example\.test$/m);
    expect(message).toMatch(/^Content-Type: text\/plain; charset=utf-8$/m);
    expect(message).not.toMatch(/text\/html|multipart|X-Mailer/i);
    expect(message).not.toContain('ikke-et-ekte-passord');
  });

  it('a line break in the subject cannot add a header', async () => {
    const message = await raw({
      to: 'kari@example.test',
      subject: 'Emne\r\nBcc: angriper@example.test',
      text: 'tekst',
    });
    expect(message).not.toMatch(/^Bcc:/m);
  });
});
