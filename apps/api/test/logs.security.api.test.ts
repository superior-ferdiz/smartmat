import { describe, expect, it } from 'vitest';
import { osloDate } from '@smartmat/shared';
import { fakeOffFetch, KNOWN, lookupCode, testBarcodeProvider } from './barcodeHelpers';
import { fakePwnedCheck, LEAKED_PASSWORD, PWNED_DOWN_PASSWORD } from './fakePwned';
import { invite, accept, householdPath } from './householdHelpers';
import { createItem } from './inventoryHelpers';
import { barcodePrices, fakeKassalappFetch, testPriceProvider } from './priceHelpers';
import { createPurchase } from './purchaseHelpers';
import { fakeQueue, runWorker, upload } from './receiptHelpers';
import { addLine } from './shoppingHelpers';
import {
  call,
  captureLog,
  createTestApp,
  login,
  PASSWORD,
  registerUser,
  useTestDatabase,
} from './helpers';

/*
 * Spec 13 (NFR-SEC-008): one walk through most of the app with known, made-up values, and then a search of the whole
 * log for them. The earlier phases each checked their own module; this checks them together, plus the phase-13
 * routes (sessions, export, leaked-password check). The API logs at "info" here, as in the test environment.
 */

const db = useTestDatabase();
const today = osloDate(new Date());

describe('NFR-SEC-008 no personal data anywhere in the log', () => {
  it('after registration, logins, items, purchases, barcodes, prices, receipts, invitations, sessions and export', async () => {
    const log = captureLog();
    const { queue } = fakeQueue();
    const app = await createTestApp(db, {
      logStream: log.stream,
      config: {
        logLevel: 'info',
        pwnedPasswords: {
          enabled: true,
          baseUrl: 'https://api.pwnedpasswords.com',
          timeoutMs: 200,
        },
      },
      receiptQueue: queue,
      pwnedPasswords: fakePwnedCheck(),
      barcodeProvider: testBarcodeProvider(fakeOffFetch().fetchFn as typeof fetch),
      priceProvider: testPriceProvider(fakeKassalappFetch().fetchFn),
    });
    const secrets = {
      email: 'loggsjekk.kari@example.test',
      name: 'Loggsjekk Karisen',
      otherEmail: 'loggsjekk.ola@example.test',
      otherName: 'Loggsjekk Olasen',
      item: 'Loggsjekk havremelk',
      store: 'Loggsjekk butikk',
      line: 'Loggsjekk sjampo',
      shopping: 'Loggsjekk brød',
    };
    try {
      const kari = await registerUser(app, { email: secrets.email, displayName: secrets.name });
      await call(app, 'POST', '/auth/register', {
        body: {
          displayName: secrets.name,
          email: 'lekket@example.test',
          password: LEAKED_PASSWORD,
        },
      });
      await call(app, 'POST', '/auth/register', {
        body: {
          displayName: secrets.name,
          email: 'nede@example.test',
          password: PWNED_DOWN_PASSWORD,
        },
      });
      await login(app, secrets.email, 'feil passord i loggsjekken');
      await call(app, 'POST', '/auth/login', {
        body: { email: secrets.email, password: PASSWORD },
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Firefox/132.0',
          'x-forwarded-for': '203.0.113.77',
        },
        remoteAddress: '198.51.100.23',
      });
      await createItem(app, kari, { name: secrets.item });
      await createPurchase(app, kari, {
        storeName: secrets.store,
        purchasedOn: today,
        lines: [{ description: secrets.line, kind: 'nonFood', amountOre: 4990 }],
      });
      await addLine(app, kari, { text: secrets.shopping });
      await lookupCode(app, kari, KNOWN);
      await barcodePrices(app, kari, KNOWN);
      const receipt = await upload(app, kari);
      const workerLog = await runWorker(db, receipt.id);
      const ola = await registerUser(app, {
        email: secrets.otherEmail,
        displayName: secrets.otherName,
      });
      const { token } = await invite(app, kari);
      await accept(app, ola, token);
      await call(app, 'GET', householdPath(kari.user.householdId, '/members'), { client: kari });
      await call(app, 'GET', '/me/sessions', { client: kari });
      await call(app, 'GET', '/me/login-notices', { client: kari });
      await call(app, 'POST', '/me/sessions/end-others', { client: kari });
      await call(app, 'GET', '/me/export', { client: kari });
      await call(app, 'POST', '/me/password', {
        client: kari,
        body: { currentPassword: PASSWORD, newPassword: 'nytt passord i loggsjekken' },
      });

      const sessions = await db.session.findMany();
      const text = `${log.text()}\n${workerLog}`;
      expect(text).toContain('request completed'); // the log is really captured
      expect(text).toContain('/api/v1/me/export');
      const forbidden = [
        ...Object.values(secrets),
        PASSWORD,
        LEAKED_PASSWORD,
        PWNED_DOWN_PASSWORD,
        'feil passord i loggsjekken',
        'nytt passord i loggsjekken',
        KNOWN,
        token,
        kari.cookie,
        kari.csrfToken,
        ...sessions.flatMap((s) => [s.tokenHash, s.csrfToken]),
        '203.0.113.77',
        '198.51.100.23',
        '127.0.0.1"', // the inject default address, as a logged value
        'Firefox/132.0',
      ];
      const found = forbidden.filter((secret) => text.includes(secret));
      expect(found).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
