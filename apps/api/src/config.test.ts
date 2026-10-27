import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

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
