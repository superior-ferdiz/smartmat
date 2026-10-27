import { createElement, lazy, Suspense, type ComponentType } from 'react';
import { LoadingState } from '../components/LoadingState/LoadingState';

/*
 * Spec 13 (NFR-PERF-001): every page is its own file in the build, fetched the first time it is shown. Before this,
 * all pages were in one 881 kB file that every visitor downloaded before seeing anything.
 *
 * `preload()` fetches a page ahead of time. Once loaded, the page renders directly (no Suspense round): the web unit
 * tests preload every page in their setup, so they behave as before, and a page opened a second time never flashes
 * the loading state.
 */

export interface LazyPage {
  (): ReturnType<typeof createElement>;
  preload(): Promise<void>;
}

export function lazyPage<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  name: keyof M & string,
): LazyPage {
  let Loaded: ComponentType | null = null;
  const resolve = async () => {
    const module = await load();
    Loaded = module[name] as ComponentType;
    return { default: Loaded };
  };
  const Lazy = lazy(resolve);
  const Page = () =>
    Loaded
      ? createElement(Loaded)
      : createElement(Suspense, { fallback: createElement(LoadingState) }, createElement(Lazy));
  Page.displayName = `Lazy(${name})`;
  Page.preload = async () => {
    await resolve();
  };
  return Page;
}
