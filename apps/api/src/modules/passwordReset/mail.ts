import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_RESET_TTL_MINUTES,
  passwordResetLink,
  type Locale,
} from '@smartmat/shared';
import type { MailMessage } from '../../providers/mail/types';
import type { MailRecipient } from './repo';

/*
 * Spec 17: the two e-mails, plain text in the account's language. The texts live here and not in the web app's
 * locale files, because the mailer sends them without a browser.
 */

const SIGN_OFF: Record<Locale, string> = {
  'nb-NO': 'Hilsen SmartMat',
  en: 'SmartMat',
};

function formatTime(locale: Locale, at: Date): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Oslo',
  }).format(at);
}

export function resetMail(recipient: MailRecipient, origin: string, token: string): MailMessage {
  const link = passwordResetLink(origin, token);
  const minutes = PASSWORD_RESET_TTL_MINUTES;
  const text =
    recipient.locale === 'en'
      ? [
          `Hi ${recipient.displayName},`,
          '',
          'Someone (hopefully you) asked to set a new password for your SmartMat account.',
          `Open the link to choose a new password. It works for ${minutes} minutes and only once:`,
          '',
          link,
          '',
          'If you did not ask for this, you can ignore this e-mail. Your password has not been changed.',
        ]
      : [
          `Hei, ${recipient.displayName}!`,
          '',
          'Noen (forhåpentligvis du) har bedt om å sette nytt passord for SmartMat-kontoen din.',
          `Åpne lenken for å velge et nytt passord. Den virker i ${minutes} minutter og kan brukes én gang:`,
          '',
          link,
          '',
          'Har du ikke bedt om dette, kan du se bort fra e-posten. Passordet ditt er ikke endret.',
        ];
  return {
    to: recipient.email,
    subject: recipient.locale === 'en' ? 'New password for SmartMat' : 'Nytt passord til SmartMat',
    text: [...text, '', SIGN_OFF[recipient.locale], ''].join('\n'),
  };
}

export function changedMail(recipient: MailRecipient, origin: string, at: Date): MailMessage {
  const when = formatTime(recipient.locale, at);
  const forgot = `${origin.replace(/\/+$/, '')}${FORGOT_PASSWORD_PATH}`;
  const text =
    recipient.locale === 'en'
      ? [
          `Hi ${recipient.displayName},`,
          '',
          `The password for your SmartMat account was changed on ${when} with a link from "Forgot password".`,
          'Every session has been logged out. Two-factor login, if you use it, is still on.',
          '',
          `If this was not you, set a new password at once at ${forgot} and tell the SmartMat team.`,
        ]
      : [
          `Hei, ${recipient.displayName}!`,
          '',
          `Passordet til SmartMat-kontoen din ble endret ${when} med en lenke fra «Glemt passord».`,
          'Alle økter er logget ut. Tofaktorinnlogging er fortsatt på hvis du bruker det.',
          '',
          `Var det ikke deg, må du sette nytt passord med en gang på ${forgot} og si fra til SmartMat-teamet.`,
        ];
  return {
    to: recipient.email,
    subject:
      recipient.locale === 'en'
        ? 'Your SmartMat password was changed'
        : 'Passordet ditt i SmartMat er endret',
    text: [...text, '', SIGN_OFF[recipient.locale], ''].join('\n'),
  };
}
