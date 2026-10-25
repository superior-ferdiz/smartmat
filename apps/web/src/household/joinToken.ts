import { tokenFromInvitationText } from '@smartmat/shared';

/*
 * Spec 10 (FR-HH-002): the invitation token while someone logs in or registers first. sessionStorage, so it
 * stays in this tab only and is gone when the tab closes; it is removed as soon as the invitation is accepted
 * or declined. Storage can be blocked (private mode), so every access is guarded – then the person opens the
 * link again after logging in.
 */
const KEY = 'smartmat.invitation';

export function rememberToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Storage blocked: nothing to remember.
  }
}

export function rememberedToken(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    return value ? tokenFromInvitationText(value) : null;
  } catch {
    return null;
  }
}

export function forgetToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing to forget.
  }
}
