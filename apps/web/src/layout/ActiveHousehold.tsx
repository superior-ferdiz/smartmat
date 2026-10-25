import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HOUSEHOLD_PATH } from '../app/navigation';
import { useSession } from '../auth/session';
import styles from './ActiveHousehold.module.css';

/**
 * Spec 10 (FR-HH-004): with more than one household, every page says which one it shows and saves to, so
 * nothing is added to the wrong one by mistake. Hidden for a user with one household (most users).
 */
export function ActiveHousehold() {
  const { t } = useTranslation();
  const { data } = useSession();
  const user = data?.user;
  if (!user || user.households.length < 2) return null;
  const name = user.households.find((h) => h.id === user.householdId)?.name ?? '';
  return (
    <p className={styles.bar}>
      <span className={styles.name}>{t('household.activeIn', { name })}</span>
      <Link to={HOUSEHOLD_PATH}>{t('household.change')}</Link>
    </p>
  );
}
