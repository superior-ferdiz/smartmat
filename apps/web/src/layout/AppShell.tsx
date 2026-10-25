import { useRef } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ActiveHousehold } from './ActiveHousehold';
import { BottomNav } from './BottomNav';
import { SideNav } from './SideNav';
import { StagingBanner } from './StagingBanner';
import { TopBar } from './TopBar';
import { useFocusHeadingOnNavigate } from './useFocusHeadingOnNavigate';
import styles from './AppShell.module.css';

/**
 * The frame around every page. Layout is a CSS Grid with named areas (see AppShell.module.css):
 * phone = top bar / content / bottom nav, wide screen = side nav | content.
 */
export function AppShell() {
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  useFocusHeadingOnNavigate(mainRef);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#hovedinnhold">
        {t('app.skipToContent')}
      </a>
      <TopBar className={styles.top} />
      <SideNav className={styles.side} />
      <main id="hovedinnhold" ref={mainRef} className={styles.main} tabIndex={-1}>
        <StagingBanner />
        <ActiveHousehold />
        <Outlet />
      </main>
      <BottomNav className={styles.bottom} />
      <ScrollRestoration />
    </div>
  );
}
