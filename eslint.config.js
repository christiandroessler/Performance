// Root-ESLint-Config (Phase 2, docs/ARCHITEKTUR.md): deckt core/web/worker in
// EINER Datei ab, da keines der drei Teilprojekte eigene Tooling-Dependencies
// braucht (kein Build-Schritt, siehe core/README.md "JavaScript statt
// TypeScript"). web/vendor/core ist eine 1:1-Kopie von core/src (siehe
// web/scripts/sync-core.mjs) und wird bewusst NICHT separat gelintet - jeder
// Fund dort waere ein Duplikat des core/-Funds.
import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  indexedDB: 'readonly',
  IDBKeyRange: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Worker: 'readonly',
  CompressionStream: 'readonly',
  DecompressionStream: 'readonly',
  Image: 'readonly',
  FormData: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  requestAnimationFrame: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  self: 'readonly',
  google: 'readonly',
  structuredClone: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  Response: 'readonly',
};

const workerRuntimeGlobals = {
  fetch: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  structuredClone: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
};

const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  structuredClone: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  Response: 'readonly',
};

const commonRules = {
  ...js.configs.recommended.rules,
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
  'no-console': 'off', // console.error/.warn sind im Projekt das etablierte Fehlerprotokoll (NFA-03: keine Tokens darin, siehe docs/MODULE.md)
};

export default [
  {
    ignores: ['**/node_modules/**', 'web/vendor/**', 'core/www/**', '**/*.min.js'],
  },
  {
    // Rechenkern: MUSS ohne jede Browser-/Node-/Worker-API laufen (NFA-06,
    // "reine Funktion, kein I/O") - bewusst NUR ES2022-Sprachglobals, keine
    // Umgebungs-Globals. Ein Fund hier waere ein echter Bruch der
    // Kernarchitektur (core/README.md), nicht nur ein Stilproblem.
    files: ['core/src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: {} },
    rules: commonRules,
  },
  {
    files: ['core/test/**/*.js', 'core/scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: nodeGlobals },
    rules: commonRules,
  },
  {
    files: ['web/src/**/*.js', 'web/sw.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browserGlobals },
    rules: commonRules,
  },
  {
    files: ['web/test/**/*.js', 'web/scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...nodeGlobals, ...browserGlobals } },
    rules: commonRules,
  },
  {
    files: ['worker/src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: workerRuntimeGlobals },
    rules: commonRules,
  },
  {
    files: ['worker/test/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...nodeGlobals, ...workerRuntimeGlobals } },
    rules: commonRules,
  },
  {
    files: ['*.config.js', '*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: nodeGlobals },
    rules: commonRules,
  },
];
