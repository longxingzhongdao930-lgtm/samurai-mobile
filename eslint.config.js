import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'assets-src/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tools/assets/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['server/**/*.js', 'server/**/*.mjs', 'tests/**/*.mjs', 'tools/*.mjs', 'build/**/*.js', 'eslint.config.js', 'vite.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    // The e2e callbacks run inside the page (`page.evaluate`), against the
    // globals the game exposes there (`app`, `settings`, the test's own hooks).
    files: ['tests/**/*.mjs', 'tools/*.mjs'],
    rules: { 'no-undef': 'off' }
  }
];
