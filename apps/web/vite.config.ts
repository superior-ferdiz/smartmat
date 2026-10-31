import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API (apps/api). The browser only talks to this Vite server, which forwards /api, so the session
// cookie is first-party and no CORS is needed. Playwright points the preview server at a separate
// API instance with its own database.
const apiTarget = process.env.SMARTMAT_API_URL ?? 'http://127.0.0.1:3100';
const proxy = { '/api': { target: apiTarget } };

export default defineConfig({
  plugins: [react()],
  server: {
    // Only reachable from this machine. It also hosts production sites, so the dev server
    // must not listen on public interfaces.
    host: '127.0.0.1',
    port: 5173,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy,
  },
  css: {
    modules: {
      // Readable class names in development, short hashes in production builds.
      generateScopedName:
        process.env.NODE_ENV === 'production' ? '[hash:base64:6]' : '[name]__[local]',
    },
  },
});
