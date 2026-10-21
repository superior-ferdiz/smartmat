import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { initI18n, i18n } from '../i18n';

initI18n('nb-NO');

// A few test files run in the plain Node environment (they only read files); skip the DOM setup there.
const hasDom = typeof window !== 'undefined';

if (hasDom) {
  // jsdom does not implement scrolling.
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.scrollTo = () => {};

  // jsdom has no showModal/close for <dialog>. This stand-in only toggles `open` and fires "close";
  // the real modal behaviour (focus trap, Esc, backdrop) is tested in Playwright.
  if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

afterEach(async () => {
  // Undo fetch mocks (renderApp installs one when a test did not).
  vi.restoreAllMocks();
  if (hasDom) {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  }
  if (i18n.language !== 'nb-NO') await i18n.changeLanguage('nb-NO');
});
