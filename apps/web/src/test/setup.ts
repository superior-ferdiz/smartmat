import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { initI18n, i18n } from '../i18n';

initI18n('nb-NO');

// A few test files run in the plain Node environment (they only read files); skip the DOM setup there.
const hasDom = typeof window !== 'undefined';

if (hasDom) {
  // jsdom does not implement scrolling.
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  window.scrollTo = () => {};
}

afterEach(async () => {
  if (hasDom) {
    cleanup();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  }
  if (i18n.language !== 'nb-NO') await i18n.changeLanguage('nb-NO');
});
