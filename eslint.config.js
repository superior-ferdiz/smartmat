import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import i18next from 'eslint-plugin-i18next';

export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/coverage',
      'playwright-report',
      'test-results',
      'docs',
      'apps/api/src/generated',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // React app: hooks rules, accessibility rules and no hard-coded UI text (NFR-UX-004).
  {
    files: ['apps/web/src/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
      i18next,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // role="list" on <ul>/<ol> is deliberate: Safari/VoiceOver drops list semantics when list-style is none.
      'jsx-a11y/no-redundant-roles': ['error', { ul: ['list'], ol: ['list'] }],
      // Any text written directly in JSX must come from the translation files instead.
      'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }],
    },
  },

  // Tests may contain literal strings and query by visible text.
  {
    files: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**', 'e2e/**'],
    rules: {
      'i18next/no-literal-string': 'off',
    },
  },
);
