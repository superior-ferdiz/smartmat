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
