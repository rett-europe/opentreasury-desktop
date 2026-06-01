import { configDefaults, defineConfig } from 'vitest/config';

// Co-located unit test config — ADR-002 §4 / §7.3.
// Integration tests use a separate config at ./vitest.integration.config.ts.
//
// `environment: 'node'` is the default; React component tests declare
// `// @vitest-environment jsdom` at the top of the file. This keeps pure-
// logic tests fast while letting component tests run under jsdom.
//
// The `*.test.ts(x)` include glob also matches the `*.integration.test.ts(x)`
// suffix, so integration tests are explicitly excluded here: they run only in
// the integration lane (`npm run test:integration`). This keeps the fast unit
// lane free of slow/heavy integration work — notably the 100k-row XLSX memory
// gate, which additionally requires `--expose-gc` (supplied only by the
// integration config) to measure a deterministic heap.
export default defineConfig({
  test: {
    include: ['app/src/**/*.test.ts', 'app/src/**/*.test.tsx'],
    exclude: [
      ...configDefaults.exclude,
      'app/src/**/*.integration.test.ts',
      'app/src/**/*.integration.test.tsx',
    ],
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
