import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from '../test/mockApi';
import { apiFetch, ApiError, NETWORK_ERROR, setCsrfToken } from './client';

afterEach(() => {
  vi.restoreAllMocks();
  setCsrfToken(null);
});

describe('apiFetch', () => {
  it('sends the CSRF token on changing requests only (NFR-SEC-005)', async () => {
    setCsrfToken('token-123');
    const requests = mockApi(() => ({ status: 200, body: {} }));
    await apiFetch('/me');
    await apiFetch('/me', { method: 'PATCH', body: { displayName: 'Kari' } });
    expect(requests[0]?.headers['x-csrf-token']).toBeUndefined();
    expect(requests[1]?.headers['x-csrf-token']).toBe('token-123');
    expect(requests[1]?.headers['content-type']).toBe('application/json');
  });

  it('uses same-origin credentials, so the session cookie goes along', async () => {
    mockApi(() => ({ status: 200, body: {} }));
    await apiFetch('/auth/session');
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ credentials: 'same-origin' });
  });

  it('turns an error response into ApiError with the code and field keys', async () => {
    mockApi(() => ({
      status: 400,
      body: { error: { code: 'errors.validation', fields: { email: 'validation.email.invalid' } } },
    }));
    const error = await apiFetch('/auth/login', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'errors.validation',
      fields: { email: 'validation.email.invalid' },
    });
  });

  it('an unexpected error body becomes errors.internal, never raw server text', async () => {
    mockApi(() => ({ status: 502, body: '<html>Bad gateway</html>' }));
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 502, code: 'errors.internal' });
  });

  it('no connection becomes errors.network', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiFetch('/me')).rejects.toMatchObject({ status: 0, code: NETWORK_ERROR });
  });

  it('204 gives undefined', async () => {
    mockApi(() => ({ status: 204 }));
    await expect(apiFetch('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });
});
