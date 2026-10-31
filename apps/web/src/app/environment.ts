/*
 * Build-time settings (Vite env, ADR-0015). Read when called, not when the module loads, so tests can stub them.
 * Locally neither is set: no banner, registration open. The test environment's image is built with
 * VITE_SMARTMAT_ENVIRONMENT=staging and VITE_REGISTRATION_OPEN=false (docker/staging/Dockerfile).
 */

/** The closed test environment: a banner says to use test data only. */
export function isStagingBuild(): boolean {
  return import.meta.env.VITE_SMARTMAT_ENVIRONMENT === 'staging';
}

/** Whether the "create account" page and link are shown. The server decides for real (REGISTRATION_OPEN). */
export function isRegistrationOpen(): boolean {
  return import.meta.env.VITE_REGISTRATION_OPEN !== 'false';
}
