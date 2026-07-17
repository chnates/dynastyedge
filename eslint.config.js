// ESLint v9 flat config — the CI lint gate (npm run lint = `eslint src scripts`).
// Scope is deliberately src/ + scripts/ only: tests/ run under `npm test` and
// the config itself has no lint surface worth gating.
//
// Globals are hand-written literals instead of importing the `globals` package:
// package.json declares exactly the two owner-approved devDependencies (eslint,
// eslint-plugin-react-hooks), and `globals` is only a transitive dep — importing
// it would rely on hoisting. Add a missing global here rather than inline-disabling
// no-undef at a call site.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  crypto: 'readonly',
  FileReader: 'readonly',
  Blob: 'readonly',
  CustomEvent: 'readonly',
  IntersectionObserver: 'readonly',
  ResizeObserver: 'readonly',
}

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  AbortController: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  AbortSignal: 'readonly',
  Buffer: 'readonly',
}

export default [
  // App source: browser environment, JSX.
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: browserGlobals,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      // Core ESLint's scope analysis doesn't count JSX references, so every
      // component used only in JSX reads as "unused". The capitalized-name
      // ignore pattern (same as Vite's React template) keeps component
      // imports clean while still catching lowercase unused variables.
      // argsIgnorePattern covers the same blindness for destructured component
      // props (e.g. `function Row({ Icon }) { … <Icon /> … }`).
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^[A-Z_]' }],
      // Both at error severity — a warning would not fail CI.
      // exhaustive-deps is the single highest-value rule for this codebase
      // (memoization correctness across LeagueContext and the hook layer).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // Pipeline scripts: Node ESM, no JSX, no React.
  {
    files: ['scripts/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
]
