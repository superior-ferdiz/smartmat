import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Only reachable from this machine. It also hosts production sites, so the dev server
    // must not listen on public interfaces.
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  css: {
    modules: {
      // Readable class names in development, short hashes in production builds.
      generateScopedName:
        process.env.NODE_ENV === 'production' ? '[hash:base64:6]' : '[name]__[local]',
    },
  },
});
