import { describe, expect, it } from 'vitest';
import { loadConfig, missingMailVariables } from './config';

const base = {
  DATABASE_URL: 'postgresql://u:hemmelig-passord@127.0.0.1:55432/smartmat',
  APP_ORIGINS: 'http://127.0.0.1:5173, http://localhost:5173',
};

describe('config', () => {
  it('reads the environment with safe defaults', () => {
    const config = loadConfig(base);
    expect(config.allowedOrigins).toEqual(['http://127.0.0.1:5173', 'http://localhost:5173']);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3100);
    expect(config.cookieSecure).toBe(true);
  });

  it('names missing variables without printing any values', () => {
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/APP_ORIGINS/);
    try {
      loadConfig({ DATABASE_URL: base.DATABASE_URL, APP_ORIGINS: '', API_PORT: 'x' });
    } catch (error) {
      expect(String(error)).not.toContain('hemmelig-passord');
    }
  });
});

describe('config for the test environment (ADR-0015) and barcodes (spec 07)', () => {
  it('locally: no trusted proxy, open registration, plain cookie name, Vite serves the page, OFF off', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      trustProxy: false,
      registrationOpen: true,
      cookieHostPrefix: false,
      webDistDir: null,
      barcode: {
        offBaseUrl: 'https://world.openfoodfacts.net',
        offUserAgent: null,
        offTimeoutMs: 3000,
        offMaxPerMinute: 10,
        lookupsPerUserPerMinute: 30,
      },
    });
  });

  it('an empty line in an env file (`OFF_USER_AGENT=`) means "not set", as in .env.staging.example', () => {
    const config = loadConfig({
      ...base,
      OFF_USER_AGENT: '',
      KASSALAPP_API_KEY: ' ',
      WEB_DIST_DIR: '',
      OCR_PROVIDER: '',
    });
    expect(config.barcode.offUserAgent).toBeNull();
    expect(config.prices.kassalappApiKey).toBeNull();
    expect(config.webDistDir).toBeNull();
    expect(config.receipts.ocrProvider).toBe('off');
    // A required variable that is empty is still missing.
    expect(() => loadConfig({ ...base, APP_ORIGINS: '' })).toThrow(/APP_ORIGINS/);
  });

  it('TRUST_PROXY: a list of addresses and CIDR ranges', () => {
    expect(loadConfig({ ...base, TRUST_PROXY: '172.26.0.0/16, 127.0.0.1' }).trustProxy).toEqual([
      '172.26.0.0/16',
      '127.0.0.1',
    ]);
    expect(loadConfig({ ...base, TRUST_PROXY: '' }).trustProxy).toBe(false);
    expect(loadConfig({ ...base, TRUST_PROXY: 'fd00::/8' }).trustProxy).toEqual(['fd00::/8']);
  });

  it.each(['true', 'caddy', '172.26.0.0/33', '172.26.0/16', '1.2.3.4/16/2', '*'])(
    'TRUST_PROXY=%s is refused (it would trust everyone or nothing sensible)',
    (value) => {
      expect(() => loadConfig({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    },
  );

  it('the closed test environment', () => {
    const config = loadConfig({
      ...base,
      REGISTRATION_OPEN: 'false',
      COOKIE_HOST_PREFIX: 'true',
      WEB_DIST_DIR: '/app/apps/web/dist',
      OFF_BASE_URL: 'https://world.openfoodfacts.org',
      OFF_USER_AGENT: 'SmartMat/0.7 (kontakt@example.test)',
    });
    expect(config).toMatchObject({
      registrationOpen: false,
      cookieHostPrefix: true,
      webDistDir: '/app/apps/web/dist',
      barcode: {
        offBaseUrl: 'https://world.openfoodfacts.org',
        offUserAgent: 'SmartMat/0.7 (kontakt@example.test)',
      },
    });
  });

  it('a __Host- cookie needs Secure; OFF only over https and at most 15 a minute', () => {
    expect(() =>
      loadConfig({ ...base, COOKIE_HOST_PREFIX: 'true', COOKIE_SECURE: 'false' }),
    ).toThrow(/COOKIE_HOST_PREFIX/);
    expect(() => loadConfig({ ...base, OFF_BASE_URL: 'http://world.openfoodfacts.org' })).toThrow(
      /OFF_BASE_URL/,
    );
    expect(() => loadConfig({ ...base, OFF_MAX_PER_MINUTE: '16' })).toThrow(/OFF_MAX_PER_MINUTE/);
  });
});

describe('config for e-mail (spec 17, FR-AUTH-006e)', () => {
  const mailEnv = {
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'avsender@example.test',
    SMTP_PASSWORD: 'et-hemmelig-app-passord',
    MAIL_FROM: 'avsender@example.test',
  };

  it('off unless host, user, password and sender are all set; the names of the missing ones, never values', () => {
    expect(loadConfig(base).mail).toBeNull();
    expect(missingMailVariables({})).toEqual([
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'MAIL_FROM',
    ]);
    // An empty SMTP_PASSWORD= (as in the staging file before it is filled in) means "not set".
    const blank = { ...base, ...mailEnv, SMTP_PASSWORD: '' };
    expect(loadConfig(blank).mail).toBeNull();
    expect(missingMailVariables(blank)).toEqual(['SMTP_PASSWORD']);
  });

  it('on with all four: port 587 and the name "SmartMat" by default, links to the first allowed origin', () => {
    expect(loadConfig({ ...base, ...mailEnv }).mail).toEqual({
      host: 'smtp.example.test',
      port: 587,
      user: 'avsender@example.test',
      password: 'et-hemmelig-app-passord',
      from: { address: 'avsender@example.test', name: 'SmartMat' },
      linkOrigin: 'http://127.0.0.1:5173',
    });
  });

  it('a bad sender address stops the start without printing the password', () => {
    expect(() => loadConfig({ ...base, ...mailEnv, MAIL_FROM: 'ikke en adresse' })).toThrow(
      /MAIL_FROM/,
    );
    try {
      loadConfig({ ...base, ...mailEnv, MAIL_FROM: 'ikke en adresse' });
    } catch (error) {
      expect(String(error)).not.toContain('et-hemmelig-app-passord');
    }
  });

  it('limits: 5 per IP address in 15 minutes, 3 e-mails per account per hour', () => {
    const config = loadConfig(base);
    expect(config.rateLimits.passwordReset).toEqual({ max: 5, windowMs: 15 * 60_000 });
    expect(config.passwordResetsPerHour).toBe(3);
  });
});
