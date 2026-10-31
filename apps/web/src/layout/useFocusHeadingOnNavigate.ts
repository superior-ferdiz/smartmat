import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/** How long to wait for a page that is still loading (its file, or its data) to show its <h1>. */
const WAIT_FOR_HEADING_MS = 10_000;

/**
 * After client-side navigation, move focus to the new page's <h1>. Screen readers then announce the
 * page, and keyboard users continue from the top of the content instead of the menu.
 * Not on the first render: then the browser's normal start position is right.
 *
 * Spec 13: pages are loaded lazily, so the first time a page is opened its <h1> is not there yet when the location
 * changes. The hook then waits for it (MutationObserver) instead of giving up – before this, focus was left behind on
 * the link that was clicked (found by Playwright, not by the unit tests, which preload every page).
 */
export function useFocusHeadingOnNavigate(mainRef: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const main = mainRef.current;
    if (!main) return;
    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>('h1');
      heading?.focus();
      return heading !== null;
    };
    if (focusHeading()) return;
    const observer = new MutationObserver(() => {
      if (focusHeading()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = window.setTimeout(() => observer.disconnect(), WAIT_FOR_HEADING_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [pathname, mainRef]);
}
