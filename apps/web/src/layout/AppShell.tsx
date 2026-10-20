import { useEffect, useRef } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BottomNav } from './BottomNav';
import { SideNav } from './SideNav';
import { TopBar } from './TopBar';
import styles from './AppShell.module.css';

/**
 * The frame around every page. Layout is a CSS Grid with named areas (see AppShell.module.css):
 * phone = top bar / content / bottom nav, wide screen = side nav | content.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  // After client-side navigation, move focus to the new page's <h1>. Screen readers then announce the
  // page, and keyboard users continue from the top of the content instead of the menu.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [pathname]);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#hovedinnhold">
        {t('app.skipToContent')}
      </a>
      <TopBar className={styles.top} />
      <SideNav className={styles.side} />
      <main id="hovedinnhold" ref={mainRef} className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
      <BottomNav className={styles.bottom} />
      <ScrollRestoration />
    </div>
  );
}
