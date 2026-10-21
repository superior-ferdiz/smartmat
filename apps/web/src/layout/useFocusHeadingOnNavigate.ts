import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router';

/**
 * After client-side navigation, move focus to the new page's <h1>. Screen readers then announce the
 * page, and keyboard users continue from the top of the content instead of the menu.
 * Not on the first render: then the browser's normal start position is right.
 */
export function useFocusHeadingOnNavigate(mainRef: RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.querySelector<HTMLElement>('h1')?.focus();
  }, [pathname, mainRef]);
}
