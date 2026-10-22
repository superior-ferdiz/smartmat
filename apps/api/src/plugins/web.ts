import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/*
 * The closed test environment (ADR-0015): the API also serves the built web app, so the page and /api share one
 * origin (first-party cookie, no CORS). Locally, Vite serves the page instead and this is not used.
 */

/** 'sha256-…' for each inline <script> in index.html (the theme script), so the CSP needs no 'unsafe-inline'. */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) =>
      `'sha256-${createHash('sha256')
        .update(match[1] ?? '')
        .digest('base64')}'`,
  );
}

/** The Content-Security-Policy for the web app. */
export function webCsp(scriptHashes: readonly string[]) {
  return {
    defaultSrc: ["'self'"],
    // 'wasm-unsafe-eval': the fallback barcode reader is WebAssembly (spec 07); without it the browser refuses it.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'", ...scriptHashes],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    mediaSrc: ["'self'", 'blob:'],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    // Caddy already sends http to https (and HSTS is on); helmet's default would also break http://127.0.0.1 checks.
    upgradeInsecureRequests: null,
  };
}

/** Static files of the built web app. Client-side routes fall back to index.html in the 404 handler (errors.ts). */
export async function registerWebApp(app: FastifyInstance, distDir: string) {
  await app.register(fastifyStatic, {
    root: distDir,
    prefix: '/',
    wildcard: false,
    index: false,
    // Built assets have a hash in the name and never change; index.html must always be fresh.
    setHeaders(res, path) {
      res.header(
        'cache-control',
        path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
}

export function readIndexHtml(distDir: string) {
  return readFileSync(join(distDir, 'index.html'), 'utf8');
}

/** A page route (/matlager, /skann?kode=…) – not the API, not a file. Those get index.html. */
export function isPageRequest(method: string, url: string, apiPrefix: string) {
  return (
    (method === 'GET' || method === 'HEAD') &&
    !url.startsWith(`${apiPrefix}/`) &&
    url !== apiPrefix &&
    !url.startsWith(`${apiPrefix}?`)
  );
}
