import { defineConfig } from 'vitest/config';

// Co-located unit test config — ADR-002 §4 / §7.3.
// Integration tests use a separate config at ./vitest.integration.config.ts (TODO).
//
// `environment: 'node'` is the default; React component tests declare
// `// @vitest-environment jsdom` at the top of the file. This keeps pure-
// logic tests fast while letting component tests run under jsdom.
export default defineConfig({
  test: {
    include: ['app/src/**/*.test.ts', 'app/src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    css: true,
    setupFiles: ['app/src/renderer/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
