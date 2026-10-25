import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SessionUser } from '@smartmat/shared';
import { useToast } from '../components/Toast/toastContext';
import { useCurrentUser } from '../auth/session';

/**
 * Spec 10 (FR-HH-004/005): keeps the browser's cache in step with the user's memberships. When the active
 * household changes – the user switched, left, was removed or the household was deleted – everything cached
 * for the households the user no longer looks at is dropped, so nothing of a household one has left stays in
 * memory. Losing a membership also says so and goes to the overview. Renders nothing.
 *
 * The server is still the protection: it checks the membership on every request (NFR-SEC-001). A 404 from any
 * request makes the session refetch (app/queryClient.ts), which is how a removal is noticed here.
 */
export function HouseholdWatcher() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { show } = useToast();
  const previous = useRef<SessionUser | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = user;
    if (!before) return;
    const stillIn = new Set(user.households.map((h) => h.id));
    for (const old of before.households) {
      if (old.id !== user.householdId && (!stillIn.has(old.id) || old.id === before.householdId)) {
        queryClient.removeQueries({ queryKey: ['household', old.id] });
      }
    }
    if (before.householdId !== user.householdId && !stillIn.has(before.householdId)) {
      const name = before.households.find((h) => h.id === before.householdId)?.name;
      show({
        variant: 'info',
        message: name ? t('household.lost', { name }) : t('household.lostUnknown'),
      });
      void navigate('/', { replace: true });
    }
  }, [user, queryClient, navigate, show, t]);

  return null;
}
