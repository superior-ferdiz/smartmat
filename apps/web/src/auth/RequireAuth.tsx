import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '../components/ErrorState/ErrorState';
import { LoadingState } from '../components/LoadingState/LoadingState';
import { LOGIN_PATH } from '../app/navigation';
import { HouseholdWatcher } from '../household/HouseholdWatcher';
import { loginPathFor, safeNextPath } from './safeNextPath';
import { useSession } from './session';

/**
 * Wraps every page that needs a logged-in user. This only decides what to *show*: the real protection
 * is on the server, which checks the session and household membership on every request (NFR-SEC-001).
 */
export function RequireAuth() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <LoadingState label={t('auth.checkingSession')} />;
  // Only the first check: if a later refetch fails (spec 10 refetches after a 404), the session we have
  // still counts, and the page stays.
  if (session.isError && session.data === undefined) {
    return (
      <ErrorState
        description={t('auth.sessionCheckFailed')}
        onRetry={() => void session.refetch()}
      />
    );
  }
  if (!session.data) {
    return (
      <Navigate to={loginPathFor(LOGIN_PATH, `${location.pathname}${location.search}`)} replace />
    );
  }
  return (
    <>
      <HouseholdWatcher />
      <Outlet />
    </>
  );
}

/**
 * Login and registration: someone who is logged in is sent on to the app – to ?neste if it is a safe
 * path inside the app. This is also what moves the user on right after a successful login: the
 * session lands in the cache, and this component redirects.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  const [params] = useSearchParams();
  if (session.isPending) return <LoadingState label={t('auth.checkingSession')} />;
  if (session.data) return <Navigate to={safeNextPath(params.get('neste'))} replace />;
  return <>{children}</>;
}
