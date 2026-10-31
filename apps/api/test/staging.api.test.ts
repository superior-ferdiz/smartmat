import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { API_ERRORS } from '@smartmat/shared';
import { HOST_SESSION_COOKIE, SESSION_COOKIE } from '../src/plugins/auth';
import { call, createTestApp, ORIGIN, PASSWORD, registerUser, useTestDatabase } from './helpers';

/*
 * ADR-0015: the settings of the closed test environment. Each test builds its own app with that setting;
 * the defaults (used everywhere else) are the local ones.
 */

const db = useTestDatabase();

describe('trustProxy: the client address behind Caddy', () => {
  const limited = { login: { max: 2, windowMs: 60_000 } };

  async function loginAttempts(
    app: Awaited<ReturnType<typeof createTestApp>>,
    from: string,
    forwardedFor: string,
  ) {
    return call(app, 'POST', '/auth/login', {
      body: { email: 'ingen@example.test', password: 'feil passord' },
      remoteAddress: from,
      headers: { 'x-forwarded-for': forwardedFor },
    });
  }

  it("trusted proxy: each client behind it has its own limit (otherwise everyone shares Caddy's)", async () => {
    const app = await createTestApp(db, {
      config: { trustProxy: ['192.168.252.0/28'], rateLimits: { ...testLimits(), ...limited } },
    });
    try {
      for (let i = 0; i < 2; i++)
        expect((await loginAttempts(app, '192.168.252.2', '198.51.100.1')).statusCode).toBe(401);
      expect((await loginAttempts(app, '192.168.252.2', '198.51.100.1')).statusCode).toBe(429);
      // Another visitor through the same proxy is not blocked.
      expect((await loginAttempts(app, '192.168.252.2', '198.51.100.2')).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('a client outside the trusted range cannot choose its address with the header', async () => {
    const app = await createTestApp(db, {
      config: { trustProxy: ['192.168.252.0/28'], rateLimits: { ...testLimits(), ...limited } },
    });
    try {
      for (let i = 0; i < 2; i++) {
        expect((await loginAttempts(app, '203.0.113.9', `198.51.100.${i + 10}`)).statusCode).toBe(
          401,
        );
      }
      expect((await loginAttempts(app, '203.0.113.9', '198.51.100.99')).statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });
});

describe('closed registration', () => {
  it('registration answers 403, whatever is sent; log in still works', async () => {
    const open = await createTestApp(db);
    const kari = await registerUser(open, { email: 'kari@example.test' });
    await open.close();

    const app = await createTestApp(db, { config: { registrationOpen: false } });
    try {
      for (const body of [
        { displayName: 'Ola', email: 'ola@example.test', password: PASSWORD },
        { nonsense: true },
      ]) {
        const response = await call(app, 'POST', '/auth/register', { body });
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe(API_ERRORS.registrationClosed);
      }
      expect(await db.user.count()).toBe(1);
      const login = await call(app, 'POST', '/auth/login', {
        body: { email: kari.user.email, password: PASSWORD },
      });
      expect(login.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('__Host- session cookie', () => {
  it('is set with Secure, Path=/ and no Domain, and is the one that is read', async () => {
    const app = await createTestApp(db, { config: { cookieHostPrefix: true } });
    try {
      const response = await call(app, 'POST', '/auth/register', {
        body: { displayName: 'Kari', email: 'kari@example.test', password: PASSWORD },
      });
      const cookie = response.cookies.find((c) => c.name === HOST_SESSION_COOKIE);
      expect(cookie).toMatchObject({ secure: true, path: '/', httpOnly: true, sameSite: 'Lax' });
      expect(cookie?.domain).toBeUndefined();
      expect(response.cookies.find((c) => c.name === SESSION_COOKIE)).toBeUndefined();

      const me = (name: string) =>
        app.inject({
          method: 'GET',
          url: '/api/v1/me',
          headers: { cookie: `${name}=${cookie?.value}` },
        });
      expect((await me(HOST_SESSION_COOKIE)).statusCode).toBe(200);
      // A cookie with the plain name (for example set by another subdomain) is not a session here.
      expect((await me(SESSION_COOKIE)).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('serving the built web app (one origin)', () => {
  const dist = mkdtempSync(join(tmpdir(), 'smartmat-dist-'));
  const themeScript =
    "\n      try { document.documentElement.dataset.theme = 'dark'; } catch (e) {}\n    ";
  mkdirSync(join(dist, 'assets'));
  writeFileSync(
    join(dist, 'index.html'),
    `<!doctype html><html><head><script>${themeScript}</script><script type="module" src="/assets/app-abc.js"></script></head><body><div id="root"></div></body></html>`,
  );
  writeFileSync(join(dist, 'assets', 'app-abc.js'), 'console.log("app")');
  writeFileSync(join(dist, 'assets', 'reader-abc.wasm'), Buffer.from([0, 97, 115, 109]));
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  async function webApp() {
    return createTestApp(db, { config: { webDistDir: dist } });
  }

  it('page routes get index.html with a CSP that allows our scripts, the theme script and WebAssembly', async () => {
    const app = await webApp();
    try {
      for (const url of ['/', '/matlager', '/skann?kode=7038010000737']) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.headers['cache-control']).toBe('no-cache');
        expect(response.body).toContain('<div id="root">');
        const csp = String(response.headers['content-security-policy']);
        const hash = createHash('sha256').update(themeScript).digest('base64');
        expect(csp).toContain(`script-src 'self' 'wasm-unsafe-eval' 'sha256-${hash}'`);
        expect(csp).not.toContain("'unsafe-inline'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("connect-src 'self'");
        expect(csp).not.toContain('upgrade-insecure-requests');
      }
    } finally {
      await app.close();
    }
  });

  it('built files are served with a long cache; .wasm with its own type', async () => {
    const app = await webApp();
    try {
      const js = await app.inject({ method: 'GET', url: '/assets/app-abc.js' });
      expect(js.statusCode).toBe(200);
      expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const wasm = await app.inject({ method: 'GET', url: '/assets/reader-abc.wasm' });
      expect(wasm.headers['content-type']).toBe('application/wasm');
    } finally {
      await app.close();
    }
  });

  it('the API is still the API: JSON 404 for unknown API paths, nothing for other methods', async () => {
    const app = await webApp();
    try {
      for (const url of ['/api/v1/finnes-ikke', '/api/v1']) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: { code: API_ERRORS.notFound } });
      }
      const post = await app.inject({
        method: 'POST',
        url: '/matlager',
        headers: { origin: ORIGIN },
      });
      expect(post.statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: '/../.env' })).body).not.toContain(
        'DATABASE_URL',
      );
      expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('NFR-SEC-006: the page and the API carry the security headers, and nothing names the server', async () => {
    const app = await webApp();
    try {
      for (const url of ['/', '/matlager', '/assets/app-abc.js', '/api/v1/health']) {
        const h = (await app.inject({ method: 'GET', url })).headers;
        expect(h['strict-transport-security']).toMatch(/max-age=(\d+); includeSubDomains/);
        expect(
          Number(/max-age=(\d+)/.exec(String(h['strict-transport-security']))?.[1]),
        ).toBeGreaterThanOrEqual(31_536_000);
        expect(h['x-content-type-options']).toBe('nosniff');
        expect(h['referrer-policy']).toBe('no-referrer');
        expect(h['cross-origin-opener-policy']).toBe('same-origin');
        expect(h['cross-origin-resource-policy']).toBe('same-origin');
        expect(h['x-frame-options']).toBe('SAMEORIGIN');
        expect(h['x-powered-by']).toBeUndefined();
        expect(h.server).toBeUndefined();
        const csp = String(h['content-security-policy']);
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
      }
    } finally {
      await app.close();
    }
  });

  it('every answer says the camera is for our own page only', async () => {
    const app = await webApp();
    try {
      for (const url of ['/', '/api/v1/health']) {
        const response = await app.inject({ method: 'GET', url });
        expect(response.headers['permissions-policy']).toBe(
          'camera=(self), microphone=(), geolocation=(), payment=()',
        );
      }
    } finally {
      await app.close();
    }
  });
});

function testLimits() {
  return {
    login: { max: 1000, windowMs: 60_000 },
    register: { max: 1000, windowMs: 60_000 },
    sensitive: { max: 1000, windowMs: 60_000 },
    invitation: { max: 1000, windowMs: 60_000 },
    export: { max: 1000, windowMs: 60_000 },
  };
}
