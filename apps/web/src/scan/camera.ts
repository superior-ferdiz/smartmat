/*
 * FR-SCAN-001: what can go wrong with the camera, each with its own message (spec 07). Kept apart from the
 * component so the rules can be unit tested without a camera.
 */

export const CAMERA_PROBLEMS = ['insecure', 'unsupported', 'denied', 'noCamera', 'failed'] as const;
export type CameraProblem = (typeof CAMERA_PROBLEMS)[number];

/** Checked before asking for the camera: browsers only allow it on HTTPS or localhost. */
export function cameraSupport(
  win: Pick<Window, 'isSecureContext' | 'navigator'> = window,
): CameraProblem | null {
  if (!win.isSecureContext) return 'insecure';
  if (typeof win.navigator.mediaDevices?.getUserMedia !== 'function') return 'unsupported';
  return null;
}

/** getUserMedia's error names (MDN), turned into the states the page shows. */
export function problemFromError(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'OverconstrainedError' ||
    name === 'DevicesNotFoundError'
  ) {
    return 'noCamera';
  }
  return 'failed';
}

/** The back camera on phones; any camera on a laptop. No sound. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
