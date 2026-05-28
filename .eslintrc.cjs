/* eslint-env node */
// ADR-002 §4.1 / §8 — module boundaries enforced at lint time.
// ADR-001 C6, C7, C13, C15 back these rules: renderer isolation, crypto isolation,
// IPC validation, native dep allowlist.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'import', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: { version: 'detect' },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx', '.cts', '.mts'],
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: [
          './tsconfig.json',
          './app/src/main/tsconfig.json',
          './app/src/preload/tsconfig.json',
          './app/src/renderer/tsconfig.json',
          './app/src/core/tsconfig.json',
          './app/src/crypto/tsconfig.json',
          './app/src/storage/tsconfig.json',
          './app/src/shared/tsconfig.json',
        ],
      },
      node: true,
    },
  },
  rules: {
    // ADR-002 §4.1 — physical module boundaries.
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // Renderer is sandboxed — no Node, no main, no crypto, no storage, no core.
          {
            target: './app/src/renderer',
            from: './app/src/main',
            message:
              'renderer → main is FORBIDDEN. Use contextBridge IPC via preload (ADR-001 C6).',
          },
          {
            target: './app/src/renderer',
            from: './app/src/crypto',
            message:
              'renderer → crypto is FORBIDDEN. Crypto is main-process only (ADR-001 C5, C6).',
          },
          {
            target: './app/src/renderer',
            from: './app/src/storage',
            message: 'renderer → storage is FORBIDDEN. Storage I/O is main-process only.',
          },
          {
            target: './app/src/renderer',
            from: './app/src/core',
            message: 'renderer → core is FORBIDDEN. Core runs in main; renderer calls via IPC.',
          },
          // Preload may only import from shared (typed contracts) — never from main or crypto.
          {
            target: './app/src/preload',
            from: './app/src/main',
            message:
              'preload → main is FORBIDDEN. Preload is a thin contextBridge only (ADR-001 C6).',
          },
          {
            target: './app/src/preload',
            from: './app/src/crypto',
            message: 'preload → crypto is FORBIDDEN (ADR-001 C5).',
          },
          {
            target: './app/src/preload',
            from: './app/src/core',
            message: 'preload → core is FORBIDDEN.',
          },
          {
            target: './app/src/preload',
            from: './app/src/storage',
            message: 'preload → storage is FORBIDDEN.',
          },
          // Core, crypto, storage must be Electron-free and main-process-free.
          {
            target: './app/src/core',
            from: './app/src/main',
            message: 'core → main is FORBIDDEN. Core is Electron-free (ADR-002 §2.4).',
          },
          {
            target: './app/src/crypto',
            from: './app/src/main',
            message: 'crypto → main is FORBIDDEN. Crypto is pure (ADR-002 §2.5).',
          },
          {
            target: './app/src/storage',
            from: './app/src/main',
            message: 'storage → main is FORBIDDEN.',
          },
        ],
      },
    ],

    // No Electron import outside main/ and preload/.
    // (Belt and suspenders: the zones above forbid the reverse; this forbids direct electron imports.)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['electron', 'electron/*'],
            message: 'electron may only be imported from src/main or src/preload (ADR-002 §4.1).',
          },
        ],
      },
    ],

    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],

    'react/react-in-jsx-scope': 'off',
  },
  overrides: [
    // Renderer tsconfig excludes @types/node; re-declare here for clarity.
    {
      files: ['app/src/renderer/**/*.{ts,tsx}'],
      excludedFiles: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'fs', message: 'Renderer has no fs access (ADR-001 C7).' },
              { name: 'node:fs', message: 'Renderer has no fs access.' },
              { name: 'path', message: 'Renderer has no path access.' },
              { name: 'node:path', message: 'Renderer has no path access.' },
              { name: 'electron', message: 'Renderer cannot import electron (ADR-001 C6).' },
            ],
          },
        ],
        // Anti-regression for the trial.3.12 frozen-inputs bug (PR #338).
        // window.confirm / window.alert / window.prompt corrupt Chromium's
        // keyboard-input routing to the renderer when called from inside an
        // open <dialog>. Use the ConfirmDialog component instead.
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "CallExpression[callee.object.name='window'][callee.property.name=/^(confirm|alert|prompt)$/]",
            message:
              'window.confirm/alert/prompt corrupt Electron renderer keyboard-input state and freeze every input in the app. Use the ConfirmDialog component (app/src/renderer/components/ConfirmDialog) instead.',
          },
          {
            // Catch the unqualified form too — `confirm('…')` resolves to
            // window.confirm at runtime in the renderer.
            selector:
              "CallExpression[callee.type='Identifier'][callee.name=/^(confirm|alert|prompt)$/]",
            message:
              'Bare confirm/alert/prompt resolve to window.confirm/alert/prompt, which corrupt Electron renderer keyboard-input state. Use the ConfirmDialog component instead.',
          },
        ],
      },
    },
    // Crypto module: allowlist imports per ADR-001 C15.
    {
      files: ['app/src/crypto/**/*.ts'],
      excludedFiles: ['**/*.test.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['electron', 'electron/*', 'fs', 'node:fs', 'path', 'node:path'],
                message:
                  'crypto module is Electron-free and fs-free. Allowed deps: sodium-native, @napi-rs/keyring, node:crypto, node:buffer (ADR-001 C15).',
              },
            ],
          },
        ],
      },
    },
    // Main + preload are the ONLY places electron imports are allowed. Relax the
    // top-level electron ban here (ADR-002 §4.1).
    {
      files: ['app/src/main/**/*.{ts,tsx}', 'app/src/preload/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    // Node scripts (.mjs): plain Node environment, not TypeScript-checked.
    {
      files: ['scripts/**/*.mjs'],
      env: { node: true, es2022: true },
      rules: {
        // .mjs scripts are not TypeScript — disable TS-specific rules.
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        // Buffer, process, console are Node globals provided by env:node above.
        'no-undef': 'off',
        // import/default is not useful for CJS-wrapped packages in scripts.
        'import/default': 'off',
        'import/no-named-as-default-member': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules',
    'dist',
    'out',
    '.vite',
    'coverage',
    'playwright-report',
    'prototype/',
    'app/src/renderer/locales/',
  ],
};
