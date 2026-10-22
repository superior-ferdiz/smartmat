import { describe, expect, it, vi } from 'vitest';
import { cameraSupport, problemFromError, stopStream } from './camera';
import { scanFormat } from './detector';

describe('FR-SCAN-001 camera support', () => {
  const nav = (mediaDevices: unknown) => ({ mediaDevices }) as unknown as Navigator;

  it('http (not a secure page) comes first: browsers hide the camera there', () => {
    expect(
      cameraSupport({ isSecureContext: false, navigator: nav({ getUserMedia: () => null }) }),
    ).toBe('insecure');
  });

  it('no getUserMedia → unsupported; with it → nothing wrong', () => {
    expect(cameraSupport({ isSecureContext: true, navigator: nav(undefined) })).toBe('unsupported');
    expect(cameraSupport({ isSecureContext: true, navigator: nav({}) })).toBe('unsupported');
    expect(
      cameraSupport({ isSecureContext: true, navigator: nav({ getUserMedia: () => null }) }),
    ).toBeNull();
  });
});

describe('FR-SCAN-001 getUserMedia errors', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['NotFoundError', 'noCamera'],
    ['OverconstrainedError', 'noCamera'],
    ['DevicesNotFoundError', 'noCamera'],
    ['NotReadableError', 'failed'],
    ['AbortError', 'failed'],
  ])('%s → %s', (name, problem) => {
    expect(problemFromError(new DOMException('x', name))).toBe(problem);
  });

  it('anything else is "failed"', () => {
    expect(problemFromError(new Error('chunk failed'))).toBe('failed');
    expect(problemFromError('nope')).toBe('failed');
  });
});

describe('camera helpers', () => {
  it('stopStream stops every track (the camera light goes off)', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    stopStream({ getTracks: () => tracks } as unknown as MediaStream);
    expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(() => stopStream(null)).not.toThrow();
  });

  it('scanFormat only knows the four retail formats', () => {
    expect(scanFormat('upc_e')).toBe('upc_e');
    expect(scanFormat('ean_13')).toBe('ean_13');
    expect(scanFormat('qr_code')).toBeUndefined();
  });
});
